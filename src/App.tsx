import { useEffect } from 'react';
import { ComponentGalleryPage } from './ui/pages/ComponentGalleryPage';
import { AppShell } from './ui/layouts/AppShell';
import { hydrateUiPrefs } from './state/uiPrefsStore';
import { setupBackButtonNavigation } from './state/navigationStore';
import SmbPlugin from './adapter/smb/SmbPlugin';
import { switchBrowse } from './orchestration/browse/switchBrowse';

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
    void (SmbPlugin as any).addListener('shortcutLaunched', (data: { profileId?: string }) => {
      if (data.profileId) {
        switchBrowse(data.profileId);
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
