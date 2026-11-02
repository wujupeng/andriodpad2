/**
 * 最近文件页（TASK-RF-04 改造）。
 * 统一 ListRow 展示（与首页 RecentFilesSection 一致，REQ-RF-05）；
 * 排序控件 RecentSortMenu（四字段+升降序，REQ-RF-02/04）；
 * 排序偏好持久化 recentSortPrefsStore（REQ-RF-03）。
 *
 * 追溯：REQ-RF-02/03/04/05, DFX-RF-01/02, 决策 D-RF-02
 */
import { useEffect } from 'react';
import { useRecentFilesStore } from '../../../state/recentFilesStore';
import { useRecentSortPrefsStore } from '../../../state/recentSortPrefsStore';
import { sortRecentFiles } from '../../../utils/recentFileSort';
import { EmptyState } from '../../components/EmptyState';
import { ListRow } from '../../components/ListRow';
import { Icon } from '../../icons/Icon';
import { fileKindIcon } from '../../icons/fileTypeIcons';
import { formatTimestamp } from '../../../utils/fileUtils';
import { RecentSortMenu } from './RecentSortMenu';
import styles from './style.module.css';

export function RecentFilesPage() {
  const entries = useRecentFilesStore((s) => s.entries);
  const load = useRecentFilesStore((s) => s.load);
  const sort = useRecentSortPrefsStore((s) => s.sort);
  const loadSortPrefs = useRecentSortPrefsStore((s) => s.loadSortPrefs);
  const setSort = useRecentSortPrefsStore((s) => s.setSort);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadSortPrefs(); }, [loadSortPrefs]);

  const sorted = sortRecentFiles(entries, sort);

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon="icon-clock"
        title="还没有访问过文件"
        description="连接 SMB 服务器后浏览并打开文件，最近访问的文件将显示在这里"
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <RecentSortMenu sort={sort} onChange={setSort} />
      </div>
      <div className={styles.list}>
        {sorted.map((entry) => (
          <ListRow
            key={entry.path}
            icon={<Icon name={fileKindIcon(entry.fileType)} size={32} />}
            title={entry.name}
            subtitle={`${entry.source} · ${formatTimestamp(entry.accessedAt)}`}
            trailing={<Icon name="icon-chevron-right" size={20} />}
          />
        ))}
      </div>
    </div>
  );
}