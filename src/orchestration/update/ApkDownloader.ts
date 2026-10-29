import UpdatePlugin from '../../adapter/update/UpdatePlugin';
import { UPDATE_SOURCE } from '../../adapter/update/updateConfig';
import { useUpdateStore, selectBusy } from '../../state/updateStore';
import { mapUpdateError } from '../../utils/updateErrorMapper';

type ListenerHandle = { remove: () => Promise<void> };

export async function downloadAndVerify(): Promise<string | null> {
  const store = useUpdateStore.getState();
  if (selectBusy(store)) return null;

  const info = store.updateInfo;
  if (!info) return null;

  store.setStatus('downloading');
  store.setError(null);

  let listener: ListenerHandle | null = null;
  let connected = false;

  try {
    const requiredBytes = info.manifest.size ?? 50_000_000;
    const { sufficient } = await UpdatePlugin.checkDiskSpace({ requiredBytes });
    if (!sufficient) {
      store.setError({ category: 'disk_full', message: '存储空间不足，无法下载更新包' });
      store.setStatus('failed');
      return null;
    }

    const cred = await UpdatePlugin.readCredentialFile();
    if (!cred.found || !cred.username || !cred.password) {
      store.setError({ category: 'auth_failed', message: '更新凭据缺失，自动更新已禁用' });
      store.setStatus('failed');
      return null;
    }

    await UpdatePlugin.connectToUpdateSource({
      host: cred.host || UPDATE_SOURCE.host,
      share: cred.share || UPDATE_SOURCE.share,
      username: cred.username,
      password: cred.password,
      domain: cred.domain || UPDATE_SOURCE.domain,
    });
    connected = true;

    let lastThrottleTs = 0;
    listener = await UpdatePlugin.addListener('downloadProgress', (p: { bytesDownloaded: number; totalBytes: number; percent: number }) => {
      if (Date.now() - lastThrottleTs >= 250) {
        useUpdateStore.getState().setProgress(p);
        lastThrottleTs = Date.now();
      }
    });

    const { localPath } = await UpdatePlugin.downloadApk({
      path: `${cred.path || UPDATE_SOURCE.path}/${info.manifest.fileName}`,
      fileName: info.manifest.fileName,
    });

    const totalSize = info.manifest.size ?? 0;
    useUpdateStore.getState().setProgress({ bytesDownloaded: totalSize, totalBytes: totalSize, percent: 100 });

    if (listener) {
      await listener.remove();
      listener = null;
    }

    await UpdatePlugin.disconnectUpdateSource();
    connected = false;

    store.setStatus('verifying');

    const { sha256 } = await UpdatePlugin.calculateSha256({ path: localPath });
    if (sha256 !== info.manifest.sha256) {
      await UpdatePlugin.cleanApk({ path: localPath });
      useUpdateStore.getState().setLocalApkPath(null);
      store.setError({ category: 'verify_failed', message: '更新包校验失败，文件可能已损坏' });
      store.setStatus('failed');
      return null;
    }

    const { verified } = await UpdatePlugin.verifySignature({ path: localPath });
    if (!verified) {
      await UpdatePlugin.cleanApk({ path: localPath });
      useUpdateStore.getState().setLocalApkPath(null);
      store.setError({ category: 'signature_mismatch', message: '更新包签名不匹配，拒绝安装' });
      store.setStatus('failed');
      return null;
    }

    useUpdateStore.getState().setLocalApkPath(localPath);
    store.setStatus('ready');
    return localPath;
  } catch (e) {
    const err = e as Error;
    if (/cancel/i.test(err?.message ?? '')) {
      return null;
    }
    const { category, message } = mapUpdateError(err);
    useUpdateStore.getState().setError({ category, message, detail: err?.message ?? '' });
    useUpdateStore.getState().setStatus('failed');
    return null;
  } finally {
    if (listener) { await listener.remove().catch(() => {}); }
    if (connected) { await UpdatePlugin.disconnectUpdateSource().catch(() => {}); }
  }
}

export async function cancelDownload(): Promise<void> {
  try {
    await UpdatePlugin.cancelDownload();
  } catch {}
  const store = useUpdateStore.getState();
  store.setLocalApkPath(null);
  store.setProgress(null);
  store.setError(null);
  store.setStatus('idle');
}