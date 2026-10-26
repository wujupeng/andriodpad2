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
      throw new Error('permission_missing: install intent not launched');
    }
  } catch (e) {
    const { category, message } = mapUpdateError(e as Error);
    store.setError({ category, message });
    store.setStatus('failed');
  }
}