/**
 * 写回执行器结果 → 编辑会话状态映射（AU-006 TASK-08）。
 *
 * 纯函数——将 WritebackExecutorResult 映射为 editSessionStore 状态转换所需的信息。
 * 不依赖 Zustand/SmbPlugin/Capacitor，可在 Node.js 测试环境独立验证。
 *
 * 映射规则：
 * - success → writeback_success
 * - error.category=permission_denied → session_terminated
 * - error.category=conflict → conflict（含 conflictInfo）
 * - error.category=network_error → network_interrupted（含 lastError）
 * - 其余 → writeback_failed（含 lastError）
 *
 * 追溯：design.md §2.5.2 三层防御、§2.6.2-A 状态机
 */
import type { WritebackExecutorResult } from './writebackExecutor.ts';
import type { SmbErrorCategory } from '../utils/smbErrorMapper.ts';

export type WritebackTargetState =
  | 'writeback_success'
  | 'writeback_failed'
  | 'conflict'
  | 'network_interrupted'
  | 'session_terminated';

export interface WritebackStateMapping {
  state: WritebackTargetState;
  conflictInfo?: { remoteMtime: number; baselineMtime: number };
  lastError?: { category: SmbErrorCategory; userMessage: string };
  detail?: string;
}

export function shouldAutoTransitionToOpened(state: WritebackTargetState): boolean {
  return state === 'writeback_success';
}

export function mapWritebackExecutorResultToState(
  result: WritebackExecutorResult,
  baselineMtime: number,
): WritebackStateMapping {
  if (result.success) {
    return { state: 'writeback_success' };
  }
  if (!result.error) {
    return { state: 'writeback_failed' };
  }
  switch (result.error.category) {
    case 'permission_denied':
      return { state: 'session_terminated', detail: result.error.message };
    case 'conflict':
      return {
        state: 'conflict',
        conflictInfo: { remoteMtime: 0, baselineMtime },
        detail: result.error.message,
      };
    case 'network_error':
      return {
        state: 'network_interrupted',
        lastError: { category: 'network_lost', userMessage: result.error.message },
        detail: result.error.message,
      };
    default:
      return {
        state: 'writeback_failed',
        lastError: { category: 'unknown', userMessage: result.error.message },
        detail: result.error.message,
      };
  }
}