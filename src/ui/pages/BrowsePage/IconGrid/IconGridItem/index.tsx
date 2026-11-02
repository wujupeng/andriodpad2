/**
 * IconGridItem —— 网格项组件（TASK-VM-04）。
 * 垂直排列：图标居中 + 文件名最多2行截断。
 * 复用 useLongPress 交互，多选态渲染复选框。
 *
 * 追溯：REQ-VM-06/12, 决策 D-VM-07
 */
import { memo } from 'react';
import { Icon } from '../../../../icons/Icon';
import { fileIcon } from '../../../../icons/fileTypeIcons';
import { useLongPress } from '../../../../hooks/useLongPress';
import type { SmbFileEntry } from '../../../../../adapter/smb/SmbPlugin';
import styles from './style.module.css';

export interface IconGridItemProps {
  file: SmbFileEntry;
  iconSize: number;
  searchQuery: string;
  selected: boolean;
  selectionMode: boolean;
  onOpen(entry: SmbFileEntry): void;
  onEnterDirectory(path: string): void;
  onRowActivate(path: string): void;
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{name}</>;
  const lowerName = name.toLowerCase();
  const lowerQ = q.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  let idx = lowerName.indexOf(lowerQ, cursor);
  while (idx >= 0) {
    if (idx > cursor) parts.push({ text: name.slice(cursor, idx), match: false });
    parts.push({ text: name.slice(idx, idx + q.length), match: true });
    cursor = idx + q.length;
    idx = lowerName.indexOf(lowerQ, cursor);
  }
  if (cursor < name.length) parts.push({ text: name.slice(cursor), match: false });
  return (
    <>
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} className={styles.markHighlight}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function IconGridItemImpl({
  file,
  iconSize,
  searchQuery,
  selected,
  selectionMode,
  onOpen,
  onEnterDirectory,
  onRowActivate,
}: IconGridItemProps) {
  const { ref } = useLongPress<HTMLDivElement>({
    onLongPress: () => onRowActivate(file.path),
    onPress: () => {
      if (selectionMode) return;
      if (file.isDirectory) onEnterDirectory(file.path);
      else onOpen(file);
    },
  });

  return (
    <div
      ref={ref}
      className={`${styles.item} ${selected ? styles['item--selected'] : ''}`}
      data-icon-grid-item=""
    >
      <div className={styles.iconArea}>
        {selectionMode ? (
          <span className={styles.checkmark} data-selected={selected} />
        ) : (
          <Icon
            name={file.isDirectory ? 'icon-folder' : fileIcon(file.name.split('.').pop() ?? '')}
            size={iconSize}
          />
        )}
      </div>
      <span className={styles.name}>
        <HighlightedName name={file.name} query={searchQuery} />
      </span>
    </div>
  );
}

export const IconGridItem = memo(IconGridItemImpl);