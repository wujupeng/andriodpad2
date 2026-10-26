/**
 * TopBar 顶栏（design.md 2.4.1、TASK-S2-03）
 * 页面标题 + 工具位（排序/搜索/多选由 BrowsePage 阶段填充）+
 * 窄屏抽屉触发按钮。
 */
import { Icon } from '../../../icons/Icon';
import styles from './style.module.css';

interface TopBarProps {
  title: string;
  showDrawerTrigger: boolean;
  onOpenDrawer: () => void;
}

export function TopBar({ title, showDrawerTrigger, onOpenDrawer }: TopBarProps) {
  return (
    <header className={styles.bar}>
      {showDrawerTrigger && (
        <button
          type="button"
          className={styles.drawerTrigger}
          aria-label="打开导航菜单"
          onClick={onOpenDrawer}
        >
          <Icon name="icon-more" size={22} />
        </button>
      )}
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.tools} />
    </header>
  );
}