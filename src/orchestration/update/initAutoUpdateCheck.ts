import { App } from '@capacitor/app';
import { checkForUpdate } from './UpdateChecker';
import { checkInstallResult } from './InstallTrigger';
import { UPDATE_ENABLED } from '../../adapter/update/updateConfig';

function registerResumeListener(): void {
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      void checkInstallResult().catch(() => {});
    }
  });
}

export function initAutoUpdateCheck(): void {
  if (!UPDATE_ENABLED) return;
  registerResumeListener();
  void checkForUpdate().catch(() => {});
}