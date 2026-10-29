import UpdatePlugin from '../../adapter/update/UpdatePlugin';
import { UPDATE_SOURCE, UPDATE_MANIFEST_FILE, UPDATE_CHECK_INTERVAL_MS, UPDATE_ENABLED } from '../../adapter/update/updateConfig';
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

    const cred = await UpdatePlugin.readCredentialFile();
    if (!cred.found || !cred.username || !cred.password) {
      throw new Error('credential_missing: update_cred.json not found or incomplete');
    }

    await UpdatePlugin.connectToUpdateSource({
      host: cred.host || UPDATE_SOURCE.host,
      share: cred.share || UPDATE_SOURCE.share,
      username: cred.username,
      password: cred.password,
      domain: cred.domain || UPDATE_SOURCE.domain,
    });
    const credPath = cred.path || UPDATE_SOURCE.path;
    const { manifest } = await UpdatePlugin.readUpdateManifest({ path: `${credPath}/${UPDATE_MANIFEST_FILE}` });
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

