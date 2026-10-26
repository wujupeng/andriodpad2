/**
 * SideNav 侧边导航（design.md 2.4.1、TASK-S2-03）
 * 三分区：主导航（工作台/最近文件/设置）+ SMB 连接动态区（smbProfilesStore 实时
 * 渲染，每项连接状态徽章点）+ 底部工具区（主题切换）。
 * M2 技术验证入口移入设置页开发者选项（TASK-S2-05：产品界面不暴露验证工具）。
 * 断点形态：<600px 抽屉（drawerOpen 控制）；600-899px 常驻收起 72px；≥900px 常驻展开 240px。
 */
import { Icon } from '../../../icons/Icon';
import { useNavigationStore } from '../../../../state/navigationStore';
import type { ViewId } from '../../../../state/navigationStore';
import { useSmbProfilesStore } from '../../../../state/smbProfilesStore';
import { useSmbConnectionStore } from '../../../../state/smbConnectionStore';
import { useUiPrefsStore } from '../../../../state/uiPrefsStore';
import type { ThemeMode } from '../../../../state/uiPrefsStore';
import styles from './style.module.css';

interface SideNavProps {
  drawerOpen: boolean;
  onRequestCloseDrawer: () => void;
}

const MAIN_NAV: { view: ViewId; icon: Parameters<typeof Icon>[0]['name']; label: string }[] = [
  { view: 'home', icon: 'icon-hard-drive', label: '工作台' },
  { view: 'recent', icon: 'icon-clock', label: '最近文件' },
  { view: 'settings', icon: 'icon-settings', label: '设置' },
];

const THEME_CYCLE: ThemeMode[] = ['system', 'light', 'dark'];
const THEME_LABEL: Record<ThemeMode, string> = {
  system: '主题：跟随系统',
  light: '主题：浅色',
  dark: '主题：深色',
};

export function SideNav({ drawerOpen, onRequestCloseDrawer }: SideNavProps) {
  const currentView = useNavigationStore((s) => s.currentView);
  const push = useNavigationStore((s) => s.push);
  const switchHome = useNavigationStore((s) => s.switchHome);
  const profiles = useSmbProfilesStore((s) => s.profiles);
  const connectionState = useSmbConnectionStore((s) => s.state);
  const activeProfileId = useSmbConnectionStore((s) => s.activeProfileId);
  const themeMode = useUiPrefsStore((s) => s.themeMode);
  const setThemeMode = useUiPrefsStore((s) => s.setThemeMode);

  /** 主区域切换：清栈回首页后入栈，保证"栈底为文件首页"且返回键语义一致 */
  const goToMainView = (view: ViewId) => {
    if (view === 'home') {
      switchHome();
      return;
    }
    switchHome();
    push(view);
  };

  const openProfile = (profileId: string) => {
    const isActive = profileId === activeProfileId;
    if (isActive && connectionState === 'connected') {
      push('browse');
    } else {
      push('connection');
    }
  };

  const cycleTheme = () => {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(themeMode) + 1) % THEME_CYCLE.length];
    setThemeMode(next);
  };

  const drawerCls = drawerOpen ? `${styles.nav} ${styles.navOpen}` : styles.nav;

  return (
    <nav className={drawerCls} aria-label="主导航">
      <div className={styles.sections}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>导航</div>
          {MAIN_NAV.map(({ view, icon, label }) => (
            <button
              key={view}
              type="button"
              className={
                currentView === view
                  ? `${styles.item} ${styles.itemActive}`
                  : styles.item
              }
              onClick={() => goToMainView(view)}
            >
              <span className={styles.itemIcon}>
                <Icon name={icon} size={22} />
              </span>
              <span className={styles.itemLabel}>{label}</span>
            </button>
          ))}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>SMB 连接</div>
          {profiles.map((profile) => {
            const isActiveProfile = profile.id === activeProfileId;
            const dotSemantic =
              isActiveProfile && connectionState === 'connected'
                ? styles.dotSuccess
                : isActiveProfile && connectionState === 'connecting'
                  ? styles.dotInfo
                  : styles.dotIdle;
            return (
              <button
                key={profile.id}
                type="button"
                className={
                  currentView === 'browse' && isActiveProfile
                    ? `${styles.item} ${styles.itemActive}`
                    : styles.item
                }
                onClick={() => openProfile(profile.id)}
              >
                <span className={styles.itemIcon}>
                  <Icon name="icon-server" size={22} />
                </span>
                <span className={styles.itemLabel}>{profile.name}</span>
                <span className={`${styles.dot} ${dotSemantic}`} aria-hidden />
              </button>
            );
          })}
          <button
            type="button"
            className={styles.item}
            onClick={() => push('connection')}
          >
            <span className={styles.itemIcon}>
              <Icon name="icon-plus" size={22} />
            </span>
            <span className={styles.itemLabel}>添加连接</span>
          </button>
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.item} onClick={cycleTheme}>
          <span className={styles.itemIcon}>
            <Icon name="icon-eye" size={22} />
          </span>
          <span className={styles.itemLabel}>{THEME_LABEL[themeMode]}</span>
        </button>

      </div>

      {drawerOpen && (
        <button
          type="button"
          className={styles.drawerClose}
          aria-label="关闭导航菜单"
          onClick={onRequestCloseDrawer}
        >
          <Icon name="icon-close" size={22} />
        </button>
      )}
    </nav>
  );
}