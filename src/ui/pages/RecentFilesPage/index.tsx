/**
 * 最近文件页（TASK-RF-04 改造，v2.0.0 iOS 风时间分组卡片）。
 * 统一 ListRow 展示（与首页 RecentFilesSection 一致，REQ-RF-05）；
 * 排序控件 RecentSortMenu（四字段+升降序，REQ-RF-02/04）；
 * 排序偏好持久化 recentSortPrefsStore（REQ-RF-03）。
 * v2.0.0：按 mtime 分组（今天/昨天/更早）+ Card 包裹 + 左缩进分隔线。
 *
 * 追溯：REQ-RF-02/03/04/05, DFX-RF-01/02, 决策 D-RF-02
 */
import { useEffect, useMemo } from 'react';
import { useRecentFilesStore } from '../../../state/recentFilesStore';
import { useRecentSortPrefsStore } from '../../../state/recentSortPrefsStore';
import { sortRecentFiles } from '../../../utils/recentFileSort';
import { EmptyState } from '../../components/EmptyState';
import { Card } from '../../components/Card';
import { ListRow } from '../../components/ListRow';
import { Icon } from '../../icons/Icon';
import { fileKindIcon } from '../../icons/fileTypeIcons';
import { formatTimestamp } from '../../../utils/fileUtils';
import { RecentSortMenu } from './RecentSortMenu';
import styles from './style.module.css';

interface TimeGroup {
  label: string;
  items: ReturnType<typeof sortRecentFiles>;
}

function groupByTime(entries: ReturnType<typeof sortRecentFiles>): TimeGroup[] {
  const now = Date.now();
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 86400000;
  const today: TimeGroup = { label: '今天', items: [] };
  const yesterday: TimeGroup = { label: '昨天', items: [] };
  const earlier: TimeGroup = { label: '更早', items: [] };
  for (const entry of entries) {
    const t = entry.accessedAt;
    if (t >= todayStart) today.items.push(entry);
    else if (t >= yesterdayStart) yesterday.items.push(entry);
    else earlier.items.push(entry);
  }
  return [today, yesterday, earlier].filter((g) => g.items.length > 0);
}

export function RecentFilesPage() {
  const entries = useRecentFilesStore((s) => s.entries);
  const load = useRecentFilesStore((s) => s.load);
  const sort = useRecentSortPrefsStore((s) => s.sort);
  const loadSortPrefs = useRecentSortPrefsStore((s) => s.loadSortPrefs);
  const setSort = useRecentSortPrefsStore((s) => s.setSort);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadSortPrefs(); }, [loadSortPrefs]);

  const sorted = sortRecentFiles(entries, sort);
  const groups = useMemo(() => groupByTime(sorted), [sorted]);

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
        {groups.map((group) => (
          <section key={group.label} className={styles.group}>
            <h2 className={styles.group__title}>{group.label}</h2>
            <Card insetDivider>
              {group.items.map((entry) => (
                <ListRow
                  key={entry.path}
                  icon={<Icon name={fileKindIcon(entry.fileType)} size={32} />}
                  title={entry.name}
                  subtitle={`${entry.source} · ${formatTimestamp(entry.accessedAt)}`}
                  trailing={<Icon name="icon-chevron-right" size={20} />}
                />
              ))}
            </Card>
          </section>
        ))}
      </div>
    </div>
  );
}