import { checkForUpdate } from './UpdateChecker';
import { UPDATE_ENABLED } from '../../adapter/update/updateConfig';

export function initAutoUpdateCheck(): void {
  if (!UPDATE_ENABLED) return;
  void checkForUpdate().catch(() => {});
}