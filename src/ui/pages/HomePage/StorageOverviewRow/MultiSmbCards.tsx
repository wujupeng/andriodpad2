/**
 * 多 SMB 卡渲染组件（TASK-MC-04）。
 *
 * 按 smbMultiConnStore.activeHandles() 渲染多张 SMB 状态卡。
 * 每卡独立呈现连接状态与共享标识（REQ-MC-02）。
 */
import { Card } from '../../../components/Card';
import { StatusBadge } from '../../../components/StatusBadge';
import { BaseButton } from '../../../components/BaseButton';
import { Icon } from '../../../icons/Icon';
import { useSmbMultiConnStore } from '../../../../state/smbMultiConnStore';
import { useSmbProfilesStore } from '../../../../state/smbProfilesStore';
import { useNavigationStore } from '../../../../state/navigationStore';
import { switchBrowse } from '../../../../orchestration/browse/switchBrowse';
import { disconnectAndUnpin } from '../../../../orchestration/boot/disconnectAndUnpin';
import styles from '../style.module.css';

interface SmbCardProps {
  profileId: string;
  profileName: string;
  share: string;
  state: string;
  isHot: boolean;
  onBrowse: () => void;
  onOffline: () => void;
}

function SmbStateCard({ profileName, share, state, isHot, onBrowse, onOffline }: SmbCardProps) {
  const badge =
    state === 'connected'
      ? { semantic: 'success' as const, label: isHot ? '已连接' : '已连接', icon: 'icon-check-circle' as const }
      : state === 'connecting'
        ? { semantic: 'info' as const, label: '连接中', icon: 'icon-loader' as const }
        : state === 'connect_failed'
          ? { semantic: 'danger' as const, label: '连接失败', icon: 'icon-x-circle' as const }
          : state === 'session_invalid'
            ? { semantic: 'danger' as const, label: '会话失效', icon: 'icon-x-circle' as const }
            : state === 'network_interrupted'
              ? { semantic: 'warning' as const, label: '网络中断', icon: 'icon-conflict' as const }
              : { semantic: 'neutral' as const, label: '未连接', icon: 'icon-cloud-off' as const };

  const meta =
    state === 'connected'
      ? `已连接共享 ${share}`
      : state === 'connecting'
        ? '正在建立连接…'
        : state === 'connect_failed'
          ? '连接失败，点击重试'
          : '未连接';

  return (
    <Card>
      <div className={styles.cardHead}>
        <span className={styles.cardIcon}>
          <Icon name="icon-server" size={24} />
        </span>
        <span className={styles.cardTitle}>{profileName}</span>
        <StatusBadge {...badge} />
      </div>
      <div className={styles.cardMeta}>{meta}</div>
      {state === 'connected' && (
        <div className={styles.cardAction}>
          <BaseButton variant="secondary" size="sm" onPress={onBrowse}>
            进入浏览
          </BaseButton>
          <BaseButton variant="danger" size="sm" onPress={onOffline}>
            离线
          </BaseButton>
        </div>
      )}
    </Card>
  );
}

export function MultiSmbCards() {
  const handles = useSmbMultiConnStore((s) => s.handles);
  const profiles = useSmbProfilesStore((s) => s.profiles);
  const push = useNavigationStore((s) => s.push);

  const connectedHandles = Array.from(handles.values()).filter(
    (h) => h.state === 'connected' || h.state === 'connecting' || h.state === 'connect_failed',
  );

  if (connectedHandles.length === 0) {
    return (
      <Card>
        <div className={styles.cardHead}>
          <span className={styles.cardIcon}>
            <Icon name="icon-server" size={24} />
          </span>
          <span className={styles.cardTitle}>SMB 服务器</span>
          <StatusBadge semantic="neutral" label="未连接" icon="icon-cloud-off" />
        </div>
        <div className={styles.cardMeta}>未连接，点击进入配置连接</div>
        <div className={styles.cardAction}>
          <BaseButton variant="secondary" size="sm" onPress={() => push('connection')}>
            去连接
          </BaseButton>
        </div>
      </Card>
    );
  }

  return (
    <>
      {connectedHandles.map((h) => {
        const profile = profiles.find((p) => p.id === h.profileId);
        return (
          <SmbStateCard
            key={h.profileId}
            profileId={h.profileId}
            profileName={profile?.name ?? h.profileId}
            share={profile?.share ?? ''}
            state={h.state}
            isHot={h.isHot}
            onBrowse={() => switchBrowse(h.profileId)}
            onOffline={() => void disconnectAndUnpin(h.profileId)}
          />
        );
      })}
    </>
  );
}