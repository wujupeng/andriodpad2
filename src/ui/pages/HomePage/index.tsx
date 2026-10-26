/**
 * 文件首页 HomePage（design.md 2.4.2、TASK-S2-04）
 * 方向 A+B 融合：display 标题 + 浅色背景 + 圆角卡片 + 留白（spec 5.2.1-R7/R8）。
 * 结构：标题行（工作台 + 添加 SMB 连接）→ StorageOverviewRow → QuickActionsRow
 * → RecentFilesSection。
 */
import { useEffect } from 'react';
import { BaseButton } from '../../components/BaseButton';
import { StorageOverviewRow } from './StorageOverviewRow';
import { QuickActionsRow } from './QuickActionsRow';
import { RecentFilesSection } from './RecentFilesSection';
import { useNavigationStore } from '../../../state/navigationStore';
import { useRecentFilesStore } from '../../../state/recentFilesStore';
import styles from './style.module.css';

export function HomePage() {
  const push = useNavigationStore((s) => s.push);
  const loadRecent = useRecentFilesStore((s) => s.load);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.header__title}>工作台</h1>
        <BaseButton
          variant="primary"
          size="md"
          icon={<span className={styles.header__plus}>＋</span>}
          onPress={() => push('connection')}
        >
          添加 SMB 连接
        </BaseButton>
      </header>

      <StorageOverviewRow />
      <QuickActionsRow />
      <RecentFilesSection />
    </div>
  );
}