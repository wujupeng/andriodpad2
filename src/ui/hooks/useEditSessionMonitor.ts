/**
 * useEditSessionMonitor —— 拉模式状态自动推进（design.md 2.6.2-E、1.2.1 约束 1）
 * 仅活跃会话轮询（默认 5000ms）。实现填充于 TASK-S5-02（契约冻结骨架）。
 */
import type { EditSessionState } from '../../state/editSessionStore';

export interface EditSessionMonitorOptions {
  pollIntervalMs?: number;
  onStateChange?: (next: EditSessionState) => void;
}

export interface EditSessionMonitorResult {
  monitoring: boolean;
}

export function useEditSessionMonitor(
  _options: EditSessionMonitorOptions = {},
): EditSessionMonitorResult {
  return { monitoring: false };
}