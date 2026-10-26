/**
 * ContextHeader —— FileActionSheet 上下文头（design.md 2.4.5，TASK-S4-05）
 * 单文件：图标（fileTypeIcons）+ 名称 + 大小（formatFileSize）；
 * 批量模式：已选数量。目录副标题"文件夹"。
 */
import { Icon } from '../../../icons/Icon';
import { fileIcon } from '../../../icons/fileTypeIcons';
import { formatFileSize } from '../../../../utils/fileUtils';
import type { SmbFileEntry } from '../../../../adapter/smb/SmbPlugin';
import styles from '../style.module.css';

export interface ContextHeaderProps {
  entries: SmbFileEntry[];
}

export function ContextHeader({ entries }: ContextHeaderProps) {
  const batch = entries.length > 1;
  if (batch) {
    return (
      <div className={styles.contextHeader}>
        <span className={styles.contextIcon}>
          <Icon name="icon-multiselect" size={24} />
        </span>
        <div className={styles.contextTexts}>
          <span className={styles.contextTitle}>已选 {entries.length} 个项目</span>
          <span className={styles.contextSubtitle}>
            {entries.filter((e) => e.isDirectory).length > 0
              ? `含 ${entries.filter((e) => e.isDirectory).length} 个文件夹`
              : '全部为文件'}
          </span>
        </div>
      </div>
    );
  }
  const entry = entries[0];
  const ext = entry.name.split('.').pop() ?? '';
  return (
    <div className={styles.contextHeader}>
      <span className={styles.contextIcon}>
        <Icon
          name={entry.isDirectory ? 'icon-folder' : fileIcon(ext)}
          size={24}
        />
      </span>
      <div className={styles.contextTexts}>
        <span className={styles.contextTitle}>{entry.name}</span>
        <span className={styles.contextSubtitle}>
          {entry.isDirectory
            ? '文件夹'
            : `${formatFileSize(entry.size)} · ${entry.path.split('\\').slice(0, -1).join('\\') || '根目录'}`}
        </span>
      </div>
    </div>
  );
}