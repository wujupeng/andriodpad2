/**
 * 本地存储浏览页（TASK-LSO-14~19，design.md 模块 E）。
 * 复用 BrowsePage 组件组合模式（FileList/Breadcrumb/SortMenu/SearchField/
 * StatusBanner/OperationProgressPanel/MultiSelectBar/FileActionSheet），
 * 数据源换为 localBrowseStore，source='local'。
 * 路径分隔符为 '/'（相对 Directory.ExternalStorage）。
 * 无 SessionStatusStrip/WritebackUnavailableBanner（本地无连接状态机）。
 * 文件夹可进入（R-LSO-01 核心缺陷修复）；增删改查经 FileActionSheet（source='local'）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Breadcrumb } from '../../components/Breadcrumb';
import { Icon } from '../../icons/Icon';
import { useLocalBrowseStore, sortedAndFilteredLocalFiles } from '../../../state/localBrowseStore';
import type { BrowseSort } from '../../../state/localBrowseStore';
import { useOperationStore, LOCAL_CAPABILITIES } from '../../../state/operationStore';
import { useUiPrefsStore } from '../../../state/uiPrefsStore';
import SmbPlugin from '../../../adapter/smb/SmbPlugin';
import type { SmbFileEntry } from '../../../adapter/smb/SmbPlugin';
import { SearchField } from '../BrowsePage/SearchField';
import { SortMenu } from '../BrowsePage/SortMenu';
import { ViewModeMenu } from '../BrowsePage/ViewModeMenu';
import { StatusBanner } from '../../components/StatusBanner';
import { FileList } from '../BrowsePage/FileList';
import { MultiSelectBar } from '../BrowsePage/MultiSelectBar';
import { OperationProgressPanel } from '../BrowsePage/OperationProgressPanel';
import { FileActionSheet } from '../FileActionSheet';
import { RenameDialog } from '../FileActionSheet/RenameDialog';
import { LocalFsAdapter } from '../../../adapter/local/LocalFsAdapter';
import type { OperationTask } from '../../../state/operationStore';
import styles from '../BrowsePage/style.module.css';

/** currentPath（'/' 分隔）→ Breadcrumb 段解析 */
function buildLocalSegments(currentPath: string) {
  const segments = [{ name: '本地存储', path: '' }];
  if (currentPath) {
    const parts = currentPath.split('/').filter(Boolean);
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      segments.push({ name: part, path: acc });
    }
  }
  return segments;
}

export function LocalBrowsePage() {
  const currentPath = useLocalBrowseStore((s) => s.currentPath);
  const files = useLocalBrowseStore((s) => s.files);
  const loading = useLocalBrowseStore((s) => s.loading);
  const loadError = useLocalBrowseStore((s) => s.loadError);
  const sort = useLocalBrowseStore((s) => s.sort);
  const searchQuery = useLocalBrowseStore((s) => s.searchQuery);
  const selection = useLocalBrowseStore((s) => s.selection);
  const selectionMode = useLocalBrowseStore((s) => s.selectionMode);
  const enterDirectory = useLocalBrowseStore((s) => s.enterDirectory);

  const refresh = useLocalBrowseStore((s) => s.refresh);
  const setSort = useLocalBrowseStore((s) => s.setSort);
  const setSearchQuery = useLocalBrowseStore((s) => s.setSearchQuery);
  const enterSelectionMode = useLocalBrowseStore((s) => s.enterSelectionMode);
  const exitSelectionMode = useLocalBrowseStore((s) => s.exitSelectionMode);
  const toggleSelection = useLocalBrowseStore((s) => s.toggleSelection);

  const viewMode = useUiPrefsStore((s) => s.viewMode);
  const setViewMode = useUiPrefsStore((s) => s.setViewMode);

  const [pendingFiles, setPendingFiles] = useState<SmbFileEntry[]>([]);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    if (!loadedOnce) {
      setLoadedOnce(true);
      void enterDirectory('');
    }
  }, [loadedOnce, enterDirectory]);

  const recentTasks = useOperationStore((s) => s.recentTasks);
  const lastRefreshedTaskId = useRef<string | null>(null);
  useEffect(() => {
    const latest = recentTasks[0];
    if (!latest) return;
    if (lastRefreshedTaskId.current === latest.id) return;
    if (latest.status === 'success' || latest.status === 'partial_failed' || latest.status === 'cancelled') {
      lastRefreshedTaskId.current = latest.id;
      void refresh();
    }
  }, [recentTasks, refresh]);

  const siblingNames = useMemo(() => files.map((f) => f.name), [files]);
  const segments = useMemo(() => buildLocalSegments(currentPath), [currentPath]);
  const visibleFiles = useMemo(
    () => sortedAndFilteredLocalFiles(files, sort, searchQuery),
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
      if (selectionMode) {
        toggleSelection(path);
      } else {
        const file = files.find((f) => f.path === path);
        if (file) setPendingFiles([file as SmbFileEntry]);
      }
    },
    [selectionMode, toggleSelection, files],
  );

  const handleBatchAction = useCallback(
    (_action: 'copy' | 'move' | 'delete') => {
      const selected = files.filter((f) => selection.has(f.path));
      if (selected.length === 0) return;
      setPendingFiles(selected as SmbFileEntry[]);
    },
    [selection, files],
  );

  const handleRetry = useCallback((task: OperationTask) => {
    const store = useOperationStore.getState();
    const paths = task.targets.map((t) => t.path);
    const destination = task.destination ?? '';
    switch (task.kind) {
      case 'copy':
        void store.enqueueCopy(paths, destination, { sourceType: 'local' });
        break;
      case 'move':
        void store.enqueueMove(paths, destination, { sourceType: 'local' });
        break;
      case 'delete':
      case 'batch':
      default:
        void store.executeDelete(paths, 'local');
        break;
    }
  }, []);

  const handleOpenLocal = useCallback(async (file: SmbFileEntry) => {
    setOpenError(null);
    try {
      const absolutePath = await LocalFsAdapter.getAbsolutePath(file.path);
      const opened = await SmbPlugin.openLocalFile({ absolutePath });
      if (!opened.intentLaunched) {
        setOpenError(opened.error ?? '未找到可打开该文件的应用');
      }
    } catch (e) {
      setOpenError(e instanceof Error ? e.message : '未知错误');
    }
  }, []);

  const handleCreateFolder = useCallback(
    async (name: string) => {
      setNewFolderError(null);
      try {
        await LocalFsAdapter.createDirectory(currentPath, name);
        setNewFolderOpen(false);
        await refresh();
      } catch (e) {
        setNewFolderError(e instanceof Error ? e.message : '新建文件夹失败');
      }
    },
    [currentPath, refresh],
  );

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarNav}>
          <Breadcrumb segments={segments} onNavigate={handleNavigate} />
        </div>
        <div className={styles.toolbarActions}>
          <SearchField value={searchQuery} onChange={setSearchQuery} />
          <SortMenu sort={sort as BrowseSort} onChange={setSort} />
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
      {openError && (
        <StatusBanner
          semantic="danger"
          icon="icon-x-circle"
          title={`无法打开：${openError}`}
          actions={[
            { label: '知道了', variant: 'text', onPress: () => setOpenError(null) },
          ]}
        />
      )}
      <div className={styles.listArea}>
        <FileList
          files={files as SmbFileEntry[]}
          loading={loading}
          sort={sort as BrowseSort}
          searchQuery={searchQuery}
          selection={selection}
          selectionMode={selectionMode}
          onOpen={(file) => void handleOpenLocal(file)}
          onEnterDirectory={(path) => void enterDirectory(path)}
          onRowActivate={handleRowActivate}
          onClearSearch={() => setSearchQuery('')}
          onSortChange={setSort}
          viewMode={viewMode}
        />
      </div>
      {selectionMode && (
        <MultiSelectBar
          selectedCount={selection.size}
          batchOperationsEnabled={
            LOCAL_CAPABILITIES.copy || LOCAL_CAPABILITIES.move || LOCAL_CAPABILITIES.deleteLocal
          }
          onCancel={exitSelectionMode}
          onBatchAction={handleBatchAction}
        />
      )}
      <OperationProgressPanel onRetry={handleRetry} />
      <FileActionSheet
        entries={pendingFiles}
        source="local"
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

