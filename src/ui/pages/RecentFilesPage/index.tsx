import { useEffect } from 'react';
import { useRecentFilesStore } from '../../../state/recentFilesStore';
import { EmptyState } from '../../components/EmptyState';
import { formatTimestamp } from '../../../utils/fileUtils';

export function RecentFilesPage() {
  const entries = useRecentFilesStore((s) => s.entries);
  const load = useRecentFilesStore((s) => s.load);

  useEffect(() => { void load(); }, [load]);

  if (entries.length === 0) {
    return (
      <EmptyState
        icon="icon-clock"
        title="还没有访问过文件"
        description="连接 SMB 服务器后浏览并打开文件，最近访问的文件将显示在这里"
      />
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      {entries.map((entry, i) => (
        <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ fontWeight: 500 }}>{entry.name}</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            {entry.source} · {formatTimestamp(entry.accessedAt)}
          </div>
        </div>
      ))}
    </div>
  );
}