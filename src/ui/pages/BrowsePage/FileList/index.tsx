/**
 * FileList —— 虚拟化列表容器（design.md 2.4.4、D-05，TASK-S4-03）
 * TASK-VM-07：按 viewMode 分发渲染（detail→FileRow / tile→TileRow / grid→IconGrid）。
 * 状态呈现（spec 5.4.1-R8/R9）：loading → SkeletonList；空目录 EmptyState；搜索无结果 EmptyState +
 * 清空搜索按钮（spec 5.4.3 异常 5）。
 */
import { useEffect, useMemo } from 'react';
import { SkeletonList } from '../../../components/SkeletonList';
import { EmptyState } from '../../../components/EmptyState';
import { useVirtualList } from '../../../hooks/useVirtualList';
import { TileRow } from '../TileRow';
import { IconGrid } from '../IconGrid';
import { ColumnHeader } from '../ColumnHeader';
import { DetailRow } from '../DetailRow';
import { VIEW_MODE_CONFIG } from '../viewModeConfig';
import { sortedAndFilteredFiles } from '../../../../state/browseStore';
import type { SmbFileEntry } from '../../../../adapter/smb/SmbPlugin';
import type { ViewMode } from '../../../../state/uiPrefsStore';
import styles from './style.module.css';

export interface FileListProps {
  files: SmbFileEntry[];
  loading: boolean;
  sort: { field: 'name' | 'size' | 'lastModified' | 'type'; ascending: boolean };
  searchQuery: string;
  selection: Set<string>;
  selectionMode: boolean;
  viewMode?: ViewMode;
  onOpen(entry: SmbFileEntry): void;
  onEnterDirectory(path: string): void;
  onRowActivate(path: string): void;
  onClearSearch(): void;
  onSortChange: (sort: { field: 'name' | 'size' | 'lastModified' | 'type'; ascending: boolean }) => void;
}

export function FileList({
  files,
  loading,
  sort,
  searchQuery,
  selection,
  selectionMode,
  viewMode = 'detail',
  onOpen,
  onEnterDirectory,
  onRowActivate,
  onClearSearch,
  onSortChange,
}: FileListProps) {
  const visible = useMemo(
    () => sortedAndFilteredFiles(files, sort, searchQuery),
    [files, sort, searchQuery],
  );

  const config = VIEW_MODE_CONFIG[viewMode];
  const virtual = useVirtualList(visible, { rowHeight: config.rowHeight, overscan: 8 });

  useEffect(() => {
    virtual.scrollToTop();
  }, [sort.field, sort.ascending, searchQuery]);

  if (loading) {
    return <SkeletonList rows={8} />;
  }

  if (files.length === 0) {
    return (
      <EmptyState
        icon="icon-folder"
        title="目录为空"
        description="此共享目录中没有文件"
      />
    );
  }

  if (visible.length === 0) {
    return (
      <EmptyState
        icon="icon-search"
        title="未找到匹配"
        description={`没有名称包含"${searchQuery.trim()}"的文件`}
        action={{ label: '清空搜索', onPress: onClearSearch }}
      />
    );
  }

  if (viewMode === 'largeIcon' || viewMode === 'mediumIcon' || viewMode === 'smallIcon') {
    return (
      <IconGrid
        files={visible}
        viewMode={viewMode}
        searchQuery={searchQuery}
        selection={selection}
        selectionMode={selectionMode}
        onOpen={onOpen}
        onEnterDirectory={onEnterDirectory}
        onRowActivate={onRowActivate}
      />
    );
  }

  if (viewMode === 'detail') {
    return (
      <div className={styles.scrollContainer} onScroll={virtual.onScroll} data-file-scroll="">
        <ColumnHeader sort={sort} onSortChange={onSortChange} />
        <div className={styles.spacer} style={{ height: virtual.totalHeight }}>
          <div
            className={styles.window}
            style={{ transform: `translateY(${virtual.offsetY}px)` }}
          >
            {virtual.visibleItems.map(({ item }, i) => (
              <DetailRow
                key={item.path}
                file={item}
                searchQuery={searchQuery}
                selected={selection.has(item.path)}
                selectionMode={selectionMode}
                onOpen={onOpen}
                onEnterDirectory={onEnterDirectory}
                onRowActivate={onRowActivate}
                dividerInset
                hideDivider={i === virtual.visibleItems.length - 1}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.scrollContainer} onScroll={virtual.onScroll} data-file-scroll="">
      <div className={styles.spacer} style={{ height: virtual.totalHeight }}>
        <div
          className={styles.window}
          style={{ transform: `translateY(${virtual.offsetY}px)` }}
        >
          {virtual.visibleItems.map(({ item }, i) => (
            <TileRow
              key={item.path}
              file={item}
              searchQuery={searchQuery}
              selected={selection.has(item.path)}
              selectionMode={selectionMode}
              onOpen={onOpen}
              onEnterDirectory={onEnterDirectory}
              onRowActivate={onRowActivate}
              dividerInset
              hideDivider={i === virtual.visibleItems.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}