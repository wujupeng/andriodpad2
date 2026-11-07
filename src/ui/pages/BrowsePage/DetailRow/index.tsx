import { memo } from 'react';
import { Icon } from '../../../icons/Icon';
import { fileIcon } from '../../../icons/fileTypeIcons';
import { formatFileSize, formatAbsoluteTimestamp, formatFileKind } from '../../../../utils/fileUtils';
import { useLongPress } from '../../../hooks/useLongPress';
import type { SmbFileEntry } from '../../../../adapter/smb/SmbPlugin';
import styles from './style.module.css';

export interface DetailRowProps {
  file: SmbFileEntry;
  searchQuery: string;
  selected: boolean;
  selectionMode: boolean;
  onOpen(entry: SmbFileEntry): void;
  onEnterDirectory(path: string): void;
  onRowActivate(path: string): void;
  dividerInset?: boolean;
  hideDivider?: boolean;
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

function DetailRowImpl({
  file,
  searchQuery,
  selected,
  selectionMode,
  onOpen,
  onEnterDirectory,
  onRowActivate,
  dividerInset = false,
  hideDivider = false,
}: DetailRowProps) {
  const { ref } = useLongPress<HTMLDivElement>({
    onLongPress: () => onRowActivate(file.path),
    onPress: () => {
      if (selectionMode) return;
      if (file.isDirectory) onEnterDirectory(file.path);
      else onOpen(file);
    },
  });

  const sizeText = file.isDirectory ? '—' : formatFileSize(file.size);
  const dateText = formatAbsoluteTimestamp(file.lastModified);
  const kindText = formatFileKind(file);

  const rowClass = [
    styles.row,
    selected ? styles.rowSelected : '',
    dividerInset ? styles.rowInsetDivider : '',
    hideDivider ? styles.rowHideDivider : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={ref} className={styles.rowFixed} data-detail-row="">
      <div className={rowClass} role="row">
        <div className={`${styles.cellName} ${styles.cell}`}>
          {selectionMode && (
            <span className={`${styles.check} ${selected ? styles.checkOn : ''}`}>
              {selected && <Icon name="icon-check" size={16} />}
            </span>
          )}
          <span className={styles.iconWrap}>
            <Icon
              name={file.isDirectory ? 'icon-folder' : fileIcon(file.name.split('.').pop() ?? '')}
              size={20}
            />
          </span>
          <span className={styles.nameText}>
            <HighlightedName name={file.name} query={searchQuery} />
          </span>
        </div>
        <div className={`${styles.cellDate} ${styles.cellRight}`}>
          <span className={styles.cellText}>{dateText}</span>
        </div>
        <div className={`${styles.cellSize} ${styles.cellRight}`}>
          <span className={styles.cellText}>{sizeText}</span>
        </div>
        <div className={`${styles.cellKind} ${styles.cellRight}`}>
          <span className={styles.cellText}>{kindText}</span>
        </div>
      </div>
    </div>
  );
}

export const DetailRow = memo(DetailRowImpl);