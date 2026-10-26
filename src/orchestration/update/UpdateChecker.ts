import UpdatePlugin from '../../adapter/update/UpdatePlugin';
import { UPDATE_SOURCE, UPDATE_MANIFEST_FILE, UPDATE_CHECK_INTERVAL_MS, UPDATE_ENABLED, getUpdateCredentials } from '../../adapter/update/updateConfig';
import { useUpdateStore } from '../../state/updateStore';
import { mapUpdateError } from '../../utils/updateErrorMapper';
import type { UpdateInfo } from '../../adapter/update/types';

export async function checkForUpdate(): Promise<void> {
  if (!UPDATE_ENABLED) return;
  const store = useUpdateStore.getState();
  if (store.status === 'checking' || store.status === 'downloading' || store.status === 'installing') return;
  if (store.lastCheckAt && Date.now() - store.lastCheckAt < UPDATE_CHECK_INTERVAL_MS) return;

  store.setStatus('checking');
  store.setError(null);
  try {
    const current = await UpdatePlugin.getCurrentVersion();
    await UpdatePlugin.connectToUpdateSource({
      host: UPDATE_SOURCE.host,
      share: UPDATE_SOURCE.share,
      username: UPDATE_SOURCE.username,
      password: getUpdateCredentials(),
      domain: UPDATE_SOURCE.domain,
    });
    const { manifest } = await UpdatePlugin.readUpdateManifest({ path: `${UPDATE_SOURCE.path}/${UPDATE_MANIFEST_FILE}` });
    await UpdatePlugin.disconnectUpdateSource();

    if (!manifest || typeof manifest.versionCode !== 'number' || typeof manifest.fileName !== 'string' || typeof manifest.sha256 !== 'string') {
      throw new Error('manifest_invalid: missing required fields');
    }

    if (manifest.versionCode > current.versionCode) {
      const forceUpdate = typeof manifest.minVersionCode === 'number' && current.versionCode < manifest.minVersionCode;
      const info: UpdateInfo = { manifest, forceUpdate };
      store.setUpdateInfo(info);
      store.setStatus('available');
    } else {
      store.setUpdateInfo(null);
      store.setStatus('idle');
    }
    store.setLastCheckAt(Date.now());
  } catch (e) {
    const { category, message } = mapUpdateError(e as Error);
    store.setError({ category, message });
    store.setStatus('failed');
    store.setLastCheckAt(Date.now());
  }
}

