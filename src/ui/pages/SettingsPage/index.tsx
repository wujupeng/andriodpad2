/**
 * 设置页（TASK-S2-05 最小形态）
 * 当前承载"开发者选项"分区：M2 技术验证入口——产品界面不暴露验证工具
 * （tasks.md TASK-S2-05 验收 4：M2 页入口仅存在于开发者选项）。
 * 其余设置项在后续阶段按需扩展。
 */
import { useCallback, useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Card } from '../../components/Card';
import { ListRow } from '../../components/ListRow';
import { Icon } from '../../icons/Icon';
import { useNavigationStore } from '../../../state/navigationStore';
import { isWritebackGloballyEnabled, setWritebackEnabled } from '../../../state/writebackConfig';
import { checkForUpdate } from '../../../orchestration/update/UpdateChecker';
import { useUpdateStore, selectBusy } from '../../../state/updateStore';
import styles from './style.module.css';

export function SettingsPage() {
  const push = useNavigationStore((s) => s.push);
  const [appInfo, setAppInfo] = useState<{ version: string; build: string } | null>(null);
  const [writebackOn, setWritebackOn] = useState(false);
  const updateStatus = useUpdateStore((s) => s.status);
  const updateBusy = useUpdateStore(selectBusy);

  useEffect(() => {
    App.getInfo()
      .then((info) => setAppInfo({ version: info.version, build: info.build }))
      .catch(() => setAppInfo(null));
  }, []);

  useEffect(() => {
    setWritebackOn(isWritebackGloballyEnabled());
  }, []);

  const handleToggleWriteback = useCallback(() => {
    const next = !writebackOn;
    void setWritebackEnabled(next).then(() => setWritebackOn(next));
  }, [writebackOn]);

  const handleCheckUpdate = useCallback(() => {
    if (!updateBusy) void checkForUpdate(true);
  }, [updateBusy]);

  return (
    <div className={styles.page}>
      <section className={styles.section}>
        <h2 className={styles.section__title}>开发者选项</h2>
        <Card insetDivider>
          <ListRow
            icon={<Icon name="icon-shield" size={24} />}
            title="M2 技术验证"
            subtitle="SMB 连接 / 浏览 / WPS 编辑回写 V1-V7 门禁验证（开发者工具）"
            trailing={<Icon name="icon-chevron-right" size={20} />}
            onPress={() => push('m2-verification')}
          />
        </Card>
      </section>
      <section className={styles.section}>
        <h2 className={styles.section__title}>文件编辑</h2>
        <Card insetDivider>
          <ListRow
            icon={<Icon name="icon-shield" size={24} />}
            title="写回服务器"
            subtitle={writebackOn ? '已启用 · 点击关闭' : '已禁用 · 点击启用'}
            trailing={<Icon name={writebackOn ? 'icon-check-circle' : 'icon-x-circle'} size={20} />}
            onPress={handleToggleWriteback}
          />
        </Card>
      </section>
      <section className={styles.section}>
        <h2 className={styles.section__title}>关于</h2>
        <Card insetDivider>
          <ListRow
            icon={<Icon name="icon-check-circle" size={24} />}
            title="版本"
            subtitle={appInfo ? `v${appInfo.version} (build ${appInfo.build})` : '加载中…'}
          />
          <ListRow
            icon={<Icon name="icon-check-circle" size={24} />}
            title="检查更新"
            subtitle={
              updateStatus === 'checking' ? '检查中…' :
              updateStatus === 'failed' ? '检查失败，点击重试' :
              updateStatus === 'available' ? '发现新版本，见顶部横幅' :
              updateStatus === 'downloading' ? '下载中…' :
              updateStatus === 'verifying' ? '校验中…' :
              updateStatus === 'ready' ? '更新已就绪，见顶部横幅' :
              updateStatus === 'installing' ? '安装中…' :
              updateStatus === 'success' ? '更新成功，请重启' :
              '检查是否有新版本'
            }
            trailing={
              updateBusy
                ? <Icon name="icon-loader" size={20} />
                : <Icon name="icon-chevron-right" size={20} />
            }
            onPress={handleCheckUpdate}
          />
        </Card>
      </section>
    </div>
  );
}