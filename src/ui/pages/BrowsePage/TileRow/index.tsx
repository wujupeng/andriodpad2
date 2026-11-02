/**
 * TileRow —— 平铺行布局变体（TASK-VM-03）。
 * 与 FileRow 同签名，副标题仅一行摘要（文件=大小，目录="文件夹"），不含修改时间。
 * 行高固定 64px，复用 useLongPress 交互。
 *
 * 追溯：REQ-VM-07, 决策 D-VM-06
 */
import { memo } from 'react';
import { ListRow } from '../../../components/ListRow';
import { Icon } from '../../../icons/Icon';
import { fileIcon } from '../../../icons/fileTypeIcons';
import { formatFileSize } from '../../../../utils/fileUtils';
import { useLongPress } from '../../../hooks/useLongPress';
import type { SmbFileEntry } from '../../../../adapter/smb/SmbPlugin';
import styles from './style.module.css';

export interface TileRowProps {
  file: SmbFileEntry;
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

function TileRowImpl({
  file,
  searchQuery,
  selected,
  selectionMode,
  onOpen,
  onEnterDirectory,
  onRowActivate,
}: TileRowProps) {
  const { ref } = useLongPress<HTMLDivElement>({
    onLongPress: () => onRowActivate(file.path),
    onPress: () => {
      if (selectionMode) return;
      if (file.isDirectory) onEnterDirectory(file.path);
      else onOpen(file);
    },
  });

  const subtitle = file.isDirectory ? '文件夹' : formatFileSize(file.size);

  return (
    <div ref={ref} className={styles.rowFixed} data-tile-row="">
      <ListRow
        icon={
          file.isDirectory ? (
            <Icon name="icon-folder" size={24} />
          ) : (
            <Icon name={fileIcon(file.name.split('.').pop() ?? '')} size={24} />
          )
        }
        title={<HighlightedName name={file.name} query={searchQuery} />}
        subtitle={subtitle}
        selected={selected}
        selectionMode={selectionMode}
        onPress={selectionMode ? () => onRowActivate(file.path) : undefined}
      />
    </div>
  );
}

export const TileRow = memo(TileRowImpl);