import { useEffect } from 'react';
import { ComponentGalleryPage } from './ui/pages/ComponentGalleryPage';
import { AppShell } from './ui/layouts/AppShell';
import { hydrateUiPrefs } from './state/uiPrefsStore';
import { setupBackButtonNavigation, useNavigationStore } from './state/navigationStore';
import { useLocalBrowseStore } from './state/localBrowseStore';
import SmbPlugin, { type ShortcutLaunchedEvent } from './adapter/smb/SmbPlugin';
import { switchBrowse } from './orchestration/browse/switchBrowse';
import { useBrowseContextStore } from './state/browseContextStore';
import { mapSmbError } from './utils/smbErrorMapper';

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
    const handleShortcutLaunched = (data: ShortcutLaunchedEvent) => {
      if (data.sourceType === 'local') {
        const path = data.path ?? '';
        if (!path || isProtectedPath(path)) return;
        const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        useNavigationStore.getState().push('browse-local');
        void useLocalBrowseStore.getState().enterDirectory(parentPath);
      } else {
        if (!data.profileId) return;
        const smbParentPath = data.path.includes('\\') ? data.path.slice(0, data.path.lastIndexOf('\\')) : '';
        try {
          switchBrowse(data.profileId);
          void useBrowseContextStore.getState().enterDirectory(data.profileId, smbParentPath);
        } catch (error) {
          const mapped = mapSmbError(error);
          console.error(`[shortcutLaunched] SMB 导航失败 profileId=${data.profileId}: ${mapped.userMessage}`);
        }
      }
    };
    void SmbPlugin.addListener('shortcutLaunched', handleShortcutLaunched).then((handle) => {
      if (disposed) handle.remove();
      else removeShortcutListener = () => handle.remove();
      void SmbPlugin.notifyShortcutListenerReady();
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
