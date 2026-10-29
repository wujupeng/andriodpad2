import { StatusBanner } from '../StatusBanner';
import type { BannerAction } from '../StatusBanner';
import { useUpdateStore } from '../../../state/updateStore';
import { downloadAndVerify, cancelDownload } from '../../../orchestration/update/ApkDownloader';
import { triggerInstall } from '../../../orchestration/update/InstallTrigger';
import { checkForUpdate } from '../../../orchestration/update/UpdateChecker';

const ROOT_ATTRS = { 'data-update-banner': true };

export function UpdateBanner() {
  const status = useUpdateStore((s) => s.status);
  const updateInfo = useUpdateStore((s) => s.updateInfo);
  const progress = useUpdateStore((s) => s.progress);
  const error = useUpdateStore((s) => s.error);
  const localApkPath = useUpdateStore((s) => s.localApkPath);

  if (status === 'idle' || status === 'checking' || status === 'skipped') return null;

  if (status === 'available' && updateInfo) {
    const actions: BannerAction[] = [
      { label: '立即更新', onPress: () => { void downloadAndVerify(); }, variant: 'primary', dataAttrs: { 'data-update-banner-confirm': true } },
    ];
    if (!updateInfo.forceUpdate) {
      actions.push({ label: '稍后', onPress: () => { useUpdateStore.getState().setStatus('idle'); }, variant: 'text', dataAttrs: { 'data-update-banner-cancel': true } });
    }
    return (
      <StatusBanner
        semantic="info"
        icon="icon-info"
        title={`发现新版本 ${updateInfo.manifest.versionName}`}
        actions={actions}
        rootDataAttrs={ROOT_ATTRS}
      />
    );
  }

  if (status === 'downloading') {
    return (
      <StatusBanner
        semantic="info"
        icon="icon-loader"
        title={`下载中 ${progress?.percent ?? 0}%`}
        actions={[{ label: '取消', onPress: () => { void cancelDownload(); }, variant: 'text', dataAttrs: { 'data-update-banner-cancel': true } }]}
        rootDataAttrs={{ ...ROOT_ATTRS, 'data-update-progress': true }}
      />
    );
  }

  if (status === 'verifying') {
    return (
      <StatusBanner
        semantic="info"
        icon="icon-loader"
        title="校验中..."
        rootDataAttrs={{ ...ROOT_ATTRS, 'data-update-progress': true }}
      />
    );
  }

  if (status === 'ready' && localApkPath) {
    const actions: BannerAction[] = [
      { label: '安装', onPress: () => { void triggerInstall(localApkPath); }, variant: 'primary', dataAttrs: { 'data-update-dialog-install': true } },
    ];
    if (!updateInfo?.forceUpdate) {
      actions.push({ label: '稍后', onPress: () => { useUpdateStore.getState().setStatus('skipped'); }, variant: 'text', dataAttrs: { 'data-update-banner-cancel': true } });
    }
    return (
      <StatusBanner
        semantic="success"
        icon="icon-check-circle"
        title="更新已就绪，点击安装"
        actions={actions}
        rootDataAttrs={ROOT_ATTRS}
      />
    );
  }

  if (status === 'installing') {
    return (
      <StatusBanner
        semantic="info"
        icon="icon-loader"
        title={error?.message ?? '安装中，请按系统提示完成'}
        rootDataAttrs={ROOT_ATTRS}
      />
    );
  }

  if (status === 'success') {
    return (
      <StatusBanner
        semantic="success"
        icon="icon-check-circle"
        title={error?.message ?? '更新已安装，请重启应用'}
        rootDataAttrs={ROOT_ATTRS}
      />
    );
  }

  if (status === 'failed' && error) {
    return (
      <StatusBanner
        semantic="danger"
        icon="icon-x-circle"
        title={error.message}
        actions={[
          { label: '重试', onPress: () => { void checkForUpdate(); }, variant: 'primary', dataAttrs: { 'data-update-banner-confirm': true } },
          { label: '稍后', onPress: () => { useUpdateStore.getState().setStatus('idle'); }, variant: 'text', dataAttrs: { 'data-update-banner-cancel': true } },
        ]}
        rootDataAttrs={ROOT_ATTRS}
      />
    );
  }

  return null;
}