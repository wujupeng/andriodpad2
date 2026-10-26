/**
 * useThemeSync —— 深色模式（design.md 2.3.3-B、2.6.2-E、D-08、TASK-S2-02）
 * matchMedia prefers-color-scheme + uiPrefsStore 用户覆盖 → <html data-theme>。
 * 写入规则与 theme/bootstrap.ts 一致：显式 light/dark 设字面值，system 按系统并即时跟随变更。
 * 接口签名冻结于 S1-09（R-07）。
 */
import { useEffect, useState } from 'react';
import { useUiPrefsStore } from '../../state/uiPrefsStore';
import type { ThemeMode } from '../../state/uiPrefsStore';

export interface ThemeSyncResult {
  theme: 'light' | 'dark';
  mode: ThemeMode;
}

export function useThemeSync(): ThemeSyncResult {
  const mode = useUiPrefsStore((s) => s.themeMode);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const theme: 'light' | 'dark' =
    mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    if (mode === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    } else if (mode === 'light') {
      document.documentElement.dataset.theme = 'light';
    } else if (systemDark) {
      document.documentElement.dataset.theme = 'dark';
    } else {
      delete document.documentElement.dataset.theme;
    }
  }, [mode, systemDark]);

  return { theme, mode };
}
