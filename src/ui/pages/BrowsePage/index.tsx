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
import { useBrowseContextStore } from '../../../state/browseContextStore';
import type { BrowseSort } from '../../../state/browseContextStore';
import { useSmbConnectionStore } from '../../../state/smbConnectionStore';
import { useSmbProfilesStore } from '../../../state/smbProfilesStore';
import { useEditSessionStore } from '../../../state/editSessionStore';
import { useOperationStore, OPERATION_CAPABILITIES } from '../../../state/operationStore';
import { useUiPrefsStore } from '../../../state/uiPrefsStore';
import { sortedAndFilteredFiles } from '../../../state/browseStore';
import SmbPlugin, { type SmbFileEntry } from '../../../adapter/smb/SmbPlugin';
import { SearchField } from './SearchField';
import { SortMenu } from './SortMenu';
import { ViewModeMenu } from './ViewModeMenu';
import { SegmentedControl } from '../../components/SegmentedControl';
import { BottomPathBar } from './BottomPathBar';
import { useBrowseHistory } from '../../hooks/useBrowseHistory';
import { SessionStatusStrip } from './SessionStatusStrip';
import { StatusBanner } from '../../components/StatusBanner';
import { FileList } from './FileList';
import { MultiSelectBar } from './MultiSelectBar';
import { OperationProgressPanel } from './OperationProgressPanel';
import { FileActionSheet } from '../FileActionSheet';
import { RenameDialog } from '../FileActionSheet/RenameDialog';
import { WritebackUnavailableBanner } from '../../components/WritebackUnavailableBanner';
import type { OperationTask } from '../../../state/operationStore';
import styles from './style.module.css';

/**
 * currentPath（'\' 分隔，原生风格）→ Breadcrumb 段解析（TASK-RP-04：rootPath 逻辑根感知）
 * - rootPath 未提供（undefined）→ 回退现状：根段 path='', currentPath 全量按 \\ 拆分（REQ-RP-07）
 * - rootPath 非空 → 根段 path=rootPath；currentPath 在 rootPath 之内时剥离前缀后拆分子段；
 *   currentPath 越出 rootPath 时仅显示根段（防御层 2，REQ-RP-06）
 */
function buildSegments(currentPath: string, rootName: string, rootPath?: string) {
  const segments = [{ name: rootName, path: rootPath || '' }];
  if (rootPath) {
    // rootPath 非空：检查 currentPath 是否在 rootPath 之内
    if (currentPath === rootPath || currentPath.startsWith(rootPath + '\\')) {
      // 剥离 rootPath 前缀后拆分子段
      const remainder = currentPath === rootPath ? '' : currentPath.slice(rootPath.length + 1);
      const parts = remainder.split('\\').filter(Boolean);
      let acc = rootPath;
      for (const part of parts) {
        acc = `${acc}\\${part}`;
        segments.push({ name: part, path: acc });
      }
    }
    // currentPath 越出 rootPath → 仅显示根段（防御层 2，REQ-RP-06）
    return segments;
  }
  // rootPath 未提供：现状逻辑（全量拆分 currentPath）
  if (currentPath && currentPath !== '/') {
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
  const selection = useBrowseStore((s) => s.selection);
  const selectionMode = useBrowseStore((s) => s.selectionMode);
  const enterSelectionMode = useBrowseStore((s) => s.enterSelectionMode);
  const exitSelectionMode = useBrowseStore((s) => s.exitSelectionMode);
  const toggleSelection = useBrowseStore((s) => s.toggleSelection);

  const viewMode = useUiPrefsStore((s) => s.viewMode);
  const setViewMode = useUiPrefsStore((s) => s.setViewMode);

  const connectionState = useSmbConnectionStore((s) => s.state);
  const profiles = useSmbProfilesStore((s) => s.profiles);
  const activeProfileId = useSmbConnectionStore((s) => s.activeProfileId);

  // per-profile 浏览上下文（TASK-MC-06，REQ-MC-03）
  const browseContexts = useBrowseContextStore((s) => s.contexts);
  const ctxEntry = activeProfileId ? browseContexts.get(activeProfileId) : undefined;
  const currentPath = ctxEntry?.currentPath ?? '';
  const files = ctxEntry?.files ?? [];
  const loading = ctxEntry?.loading ?? false;
  const loadError = ctxEntry?.loadError ?? null;
  const sort = ctxEntry?.sort ?? { field: 'name' as const, ascending: true };
  const searchQuery = ctxEntry?.searchQuery ?? '';

  const enterDirectory = useCallback(
    (path: string) => {
      if (!activeProfileId) return;
      void useBrowseContextStore.getState().enterDirectory(activeProfileId, path);
    },
    [activeProfileId],
  );
  const { canGoBack, canGoForward, goBack, goForward } = useBrowseHistory(currentPath, enterDirectory);
  const refresh = useCallback(() => {
    if (!activeProfileId) return;
    void useBrowseContextStore.getState().refresh(activeProfileId);
  }, [activeProfileId]);

  // ===== 操作完成自动刷新（与 LocalBrowsePage 保持一致）=====
  // 修复：SMB 删除/新建文件夹/重命名等远端操作完成后列表未刷新——已删除项残留，
  // 形似"操作失败"。订阅 recentTasks，终态（success/partial_failed/cancelled）时刷新。
  const recentTasks = useOperationStore((s) => s.recentTasks);
  const lastRefreshedTaskId = useRef<string | null>(null);
  useEffect(() => {
    const latest = recentTasks[0];
    if (!latest) return;
    if (lastRefreshedTaskId.current === latest.id) return;
    if (
      latest.status === 'success' ||
      latest.status === 'partial_failed' ||
      latest.status === 'cancelled'
    ) {
      lastRefreshedTaskId.current = latest.id;
      void refresh();
    }
  }, [recentTasks, refresh]);
  const setSort = useCallback(
    (s: BrowseSort) => {
      if (!activeProfileId) return;
      useBrowseContextStore.getState().setSort(activeProfileId, s);
    },
    [activeProfileId],
  );
  const setSearchQuery = useCallback(
    (q: string) => {
      if (!activeProfileId) return;
      useBrowseContextStore.getState().setSearchQuery(activeProfileId, q);
    },
    [activeProfileId],
  );

  // 切换共享时同步 activeProfile 到 browseContextStore（不触发重连，REQ-MC-03）
  useEffect(() => {
    if (activeProfileId) {
      useBrowseContextStore.getState().setActiveProfile(activeProfileId);
    }
  }, [activeProfileId]);

  /** FileActionSheet 上下文（单文件/批量共用，TASK-S4-05 正式菜单） */
  const [pendingFiles, setPendingFiles] = useState<SmbFileEntry[]>([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderError, setNewFolderError] = useState<string | null>(null);

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

  // TASK-RP-04-B：查找 profile.rootPath 传入 buildSegments
  const rootPath = useMemo(
    () => profiles.find((p) => p.id === activeProfileId)?.rootPath,
    [profiles, activeProfileId],
  );

  const segments = useMemo(
    () => buildSegments(currentPath, rootName, rootPath),
    [currentPath, rootName, rootPath],
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
      // 长按/多选态点击：非多选 → 直接打开操作菜单（含重命名/属性等全部操作）；
      // 多选 → 切换选中（spec 5.4.1-R6）
      if (selectionMode) {
        toggleSelection(path);
      } else {
        const file = files.find((f) => f.path === path);
        if (file) setPendingFiles([file]);
      }
    },
    [selectionMode, toggleSelection, files],
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

  /** 新建文件夹：构造共享根相对路径（'\' 分隔）调用 SmbPlugin.createDirectory */
  const handleCreateFolder = useCallback(
    async (name: string) => {
      setNewFolderError(null);
      try {
        const targetPath = currentPath ? `${currentPath}\\${name}` : name;
        await SmbPlugin.createDirectory({ path: targetPath });
        setNewFolderOpen(false);
        await refresh();
      } catch (e) {
        setNewFolderError(e instanceof Error ? e.message : '新建文件夹失败');
      }
    },
    [currentPath, refresh],
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
          <button
            type="button"
            className={styles.navBtn}
            disabled={!canGoBack}
            onClick={goBack}
            aria-label="后退"
          >
            <Icon name="icon-chevron-left" size={20} />
          </button>
          <button
            type="button"
            className={styles.navBtn}
            disabled={!canGoForward}
            onClick={goForward}
            aria-label="前进"
          >
            <Icon name="icon-chevron-right" size={20} />
          </button>
          <Breadcrumb segments={segments} onNavigate={handleNavigate} />
        </div>
        <div className={styles.toolbarActions}>
          <SearchField value={searchQuery} onChange={setSearchQuery} />
          <SortMenu sort={sort} onChange={setSort} />
          <SegmentedControl
            options={[
              { value: 'icon', label: '图标', icon: <Icon name="icon-grid" size={18} /> },
              { value: 'list', label: '列表', icon: <Icon name="icon-list" size={18} /> },
            ]}
            value={viewMode === 'detail' ? 'list' : viewMode === 'tile' ? null : 'icon'}
            onChange={(v) => setViewMode(v === 'icon' ? 'largeIcon' : 'detail')}
            ariaLabel="视图切换"
          />
          <ViewModeMenu viewMode={viewMode} onChange={setViewMode} />
          <button
            type="button"
            className={styles.multiselectTrigger}
            aria-label="新建文件夹"
            onClick={() => {
              setNewFolderError(null);
              setNewFolderOpen(true);
            }}
          >
            <Icon name="icon-plus" size={20} />
          </button>
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
      <WritebackUnavailableBanner />
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
          onSortChange={setSort}
          viewMode={viewMode}
        />
        <BottomPathBar segments={segments} onNavigate={handleNavigate} />
      </div>
      {selectionMode && (
        <MultiSelectBar
          selectedCount={selection.size}
          batchOperationsEnabled={
            OPERATION_CAPABILITIES.copy || OPERATION_CAPABILITIES.move || OPERATION_CAPABILITIES.deleteRemote || OPERATION_CAPABILITIES.rename
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
      <RenameDialog
        currentName=""
        existingNames={siblingNames}
        open={newFolderOpen}
        title="新建文件夹"
        confirmLabel="创建"
        fieldLabel="文件夹名称"
        hideOriginalHint
        onConfirm={handleCreateFolder}
        onDismiss={() => setNewFolderOpen(false)}
      />
      {newFolderError && (
        <StatusBanner
          semantic="danger"
          icon="icon-x-circle"
          title={`新建文件夹失败：${newFolderError}`}
          actions={[
            { label: '知道了', variant: 'text', onPress: () => setNewFolderError(null) },
          ]}
        />
      )}
    </div>
  );
}