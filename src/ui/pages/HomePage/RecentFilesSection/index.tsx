/**
 * RecentFilesSection 最近文件区（design.md 2.4.2、TASK-S2-04）
 * recentFilesStore ≤8 条 ListRow（名称/类型图标/来源共享名/相对时间）；
 * 空态 EmptyState"去浏览文件"引导（spec 5.2.1-R3/R5）。
 */
import { Card } from '../../../components/Card';
import { ListRow } from '../../../components/ListRow';
import { EmptyState } from '../../../components/EmptyState';
import { Icon } from '../../../icons/Icon';
import { fileKindIcon } from '../../../icons/fileTypeIcons';
import { useRecentFilesStore } from '../../../../state/recentFilesStore';
import { useSmbConnectionStore } from '../../../../state/smbConnectionStore';
import { useNavigationStore } from '../../../../state/navigationStore';
import { formatTimestamp } from '../../../../utils/fileUtils';
import styles from './style.module.css';

export function RecentFilesSection() {
  const entries = useRecentFilesStore((s) => s.entries);
  const connectionState = useSmbConnectionStore((s) => s.state);
  const push = useNavigationStore((s) => s.push);

  const visible = entries.slice(0, 8);

  return (
    <Card
      title="最近文件"
      actions={
        visible.length > 0 ? (
          <button
            type="button"
            className={styles.viewAll}
            onClick={() => push('recent')}
          >
            查看全部
          </button>
        ) : undefined
      }
    >
      {visible.length === 0 ? (
        <EmptyState
          icon="icon-folder"
          title="还没有访问过文件"
          description="连接 SMB 服务器后浏览并打开文件"
          action={{
            label: '去浏览文件',
            onPress: () => push(connectionState === 'connected' ? 'browse' : 'connection'),
          }}
        />
      ) : (
        <div className={styles.list}>
          {visible.map((entry) => (
            <ListRow
              key={entry.path}
              icon={<Icon name={fileKindIcon(entry.fileType)} size={32} />}
              title={entry.name}
              subtitle={`${entry.source} · ${formatTimestamp(entry.accessedAt)}`}
              trailing={<Icon name="icon-chevron-right" size={20} />}
              onPress={() =>
                push(connectionState === 'connected' ? 'browse' : 'connection')
              }
            />
          ))}
        </div>
      )}
    </Card>
  );
}