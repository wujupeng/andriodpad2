/**
 * 连接卡片（design.md 2.4.3，TASK-S3-04）
 * ListRow 变体：icon-server + 连接名称 + host/share + 六态 StatusBadge + ⋮ 菜单入口。
 * 六态徽章语义（spec 6.3-1 全态呈现，design.md 842 + safetySemanticMap 单一真源）：
 *   已连接 success / 连接中 info+icon-loader / 未连接 neutral /
 *   连接失败 danger / 会话失效 danger / 网络中断 warning
 * 非活动配置恒呈现"未连接"（六态是活动连接的状态，非 profile 属性）。
 */
import { ListRow } from '../../../components/ListRow';
import { StatusBadge } from '../../../components/StatusBadge';
import type { StatusBadgeProps } from '../../../components/StatusBadge';
import { Icon } from '../../../icons/Icon';
import type { SmbConnectionState } from '../../../../state/smbConnectionStore';
import type { SmbProfile } from '../../../../state/smbProfilesStore';
import styles from './style.module.css';

const STATE_BADGE: Record<SmbConnectionState, StatusBadgeProps> = {
  disconnected: { semantic: 'neutral', icon: 'icon-cloud-off', label: '未连接' },
  connecting: { semantic: 'info', icon: 'icon-loader', label: '连接中' },
  connected: { semantic: 'success', icon: 'icon-check-circle', label: '已连接' },
  connect_failed: { semantic: 'danger', icon: 'icon-x-circle', label: '连接失败' },
  session_invalid: { semantic: 'danger', icon: 'icon-x-circle', label: '会话失效' },
  network_interrupted: { semantic: 'warning', icon: 'icon-cloud-off', label: '网络中断' },
};

export interface ConnectionCardProps {
  profile: SmbProfile;
  /** 活动连接状态（非活动 profile 传入 disconnected） */
  connectionState: SmbConnectionState;
  onPress?: () => void;
  onMenu?: () => void;
}

export function ConnectionCard({
  profile,
  connectionState,
  onPress,
  onMenu,
}: ConnectionCardProps) {
  const badge = STATE_BADGE[connectionState];
  return (
    <ListRow
      icon={
        <span className={styles.iconWrap}>
          <Icon name="icon-server" size={24} />
        </span>
      }
      title={profile.name}
      subtitle={`${profile.host} / ${profile.share}`}
      trailing={
        <span className={styles.trailing}>
          <StatusBadge {...badge} />
          {onMenu && (
            <button
              type="button"
              className={styles.menuButton}
              aria-label={`更多操作：${profile.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onMenu();
              }}
            >
              <Icon name="icon-more" size={20} />
            </button>
          )}
        </span>
      }
      onPress={onPress}
    />
  );
}