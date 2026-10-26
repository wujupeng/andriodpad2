/**
 * FileList —— 虚拟化列表容器（design.md 2.4.4、D-05，TASK-S4-03）
 * useVirtualList(rowHeight=64, overscan=8)；totalHeight 撑高 + absolute
 * translateY 偏移；排序/搜索变更后 scrollToTop（design.md 2.4.4）。
 * 状态呈现（spec 5.4.1-R8/R9）：loading → SkeletonList（旧列表已由 store
 * 清空，不残留旧数据）；空目录 EmptyState；搜索无结果 EmptyState +
 * 清空搜索按钮（spec 5.4.3 异常 5）。
 */
import { useEffect, useMemo } from 'react';
import { SkeletonList } from '../../../components/SkeletonList';
import { EmptyState } from '../../../components/EmptyState';
import { useVirtualList } from '../../../hooks/useVirtualList';
import { FileRow } from '../FileRow';
import { sortedAndFilteredFiles } from '../../../../state/browseStore';
import type { SmbFileEntry } from '../../../../adapter/smb/SmbPlugin';
import styles from './style.module.css';

export interface FileListProps {
  files: SmbFileEntry[];
  loading: boolean;
  sort: { field: 'name' | 'size' | 'lastModified' | 'type'; ascending: boolean };
  searchQuery: string;
  selection: Set<string>;
  selectionMode: boolean;
  onOpen(entry: SmbFileEntry): void;
  onEnterDirectory(path: string): void;
  onRowActivate(path: string): void;
  onClearSearch(): void;
}

const ROW_HEIGHT = 64;

export function FileList({
  files,
  loading,
  sort,
  searchQuery,
  selection,
  selectionMode,

  onOpen,
  onEnterDirectory,
  onRowActivate,
  onClearSearch,
}: FileListProps) {
  // 派生：排序 + 搜索过滤（useMemo 语义，design.md 2.4.4）
  const visible = useMemo(
    () => sortedAndFilteredFiles(files, sort, searchQuery),
    [files, sort, searchQuery],
  );

  const virtual = useVirtualList(visible, { rowHeight: ROW_HEIGHT, overscan: 8 });

  // 排序/搜索变更后 scrollTop 归零（design.md 2.4.4 虚拟化要点）
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

  return (
    <div className={styles.scrollContainer} onScroll={virtual.onScroll} data-file-scroll="">
      <div className={styles.spacer} style={{ height: virtual.totalHeight }}>
        <div
          className={styles.window}
          style={{ transform: `translateY(${virtual.offsetY}px)` }}
        >
          {virtual.visibleItems.map(({ item }) => (
            <FileRow
              key={item.path}
              file={item}
              searchQuery={searchQuery}
              selected={selection.has(item.path)}
              selectionMode={selectionMode}
              onOpen={onOpen}
              onEnterDirectory={onEnterDirectory}
              onRowActivate={onRowActivate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}