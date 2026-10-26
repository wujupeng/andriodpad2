/**
 * AppShell 应用外壳（design.md 2.4.1、TASK-S2-03）
 * 全部页面公共骨架：SideNav + GlobalStatusRail + TopBar + ViewPort。
 * 三断点（CON-04 平板优先）：≥900px 常驻展开 240px / 600-899px 常驻收起 72px /
 * <600px 抽屉式（z-nav 遮罩）；断点以 min-width px 值计算（2.3.3-F，不受字体缩放影响）。
 * GlobalStatusRail 渲染于 Shell 层而非页面层——页面切换不影响安全语义呈现（spec 4.2.2）。
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import { GlobalStatusRail } from './GlobalStatusRail';
import { useThemeSync } from '../../hooks/useThemeSync';
import { useNavigationStore } from '../../../state/navigationStore';
import type { ViewId } from '../../../state/navigationStore';
import { ComponentGalleryPage } from '../../pages/ComponentGalleryPage';
import M2VerificationPage from '../../pages/M2VerificationPage';
import { HomePage } from '../../pages/HomePage';
import { SettingsPage } from '../../pages/SettingsPage';
import { ConnectionPage } from '../../pages/ConnectionPage';
import { BrowsePage } from '../../pages/BrowsePage';
import { LocalBrowsePage } from '../../pages/LocalBrowsePage';
import { RecentFilesPage } from '../../pages/RecentFilesPage';
import { EditSessionPage } from '../../pages/EditSessionPage';
import { EmptyState } from '../../components/EmptyState';
import styles from './style.module.css';

/** 页面标题映射（TopBar 呈现用） */
export const VIEW_TITLES: Record<ViewId, string> = {
  home: '工作台',
  connection: 'SMB 连接',
  browse: '共享目录',
  'browse-local': '本地存储',
  recent: '最近文件',
  'edit-session': '编辑会话',
  settings: '设置',
  'm2-verification': 'M2 技术验证',
  'component-gallery': '组件演示',
};

/** ViewPort 页面渲染表：未实现页面以 EmptyState 占位（后续阶段逐页替换） */
function renderView(view: ViewId): ReactNode {
  switch (view) {
    case 'home':
      return <HomePage />;
    case 'connection':
      return <ConnectionPage />;
    case 'browse':
      return <BrowsePage />;
    case 'browse-local':
      return <LocalBrowsePage />;
    case 'recent':
      return <RecentFilesPage />;
    case 'edit-session':
      return <EditSessionPage />;
    case 'settings':
      return <SettingsPage />;
    case 'component-gallery':
      return <ComponentGalleryPage />;
    case 'm2-verification':
      return <M2VerificationPage />;
    default:
      return (
        <EmptyState
          icon="icon-settings"
          title={`${VIEW_TITLES[view]}建设中`}
          description="该页面将在后续阶段交付"
        />
      );
  }
}

export function AppShell() {
  useThemeSync();
  const currentView = useNavigationStore((s) => s.currentView);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    () => !window.matchMedia('(min-width: 600px)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 600px)');
    const onChange = (event: MediaQueryListEvent) => setIsNarrow(!event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // 视图切换后收起抽屉（窄屏导航一次性语义）
  useEffect(() => {
    setDrawerOpen(false);
  }, [currentView]);

  return (
    <div className={styles.shell}>
      <SideNav
        drawerOpen={drawerOpen}
        onRequestCloseDrawer={() => setDrawerOpen(false)}
      />
      {isNarrow && drawerOpen && (
        <div
          className={styles.scrim}
          role="presentation"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <div className={styles.main}>
        <GlobalStatusRail />
        <TopBar
          title={VIEW_TITLES[currentView]}
          showDrawerTrigger={isNarrow}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        <main className={styles.viewport}>
          <div className={styles.viewport__grid}>{renderView(currentView)}</div>
        </main>
      </div>
    </div>
  );
}