/**
 * IconGrid —— 网格布局容器（TASK-VM-05）。
 * 按 viewMode 读取 VIEW_MODE_CONFIG，分块为网格行，复用 useVirtualList 按行窗口化。
 *
 * 追溯：REQ-VM-06, DFX-VM-02, 决策 D-VM-02
 */
import { useMemo } from 'react';
import { useVirtualList } from '../../../hooks/useVirtualList';
import { IconGridItem } from './IconGridItem';
import { VIEW_MODE_CONFIG } from '../viewModeConfig';
import type { SmbFileEntry } from '../../../../adapter/smb/SmbPlugin';
import styles from './style.module.css';

export interface IconGridProps {
  files: SmbFileEntry[];
  viewMode: 'largeIcon' | 'mediumIcon' | 'smallIcon';
  searchQuery: string;
  selection: Set<string>;
  selectionMode: boolean;
  onOpen(entry: SmbFileEntry): void;
  onEnterDirectory(path: string): void;
  onRowActivate(path: string): void;
}

function chunk<T>(arr: T[], size: number): Array<Array<T | null>> {
  const result: Array<Array<T | null>> = [];
  for (let i = 0; i < arr.length; i += size) {
    const row: Array<T | null> = arr.slice(i, i + size);
    while (row.length < size) row.push(null);
    result.push(row);
  }
  return result;
}

export function IconGrid({
  files,
  viewMode,
  searchQuery,
  selection,
  selectionMode,
  onOpen,
  onEnterDirectory,
  onRowActivate,
}: IconGridProps) {
  const config = VIEW_MODE_CONFIG[viewMode];
  const gridRows = useMemo(() => chunk(files, config.columns), [files, config.columns]);
  const virtual = useVirtualList(gridRows, { rowHeight: config.rowHeight, overscan: 4 });

  return (
    <div className={styles.scrollContainer} onScroll={virtual.onScroll} data-icon-grid-scroll="">
      <div className={styles.spacer} style={{ height: virtual.totalHeight }}>
        <div className={styles.window} style={{ transform: `translateY(${virtual.offsetY}px)` }}>
          {virtual.visibleItems.map(({ item: row, index: rowIndex }) => (
            <div key={rowIndex} className={styles.gridRow}>
              {row.map((file, colIndex) =>
                file === null ? (
                  <div key={colIndex} className={styles.placeholder} />
                ) : (
                  <IconGridItem
                    key={file.path}
                    file={file}
                    iconSize={config.iconSize}
                    searchQuery={searchQuery}
                    selected={selection.has(file.path)}
                    selectionMode={selectionMode}
                    onOpen={onOpen}
                    onEnterDirectory={onEnterDirectory}
                    onRowActivate={onRowActivate}
                    viewMode={viewMode}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}