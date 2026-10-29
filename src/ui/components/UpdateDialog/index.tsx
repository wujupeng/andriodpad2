import { Dialog } from '../Dialog';
import { useUpdateStore } from '../../../state/updateStore';
import { downloadAndVerify, cancelDownload } from '../../../orchestration/update/ApkDownloader';
import { triggerInstall } from '../../../orchestration/update/InstallTrigger';
import { checkForUpdate } from '../../../orchestration/update/UpdateChecker';

const ROOT_ATTRS = { 'data-update-dialog': true };

export function UpdateDialog() {
  const status = useUpdateStore((s) => s.status);
  const updateInfo = useUpdateStore((s) => s.updateInfo);
  const progress = useUpdateStore((s) => s.progress);
  const error = useUpdateStore((s) => s.error);
  const localApkPath = useUpdateStore((s) => s.localApkPath);

  if (status === 'available' && updateInfo) {
    return (
      <Dialog
        title={`发现新版本 ${updateInfo.manifest.versionName}`}
        confirmLabel="下载更新"
        onConfirm={() => { void downloadAndVerify(); }}
        onDismiss={updateInfo.forceUpdate ? undefined : () => { useUpdateStore.getState().setStatus('skipped'); }}
        rootDataAttrs={ROOT_ATTRS}
        confirmDataAttrs={{ 'data-update-dialog-install': true }}
        dismissDataAttrs={{ 'data-update-dialog-cancel': true }}
        dismissLabel="稍后"
      >
        <p>当前版本可更新到 {updateInfo.manifest.versionName}。</p>
        {updateInfo.manifest.releaseNotes && <p>{updateInfo.manifest.releaseNotes}</p>}
        {updateInfo.forceUpdate && <p style={{ color: 'var(--color-danger)' }}>此版本为必须更新，请尽快完成。</p>}
      </Dialog>
    );
  }

  if (status === 'downloading') {
    return (
      <Dialog
        title="下载更新中"
        confirmLabel="取消"
        onConfirm={() => { void cancelDownload(); }}
        rootDataAttrs={{ ...ROOT_ATTRS, 'data-update-progress': true }}
        confirmDataAttrs={{ 'data-update-dialog-cancel': true }}
      >
        <p>下载进度：{progress?.percent ?? 0}%</p>
      </Dialog>
    );
  }

  if (status === 'verifying') {
    return (
      <Dialog
        title="校验中"
        rootDataAttrs={{ ...ROOT_ATTRS, 'data-update-progress': true }}
      >
        <p>正在校验更新包完整性...</p>
      </Dialog>
    );
  }

  if (status === 'ready' && localApkPath) {
    return (
      <Dialog
        title="更新已就绪"
        confirmLabel="安装"
        onConfirm={() => { void triggerInstall(localApkPath); }}
        onDismiss={updateInfo?.forceUpdate ? undefined : () => { useUpdateStore.getState().setStatus('skipped'); }}
        rootDataAttrs={ROOT_ATTRS}
        confirmDataAttrs={{ 'data-update-dialog-install': true }}
        dismissDataAttrs={{ 'data-update-dialog-cancel': true }}
        dismissLabel="稍后"
      >
        <p>更新包已校验通过，点击安装以继续。</p>
      </Dialog>
    );
  }

  if (status === 'installing') {
    return (
      <Dialog
        title="安装中"
        rootDataAttrs={ROOT_ATTRS}
      >
        <p>{error?.message ?? '安装中，请按系统提示完成'}</p>
      </Dialog>
    );
  }

  if (status === 'failed' && error) {
    return (
      <Dialog
        title="更新失败"
        confirmLabel="重试"
        onConfirm={() => { void checkForUpdate(); }}
        onDismiss={() => { useUpdateStore.getState().setStatus('idle'); }}
        danger
        rootDataAttrs={ROOT_ATTRS}
        confirmDataAttrs={{ 'data-update-dialog-install': true }}
        dismissDataAttrs={{ 'data-update-dialog-cancel': true }}
        dismissLabel="关闭"
      >
        <p>{error.message}</p>
      </Dialog>
    );
  }

  if (status === 'success') {
    return (
      <Dialog
        title="更新完成"
        rootDataAttrs={ROOT_ATTRS}
      >
        <p>{error?.message ?? '更新已安装，请重启应用'}</p>
      </Dialog>
    );
  }

  return null;
}