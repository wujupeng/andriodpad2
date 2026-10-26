/**
 * FileRow —— 文件行（design.md 2.4.4，TASK-S4-03）
 * ListRow 包装：fileTypeIcons 映射 + formatFileSize/formatTimestamp 副标题
 * + 搜索匹配段 <mark> 高亮（brand-50 背景，spec 5.4.1-R5）。
 * 交互：目录点击 enterDirectory / 文件点击 onOpenFile（FileActionSheet 分发，
 * spec 5.4.1-R7）/ 长按进入多选并选中首项（useLongPress，2.3.3-D）。
 * 虚拟化固定行高：外层容器精确 64px（D-05 行高恒定前提）。
 */
import { memo } from 'react';
import { ListRow } from '../../../components/ListRow';
import { Icon } from '../../../icons/Icon';
import { fileIcon } from '../../../icons/fileTypeIcons';
import { formatFileSize, formatTimestamp } from '../../../../utils/fileUtils';
import { useLongPress } from '../../../hooks/useLongPress';
import type { SmbFileEntry } from '../../../../adapter/smb/SmbPlugin';
import styles from './style.module.css';

export interface FileRowProps {
  file: SmbFileEntry;
  searchQuery: string;
  selected: boolean;
  selectionMode: boolean;
  onOpen(entry: SmbFileEntry): void;
  onEnterDirectory(path: string): void;
  /** 长按激活（非多选态=进入多选并选中首项；多选态=切换选中） */
  onRowActivate(path: string): void;
}

/** 文件名搜索高亮（大小写不敏感分段，匹配段 mark 语义） */
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

function FileRowImpl({
  file,
  searchQuery,
  selected,
  selectionMode,
  onOpen,
  onEnterDirectory,
  onRowActivate,
}: FileRowProps) {
  const { ref } = useLongPress<HTMLDivElement>({
    onLongPress: () => onRowActivate(file.path),
    onPress: () => {
      if (selectionMode) return; // 多选态点击由 ListRow 选择分支处理（onPress 不触发目录进入）
      if (file.isDirectory) onEnterDirectory(file.path);
      else onOpen(file);
    },
  });

  const subtitle = file.isDirectory
    ? '文件夹'
    : `${formatFileSize(file.size)} · ${formatTimestamp(file.lastModified)}`;

  return (
    <div ref={ref} className={styles.rowFixed} data-file-row="">
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

export const FileRow = memo(FileRowImpl);