import { useEffect } from 'react';
import { ComponentGalleryPage } from './ui/pages/ComponentGalleryPage';
import { AppShell } from './ui/layouts/AppShell';
import { hydrateUiPrefs } from './state/uiPrefsStore';
import { setupBackButtonNavigation } from './state/navigationStore';

function App() {
  useEffect(() => {
    void hydrateUiPrefs();
    // 主题 render 前预读已由 theme/bootstrap.initThemeBeforeRender 完成（main.tsx 接线）
    let disposed = false;
    let removeListener: (() => void) | undefined;
    void setupBackButtonNavigation().then((remove) => {
      if (disposed) remove();
      else removeListener = remove;
    });
    return () => {
      disposed = true;
      removeListener?.();
    };
  }, []);
  // 临时：Gate-UI-1 组件演示入口（#gallery），去留由 Gate-UI-6 裁定
  if (window.location.hash === '#gallery') {
    return <ComponentGalleryPage />;
  }
  return <AppShell />;
}

export default App;
