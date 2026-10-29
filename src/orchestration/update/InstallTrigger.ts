import UpdatePlugin from '../../adapter/update/UpdatePlugin';
import { useUpdateStore } from '../../state/updateStore';
import { mapUpdateError } from '../../utils/updateErrorMapper';

export async function triggerInstall(localPath: string): Promise<void> {
  const store = useUpdateStore.getState();
  store.setStatus('installing');
  store.setError(null);
  try {
    const { launched } = await UpdatePlugin.triggerInstall({ path: localPath });
    if (!launched) {
      store.setError({ category: 'permission_missing', message: '安装器未调起，请检查权限' });
      store.setStatus('failed');
      return;
    }
    store.setError({ category: 'unknown', message: '已调起安装器，请按系统提示完成' });
  } catch (e) {
    const { category, message } = mapUpdateError(e as Error);
    store.setError({ category, message });
    store.setStatus('failed');
  }
}

export async function checkInstallResult(): Promise<void> {
  const store = useUpdateStore.getState();
  const info = store.updateInfo;
  if (store.status !== 'installing' || !info) return;

  try {
    const { versionCode } = await UpdatePlugin.getCurrentVersion();
    if (versionCode === info.manifest.versionCode) {
      store.setStatus('success');
      store.setError({ category: 'unknown', message: '更新已安装，请重启应用以完成' });
    } else {
      store.setError({ category: 'unknown', message: '安装已调起，请按系统提示完成' });
    }
  } catch (e) {
    const { message } = mapUpdateError(e as Error);
    store.setError({ category: 'unknown', message });
  }
}