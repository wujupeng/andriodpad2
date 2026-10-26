import { Dialog } from '../Dialog';
import { useUpdateStore } from '../../../state/updateStore';
import { downloadAndVerify } from '../../../orchestration/update/ApkDownloader';

export function UpdateDialog() {
  const { status, updateInfo } = useUpdateStore();

  if (status !== 'available' || !updateInfo) return null;

  return (
    <Dialog
      title={`发现新版本 ${updateInfo.manifest.versionName}`}
      confirmLabel="下载更新"
      onConfirm={async () => { await downloadAndVerify(); }}
      onDismiss={() => useUpdateStore.getState().setStatus('skipped')}
    >
      <p>当前版本可更新到 {updateInfo.manifest.versionName}。</p>
      {updateInfo.manifest.releaseNotes && (
        <p>{updateInfo.manifest.releaseNotes}</p>
      )}
      {updateInfo.forceUpdate && (
        <p style={{ color: 'var(--color-danger)' }}>此版本为必须更新，请尽快完成。</p>
      )}
    </Dialog>
  );
}