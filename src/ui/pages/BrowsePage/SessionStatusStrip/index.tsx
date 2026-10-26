/**
 * SessionStatusStrip —— 会话状态条（design.md 2.4.4，TASK-S4-03）
 * listDirectory 失败且分类为 NETWORK_LOST/AUTH_FAILED 时列表区上方呈现
 * （spec 5.4.1-R11、spec 5.7.1-R5）：network_interrupted → warning Banner；
 * session_invalid → danger Banner；含"重连"按钮 → smbConnectionStore.reconnect()，
 * **持续呈现直至恢复**（danger/warning 类无自动消失，StatusBanner 安全约束）。
 * 常态隐藏（条件渲染）。
 */
import { StatusBanner } from '../../../components/StatusBanner';
import { useSmbConnectionStore } from '../../../../state/smbConnectionStore';
import type { SmbConnectionState } from '../../../../state/smbConnectionStore';
import type { IconName } from '../../../icons/registry';

export interface SessionStatusStripProps {
  connectionState: SmbConnectionState;
}

/** 六态中需呈现状态条的两态（其余态隐藏） */
function stripConfig(state: SmbConnectionState): {
  semantic: 'warning' | 'danger';
  icon: IconName;
  title: string;
  description: string;
} | null {
  switch (state) {
    case 'network_interrupted':
      return {
        semantic: 'warning',
        icon: 'icon-cloud-off',
        title: '网络已中断',
        description: '文件列表可能不是最新状态，恢复网络后可重新连接',
      };
    case 'session_invalid':
      return {
        semantic: 'danger',
        icon: 'icon-x-circle',
        title: '连接会话已失效',
        description: '请重新连接以继续访问共享目录',
      };
    default:
      return null;
  }
}

export function SessionStatusStrip({ connectionState }: SessionStatusStripProps) {
  const reconnect = useSmbConnectionStore((s) => s.reconnect);
  const config = stripConfig(connectionState);
  if (!config) return null;
  return (
    <StatusBanner
      semantic={config.semantic}
      icon={config.icon}
      title={config.title}
      description={config.description}
      actions={[
        {
          label: '重连',
          variant: 'primary',
          onPress: () => void reconnect(),
        },
      ]}
    />
  );
}