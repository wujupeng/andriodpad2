/**
 * 界面偏好 store（design.md 2.7.2 UiPrefs、TASK-S2-01）
 * themeMode 三态 + sideNavCollapsed；Preferences `pad2.prefs.v1` 版本化持久化：
 * 值携带 version 字段，读取校验版本，不匹配/损坏安全丢弃重建（design.md 2.7.2 持久化 schema 版本化）。
 * 接口签名冻结于 S1-09（R-07），本任务仅填充实现。
 */
import { create } from 'zustand';
import { Preferences } from '@capacitor/preferences';

export type ThemeMode = 'system' | 'light' | 'dark';

const PREFS_KEY = 'pad2.prefs.v1';
const PREFS_VERSION = 1;

interface PersistedPrefs {
  version: number;
  themeMode: ThemeMode;
  sideNavCollapsed: boolean;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * 读取并校验持久化偏好。
 * 任一步失败（无值/JSON 损坏/版本不匹配/字段非法）→ 返回 null（安全丢弃，由调用方以默认值重建）。
 * 供启动主题预读（theme/bootstrap.ts）与本 store 水合共用，解析逻辑单点收敛。
 */
export async function readPersistedPrefs(): Promise<PersistedPrefs | null> {
  try {
    const { value } = await Preferences.get({ key: PREFS_KEY });
    if (!value) return null;
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.version !== PREFS_VERSION) return null;
    return {
      version: PREFS_VERSION,
      themeMode: isThemeMode(parsed.themeMode) ? parsed.themeMode : 'system',
      sideNavCollapsed:
        typeof parsed.sideNavCollapsed === 'boolean' ? parsed.sideNavCollapsed : false,
    };
  } catch {
    return null;
  }
}

async function persistPrefs(prefs: PersistedPrefs): Promise<void> {
  try {
    await Preferences.set({ key: PREFS_KEY, value: JSON.stringify(prefs) });
  } catch {
    // 持久化失败静默降级：内存态仍生效，下次变更重试写入
  }
}

export interface UiPrefsState {
  themeMode: ThemeMode;
  sideNavCollapsed: boolean;
  setThemeMode(mode: ThemeMode): void;
  setSideNavCollapsed(collapsed: boolean): void;
}

export const useUiPrefsStore = create<UiPrefsState>()((set, get) => ({
  themeMode: 'system',
  sideNavCollapsed: false,
  setThemeMode: (mode) => {
    set({ themeMode: mode });
    const { themeMode, sideNavCollapsed } = get();
    void persistPrefs({ version: PREFS_VERSION, themeMode, sideNavCollapsed });
  },
  setSideNavCollapsed: (collapsed) => {
    set({ sideNavCollapsed: collapsed });
    const { themeMode, sideNavCollapsed } = get();
    void persistPrefs({ version: PREFS_VERSION, themeMode, sideNavCollapsed });
  },
}));

/** 启动水合：恢复持久化偏好（版本不匹配已被 readPersistedPrefs 丢弃，此处仅写入合法值） */
export async function hydrateUiPrefs(): Promise<void> {
  const persisted = await readPersistedPrefs();
  if (persisted) {
    useUiPrefsStore.setState({
      themeMode: persisted.themeMode,
      sideNavCollapsed: persisted.sideNavCollapsed,
    });
  }
}
