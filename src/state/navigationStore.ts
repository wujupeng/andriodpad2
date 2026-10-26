/**
 * 视图栈导航 store（design.md 1.1.2、D-03、TASK-S2-01）
 * 轻量栈式导航：Android 返回键出栈，栈底为文件首页，栈底再按返回不退出应用。
 * 不引入 react-router（WebView 无地址栏/深链接需求，返回键与栈式出栈天然配合）。
 * 接口签名冻结于 S1-09（R-07），本任务仅填充实现。
 */
import { create } from 'zustand';
import { App } from '@capacitor/app';
import { useBrowseStore } from './browseStore';

export type ViewId =
  | 'home'
  | 'connection'
  | 'browse'
  | 'browse-local'
  | 'recent'
  | 'edit-session'
  | 'settings'
  | 'm2-verification'
  | 'component-gallery';

export interface NavigationState {
  currentView: ViewId;
  stack: ViewId[];
  push(view: ViewId): void;
  pop(): void;
  replace(view: ViewId): void;
  switchHome(): void;
}

export const useNavigationStore = create<NavigationState>()((set, get) => ({
  currentView: 'home',
  stack: ['home'],
  push: (view) => {
    const { stack, currentView } = get();
    // 同视图重复推入防护：避免连点导致栈内冗余页，返回键需多次才能退出
    if (view === currentView) return;
    set({ stack: [...stack, view], currentView: view });
  },
  pop: () => {
    const { stack } = get();
    // 栈底保护：已在首页时不出栈不退出应用（验收标准：栈底回首页不退出）
    if (stack.length <= 1) return;
    const next = stack.slice(0, -1);
    set({ stack: next, currentView: next[next.length - 1] });
  },
  replace: (view) => {
    const { stack } = get();
    set({ stack: [...stack.slice(0, -1), view], currentView: view });
  },
  switchHome: () => {
    set({ stack: ['home'], currentView: 'home' });
  },
}));

/**
 * Android 返回键桥接（design.md 2.1.1 D-03）：backButton → pop 出栈。
 * 注册后系统默认"返回即退出应用"行为被拦截；栈底（首页）保持应用运行。
 * 返回清理函数（React StrictMode 双挂载 / 接线层卸载时移除监听）。
 */
export async function setupBackButtonNavigation(): Promise<() => void> {
  const handle = await App.addListener('backButton', () => {
    // 多选态优先退出多选（保留列表与滚动位置，spec 5.4.1-R6，TASK-S4-03）
    const browse = useBrowseStore.getState();
    if (browse.selectionMode) {
      browse.exitSelectionMode();
      return;
    }
    useNavigationStore.getState().pop();
  });
  return () => {
    void handle.remove();
  };
}
