/**
 * useConnectionStatus —— 聚合连接状态呈现（design.md 2.6.2-E、TASK-S2-02）
 * 供 SideNav/首页/浏览页共用；六态 → 语义/文案/状态图标映射与
 * safetySemanticMap 语义约束一致（状态图标均为 StateIconName 集合成员）。
 * 接口签名冻结于 S1-09（R-07）。
 */
import { useSmbConnectionStore } from '../../state/smbConnectionStore';
import type { SmbConnectionState } from '../../state/smbConnectionStore';
import type { IconName } from '../icons/registry';
import type { Semantic } from '../tokens/tokens';

export interface ConnectionStatusResult {
  semantic: Semantic;
  label: string;
  icon: IconName;
}

const STATUS_MAP: Record<SmbConnectionState, ConnectionStatusResult> = {
  disconnected: { semantic: 'neutral', label: '未连接', icon: 'icon-cloud-off' },
  connecting: { semantic: 'info', label: '连接中…', icon: 'icon-loader' },
  connected: { semantic: 'success', label: '已连接', icon: 'icon-check-circle' },
  connect_failed: { semantic: 'danger', label: '连接失败', icon: 'icon-x-circle' },
  // 会话失效 = danger + icon-x-circle（design.md 842/1058、safetySemanticMap 单一真源；
  // TASK-S3-04 修正：原 warning + icon-conflict 与权威映射不一致）
  session_invalid: { semantic: 'danger', label: '会话失效', icon: 'icon-x-circle' },
  network_interrupted: { semantic: 'warning', label: '网络中断', icon: 'icon-cloud-off' },
};

export function useConnectionStatus(): ConnectionStatusResult {
  const state = useSmbConnectionStore((s) => s.state);
  return STATUS_MAP[state];
}
