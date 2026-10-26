import { StatusBanner } from '../StatusBanner';
import { useUpdateStore } from '../../../state/updateStore';
import { downloadAndVerify, cancelDownload } from '../../../orchestration/update/ApkDownloader';
import { triggerInstall } from '../../../orchestration/update/InstallTrigger';
import { useState } from 'react';

export function UpdateBanner() {
  const { status, updateInfo, progress, error } = useUpdateStore();
  const [localPath, setLocalPath] = useState<string | null>(null);

  if (status === 'idle' || status === 'checking') return null;

  if (status === 'available' && updateInfo) {
    return (
      <StatusBanner
        semantic="info"
        icon="icon-info"
        title={`发现新版本 ${updateInfo.manifest.versionName}`}
        actions={[{ label: '立即更新', onPress: async () => { const p = await downloadAndVerify(); if (p) setLocalPath(p); }, variant: 'primary' }]}
      />
    );
  }

  if (status === 'downloading') {
    return (
      <StatusBanner
        semantic="info"
        icon="icon-loader"
        title={`下载中 ${progress?.percent ?? 0}%`}
        actions={[{ label: '取消', onPress: () => cancelDownload(), variant: 'text' }]}
      />
    );
  }

  if (status === 'ready' && localPath) {
    return (
      <StatusBanner
        semantic="success"
        icon="icon-check-circle"
        title="更新已就绪，点击安装"
        actions={[{ label: '安装', onPress: () => triggerInstall(localPath), variant: 'primary' }]}
      />
    );
  }

  if (status === 'failed' && error) {
    return (
      <StatusBanner
        semantic="danger"
        icon="icon-x-circle"
        title={error.message}
        actions={[{ label: '稍后', onPress: () => useUpdateStore.getState().setStatus('idle'), variant: 'text' }]}
      />
    );
  }

  return null;
}