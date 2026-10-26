/**
 * 共享目录浏览页（design.md 2.4.4，TASK-S4-03）
 * TopBar 工具组：Breadcrumb（currentPath 解析，点击祖先段跳转）+ SearchField
 * （输入即过滤）+ SortMenu（BottomSheet 四字段+升降序，缩写徽章持久可见）
 * + 多选入口（icon-multiselect）。
 * 状态呈现：SessionStatusStrip（NETWORK_LOST/AUTH_FAILED 持久 Banner+重连，
 * spec 5.4.1-R11）→ FileList（虚拟化/SkeletonList/双 EmptyState）→
 * MultiSelectBar（多选态底部固定条）。
 * 交互：目录点击 enterDirectory / 文件点击 FileActionSheet 分发（spec 5.4.1-R7；
 * S4-05 交付前为占位菜单）/ 长按进入多选+选中首项。
 * 页面挂载且已连接时自动加载当前目录（connected 事实态驱动，不乐观加载）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Breadcrumb } from '../../components/Breadcrumb';
import { Icon } from '../../icons/Icon';
import { useBrowseStore } from '../../../state/browseStore';
import { useSmbConnectionStore } from '../../../state/smbConnectionStore';
import { useSmbProfilesStore } from '../../../state/smbProfilesStore';
import { useEditSessionStore } from '../../../state/editSessionStore';
import { useOperationStore, OPERATION_CAPABILITIES } from '../../../state/operationStore';
import { sortedAndFilteredFiles } from '../../../state/browseStore';
import type { SmbFileEntry } from '../../../adapter/smb/SmbPlugin';
import { SearchField } from './SearchField';
import { SortMenu } from './SortMenu';
import { SessionStatusStrip } from './SessionStatusStrip';
import { StatusBanner } from '../../components/StatusBanner';
import { FileList } from './FileList';
import { MultiSelectBar } from './MultiSelectBar';
import { OperationProgressPanel } from './OperationProgressPanel';
import { FileActionSheet } from '../FileActionSheet';
import type { OperationTask } from '../../../state/operationStore';
import styles from './style.module.css';

/** currentPath（'\' 分隔，原生风格）→ Breadcrumb 段解析 */
function buildSegments(currentPath: string, rootName: string) {
  const segments = [{ name: rootName, path: '' }];
  if (currentPath) {
    const parts = currentPath.split('\\').filter(Boolean);
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}\\${part}` : part;
      segments.push({ name: part, path: acc });
    }
  }
  return segments;
}

export function BrowsePage() {
  const currentPath = useBrowseStore((s) => s.currentPath);
  const files = useBrowseStore((s) => s.files);
  const loading = useBrowseStore((s) => s.loading);
  const sort = useBrowseStore((s) => s.sort);
  const searchQuery = useBrowseStore((s) => s.searchQuery);
  const selection = useBrowseStore((s) => s.selection);
  const selectionMode = useBrowseStore((s) => s.selectionMode);
  const enterDirectory = useBrowseStore((s) => s.enterDirectory);
  const refresh = useBrowseStore((s) => s.refresh);
  const loadError = useBrowseStore((s) => s.loadError);
  const setSort = useBrowseStore((s) => s.setSort);
  const setSearchQuery = useBrowseStore((s) => s.setSearchQuery);
  const enterSelectionMode = useBrowseStore((s) => s.enterSelectionMode);
  const exitSelectionMode = useBrowseStore((s) => s.exitSelectionMode);
  const toggleSelection = useBrowseStore((s) => s.toggleSelection);

  const connectionState = useSmbConnectionStore((s) => s.state);
  const profiles = useSmbProfilesStore((s) => s.profiles);
  const activeProfileId = useSmbConnectionStore((s) => s.activeProfileId);

  /** FileActionSheet 上下文（单文件/批量共用，TASK-S4-05 正式菜单） */
  const [pendingFiles, setPendingFiles] = useState<SmbFileEntry[]>([]);

  const handleDirectOpen = useCallback((file: SmbFileEntry) => {
    if (!activeProfileId) return;
    void useEditSessionStore.getState().openFile(activeProfileId, file.path);
  }, [activeProfileId]);
  /** 同目录既有名（重命名重名校验输入） */
  const siblingNames = useMemo(() => files.map((f) => f.name), [files]);

  const loadedOnceRef = useRef(false);
  useEffect(() => {
    // 挂载且已连接：自动加载当前目录（仅一次；重连恢复另由下方重连感知 effect 驱动）
    if (connectionState === 'connected' && !loadedOnceRef.current) {
      loadedOnceRef.current = true;
      void refresh();
    }
  }, [connectionState, refresh]);

  // ===== TASK-S5-06-C（PM 授权）：重连成功后自动刷新列表 =====
  // 根因（s506c-rootcause.json 铁证）：挂载 effect 的 loadedOnceRef 单次守卫使
  // 重连后再变 connected 也不触发 refresh——断网期失败清空的列表残留空态，
  // 需用户切视图/重入目录才恢复（Gate-UI-4 §7.5 观察项的代码根源）。
  // 修复语义：①仅"非 connected → connected"迁移沿触发（connecting 中间态不刷
  // ——SMB 尚未可用；同一次重连 state 序列只产生一次 connected 迁移=天然防重复）；
  // ②仅 currentPath 非空（存在用户浏览上下文）时刷新——首次连接（无路径）由
  // 上方挂载 effect 处理，避免双请求；③refresh 同目录语义保留既有数据与导航
  // 状态（PM 授权第 5 条），失败走 loadError 如实呈现（下方 Banner）。
  const prevConnectionRef = useRef(connectionState);
  useEffect(() => {
    const prev = prevConnectionRef.current;
    prevConnectionRef.current = connectionState;
    if (
      prev !== 'connected' &&
      connectionState === 'connected' &&
      currentPath !== ''
    ) {
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentPath 取 store 快照参触发判（非依赖）
  }, [connectionState, currentPath, refresh]);

  const rootName = useMemo(() => {
    const profile = profiles.find((p) => p.id === activeProfileId);
    return profile?.name ?? '共享目录';
  }, [profiles, activeProfileId]);

  const segments = useMemo(
    () => buildSegments(currentPath, rootName),
    [currentPath, rootName],
  );

  const visibleFiles = useMemo(
    () => sortedAndFilteredFiles(files, sort, searchQuery),
    [files, sort, searchQuery],
  );

  const handleNavigate = useCallback(
    (path: string) => {
      if (path === currentPath) return;
      void enterDirectory(path);
    },
    [currentPath, enterDirectory],
  );

  const handleEnterSelectionMode = useCallback(() => {
    if (visibleFiles.length === 0) return;
    enterSelectionMode(visibleFiles[0].path);
  }, [visibleFiles, enterSelectionMode]);

  const handleRowActivate = useCallback(
    (path: string) => {
      // 长按/多选态点击：非多选 → 进入多选并选中首项；多选 → 切换选中（spec 5.4.1-R6）
      if (selectionMode) toggleSelection(path);
      else enterSelectionMode(path);
    },
    [selectionMode, toggleSelection, enterSelectionMode],
  );

  const handleBatchAction = useCallback(
    (action: 'copy' | 'move' | 'delete') => {
      // 批量操作经 FileActionSheet 批量模式分发（TASK-S4-05：
      // DestinationPicker/删除双语义二次确认在 sheet 内完成）
      const selected = files.filter((f) => selection.has(f.path));
      if (selected.length === 0) return;
      void action;
      setPendingFiles(selected);
    },
    [selection, files],
  );

  /** 进度面板重试：同 targets/destination 重新入队（TASK-S4-06） */
  const handleRetry = useCallback(
    (task: OperationTask) => {
      const store = useOperationStore.getState();
      const paths = task.targets.map((t) => t.path);
      const destination = task.destination ?? '';
      switch (task.kind) {
        case 'copy':
          void store.enqueueCopy(paths, destination);
          break;
        case 'move':
          void store.enqueueMove(paths, destination);
          break;
        case 'rename':
          if (task.targets[0]) void store.executeRename(task.targets[0].path, task.targets[0].name);
          break;
        case 'delete':
        case 'batch':
        default:
          void store.executeDelete(paths, 'remote');
          break;
      }
    },
    [],
  );

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarNav}>
          <Breadcrumb segments={segments} onNavigate={handleNavigate} />
        </div>
        <div className={styles.toolbarActions}>
          <SearchField value={searchQuery} onChange={setSearchQuery} />
          <SortMenu sort={sort} onChange={setSort} />
          <button
            type="button"
            className={styles.multiselectTrigger}
            aria-label="多选"
            onClick={handleEnterSelectionMode}
          >
            <Icon name="icon-multiselect" size={20} />
          </button>
        </div>
      </div>
      <SessionStatusStrip connectionState={connectionState} />
      {/* TASK-S5-06-C（PM 授权第 5 条）：目录加载失败如实呈现（S4-01 交付的
          loadError 此前 UI 层零消费——刷新/进入失败以"目录为空"冒充，违反
          "不得将旧状态冒充最新服务器数据"）。加载成功时 store 已清 null。 */}
      {loadError && !loading && (
        <StatusBanner
          semantic="danger"
          icon="icon-x-circle"
          title={`目录加载失败：${loadError.userMessage}`}
          actions={[
            { label: '重试', variant: 'primary', onPress: () => void refresh() },
          ]}
        />
      )}
      <div className={styles.listArea}>
        <FileList
          files={files}
          loading={loading}
          sort={sort}
          searchQuery={searchQuery}
          selection={selection}
          selectionMode={selectionMode}
          onOpen={handleDirectOpen}
          onEnterDirectory={(path) => void enterDirectory(path)}
          onRowActivate={handleRowActivate}
          onClearSearch={() => setSearchQuery('')}
        />
      </div>
      {selectionMode && (
        <MultiSelectBar
          selectedCount={selection.size}
          batchOperationsEnabled={
            OPERATION_CAPABILITIES.copy || OPERATION_CAPABILITIES.move || OPERATION_CAPABILITIES.deleteRemote
          }
          onCancel={exitSelectionMode}
          onBatchAction={handleBatchAction}
        />
      )}
      <OperationProgressPanel onRetry={handleRetry} />
      <FileActionSheet
        entries={pendingFiles}
        source="remote"
        siblingNames={siblingNames}
        open={pendingFiles.length > 0}
        onDismiss={() => setPendingFiles([])}
      />
    </div>
  );
}