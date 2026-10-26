import UpdatePlugin from '../../adapter/update/UpdatePlugin';
import { UPDATE_SOURCE, getUpdateCredentials } from '../../adapter/update/updateConfig';
import { useUpdateStore } from '../../state/updateStore';
import { mapUpdateError } from '../../utils/updateErrorMapper';

export async function downloadAndVerify(): Promise<string | null> {
  const store = useUpdateStore.getState();
  const info = store.updateInfo;
  if (!info) return null;

  store.setStatus('downloading');
  store.setError(null);
  try {
    await UpdatePlugin.connectToUpdateSource({
      host: UPDATE_SOURCE.host,
      share: UPDATE_SOURCE.share,
      username: UPDATE_SOURCE.username,
      password: getUpdateCredentials(),
      domain: UPDATE_SOURCE.domain,
    });
    const { localPath } = await UpdatePlugin.downloadApk({
      path: `${UPDATE_SOURCE.path}/${info.manifest.fileName}`,
      fileName: info.manifest.fileName,
    });
    await UpdatePlugin.disconnectUpdateSource();

    store.setStatus('verifying');
    const { sha256 } = await UpdatePlugin.calculateSha256({ path: localPath });
    if (sha256 !== info.manifest.sha256) {
      throw new Error(`verify_failed: SHA-256 mismatch (expected ${info.manifest.sha256}, got ${sha256})`);
    }
    const { verified } = await UpdatePlugin.verifySignature({ path: localPath });
    if (!verified) {
      throw new Error('signature_mismatch: APK signature does not match installed app');
    }
    store.setStatus('ready');
    return localPath;
  } catch (e) {
    const { category, message } = mapUpdateError(e as Error);
    store.setError({ category, message });
    store.setStatus('failed');
    return null;
  }
}

export async function cancelDownload(): Promise<void> {
  try { await UpdatePlugin.cancelDownload(); } catch {}
  useUpdateStore.getState().setStatus('idle');
}