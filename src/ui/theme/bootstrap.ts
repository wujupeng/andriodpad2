/**
 * 启动主题引导（design.md 2.3.3-C）
 * 挂载前同步读取主题偏好，避免首帧浅色→深色闪变。
 * 偏好解析复用 uiPrefsStore.readPersistedPrefs（版本校验单点收敛），main.tsx 仅接线。
 */
import { readPersistedPrefs } from '../../state/uiPrefsStore';

type ThemeMode = 'system' | 'light' | 'dark';

function applySystemTheme(): void {
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.dataset.theme = 'dark'
  } else {
    delete document.documentElement.dataset.theme
  }
}

function applyThemeMode(mode: ThemeMode): void {
  if (mode === 'dark' || mode === 'light') {
    document.documentElement.dataset.theme = mode
  } else {
    applySystemTheme()
  }
}

/** render 前一次性执行：按持久化偏好或系统偏好写入 <html data-theme> */
export async function initThemeBeforeRender(): Promise<void> {
  const persisted = await readPersistedPrefs();
  applyThemeMode(persisted?.themeMode ?? 'system');
}
