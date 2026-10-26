/**
 * StorageOverviewRow 存储概览行（design.md 2.4.2、TASK-S2-04）
 * Grid 12 列每卡 span 4：本地卡（navigator.storage.estimate 配额）+
 * SD 卡位（未挂载不可用态）+ SMB 状态卡（连接状态 + 共享名 + 进入入口）。
 * 依赖缺口披露（CON-06）：冻结插件无 SMB 磁盘配额方法，SMB 卡呈现信息卡，
 * 组件接口预留 quota 可选字段，后续原生配额接口就绪后零改版升级。
 * 降级（spec 5.2.3 异常 1/2）：单卡查询失败呈现不可用态，不阻塞其余卡与页面。
 */
import { useEffect, useState } from 'react';
import { Card } from '../../../components/Card';
import { ProgressBar } from '../../../components/ProgressBar';
import { StatusBadge } from '../../../components/StatusBadge';
import { BaseButton } from '../../../components/BaseButton';
import { Icon } from '../../../icons/Icon';
import type { IconName } from '../../../icons/registry';
import { useConnectionStatus } from '../../../hooks/useConnectionStatus';
import type { SemanticIconPair } from '../../../tokens/tokens';
import { useSmbConnectionStore } from '../../../../state/smbConnectionStore';
import { useSmbProfilesStore } from '../../../../state/smbProfilesStore';
import { useNavigationStore } from '../../../../state/navigationStore';
import { formatFileSize } from '../../../../utils/fileUtils';
import styles from './style.module.css';

interface LocalQuota {
  status: 'ok' | 'unavailable';
  used?: number;
  total?: number;
}

interface StorageCardProps {
  icon: IconName;
  title: string;
  badge: SemanticIconPair & { label: string };
  /** 依赖缺口预留：配额就绪时传入即呈现进度条（CON-06） */
  quota?: { used: number; total: number };
  meta?: string;
  action?: { label: string; onPress: () => void };
}

function StorageCard({ icon, title, badge, quota, meta, action }: StorageCardProps) {
  return (
    <Card>
      <div className={styles.cardHead}>
        <span className={styles.cardIcon}>
          <Icon name={icon} size={24} />
        </span>
        <span className={styles.cardTitle}>{title}</span>
        <StatusBadge {...badge} />
      </div>
      {quota && quota.total > 0 && (
        <div className={styles.cardBody}>
          <ProgressBar
            value={Math.round((quota.used / quota.total) * 100)}
            semantic="brand"
          />
          <div className={styles.cardMeta}>
            {formatFileSize(quota.used)} / {formatFileSize(quota.total)}
          </div>
        </div>
      )}
      {!quota && meta && <div className={styles.cardMeta}>{meta}</div>}
      {action && (
        <div className={styles.cardAction}>
          <BaseButton variant="secondary" size="sm" onPress={action.onPress}>
            {action.label}
          </BaseButton>
        </div>
      )}
    </Card>
  );
}

export function StorageOverviewRow() {
  const [localQuota, setLocalQuota] = useState<LocalQuota>({ status: 'unavailable' });
  const connectionState = useSmbConnectionStore((s) => s.state);
  const activeProfileId = useSmbConnectionStore((s) => s.activeProfileId);
  const profiles = useSmbProfilesStore((s) => s.profiles);
  const push = useNavigationStore((s) => s.push);
  const connection = useConnectionStatus();

  useEffect(() => {
    let cancelled = false;
    navigator.storage
      .estimate()
      .then(({ usage, quota }) => {
        if (cancelled) return;
        setLocalQuota({ status: 'ok', used: usage, total: quota });
      })
      .catch(() => {
        if (!cancelled) setLocalQuota({ status: 'unavailable' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;
  const smbConnected = connectionState === 'connected';

  return (
    <section className={styles.row} aria-label="存储概览">
      {localQuota.status === 'ok' && localQuota.total !== undefined ? (
        <StorageCard
          icon="icon-hard-drive"
          title="本地存储"
          badge={{ semantic: 'success', label: '可用', icon: 'icon-check-circle' }}
          quota={{ used: localQuota.used ?? 0, total: localQuota.total }}
          action={{ label: '打开', onPress: () => push('browse-local') }}
        />
      ) : (
        <StorageCard
          icon="icon-hard-drive"
          title="本地存储"
          badge={{ semantic: 'neutral', label: '状态未知', icon: 'icon-file-question' }}
          meta="存储配额暂不可用"
        />
      )}

      <StorageCard
        icon="icon-sd-card"
        title="SD 卡"
        badge={{ semantic: 'neutral', label: '未挂载', icon: 'icon-file-question' }}
        meta="插入 SD 卡后显示容量"
      />

      <StorageCard
        icon="icon-server"
        title={activeProfile ? activeProfile.name : 'SMB 服务器'}
        badge={
          smbConnected
            ? { semantic: 'success', label: connection.label, icon: 'icon-check-circle' }
            : connectionState === 'connecting'
              ? { semantic: 'info', label: connection.label, icon: 'icon-loader' }
              : { semantic: 'neutral', label: connection.label, icon: 'icon-cloud-off' }
        }
        meta={
          smbConnected && activeProfile
            ? `已连接共享 ${activeProfile.share}`
            : connectionState === 'connecting'
              ? '正在建立连接…'
              : '未连接，点击进入配置连接'
        }
        action={{
          label: smbConnected ? '进入浏览' : '去连接',
          onPress: () => push(smbConnected ? 'browse' : 'connection'),
        }}
      />
    </section>
  );
}