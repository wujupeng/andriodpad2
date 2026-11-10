import { useEffect } from 'react';
import { ComponentGalleryPage } from './ui/pages/ComponentGalleryPage';
import { AppShell } from './ui/layouts/AppShell';
import { hydrateUiPrefs } from './state/uiPrefsStore';
import { setupBackButtonNavigation, useNavigationStore } from './state/navigationStore';
import { useLocalBrowseStore } from './state/localBrowseStore';
import SmbPlugin from './adapter/smb/SmbPlugin';
import { switchBrowse } from './orchestration/browse/switchBrowse';

const PROTECTED_PREFIXES = ['/system', '/proc', '/data', '/sys', '/dev'];

function isProtectedPath(path: string): boolean {
  return PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
}

function App() {
  useEffect(() => {
    void hydrateUiPrefs();
    let disposed = false;
    let removeListener: (() => void) | undefined;
    let removeShortcutListener: (() => void) | undefined;
    void setupBackButtonNavigation().then((remove) => {
      if (disposed) remove();
      else removeListener = remove;
    });
    void (SmbPlugin as any).addListener('shortcutLaunched', (data: { sourceType?: 'local' | 'smb'; path?: string; profileId?: string }) => {
      if (data.sourceType === 'local') {
        const path = data.path ?? '';
        if (!path || isProtectedPath(path)) return;
        const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        useNavigationStore.getState().push('browse-local');
        void useLocalBrowseStore.getState().enterDirectory(parentPath);
      } else {
        if (data.profileId) {
          switchBrowse(data.profileId);
        }
      }
    }).then((handle: { remove: () => void }) => {
      if (disposed) handle.remove();
      else removeShortcutListener = () => handle.remove();
    });
    return () => {
      disposed = true;
      removeListener?.();
      removeShortcutListener?.();
    };
  }, []);
  // 临时：Gate-UI-1 组件演示入口（#gallery），去留由 Gate-UI-6 裁定
  if (window.location.hash === '#gallery') {
    return <ComponentGalleryPage />;
  }
  return <AppShell />;
}

export default App;
