/**
 * per-handle 六态状态机与 ConnectionHandle 模型（TASK-MC-01）。
 *
 * 从 smbConnectionStore.ts 抽取状态机迁移表与受控迁移逻辑为可复用的 per-handle 模块。
 * 既有 smbConnectionStore.ts 零变更（HC-05/R-07 兼容），本模块为新多连接 store 的基础设施。
 *
 * 追溯：REQ-MC-05（连接状态独立维护）、DFX-MC-04（凭据安全）、DFX-MC-05（状态可观测）
 */
import type { SmbConnectionState, SmbConnectionError } from './smbConnectionStore.ts';
import type { SmbConnectOptions } from '../adapter/smb/SmbPlugin.ts';

/**
 * 合法迁移表（从 smbConnectionStore.ts:58-65 逐项抽取，单一事实源）。
 * disconnected 为用户显式断开的万能出边。
 */
export const TRANSITIONS: Readonly<Record<SmbConnectionState, readonly SmbConnectionState[]>> = {
  disconnected: ['connecting'],
  connecting: ['connected', 'connect_failed', 'disconnected'],
  connect_failed: ['connecting', 'disconnected'],
  connected: ['disconnected', 'session_invalid', 'network_interrupted'],
  session_invalid: ['connecting', 'disconnected'],
  network_interrupted: ['connecting', 'connected', 'disconnected'],
};

/**
 * per-handle 连接句柄（design.md D-MC-01）。
 * 每个句柄独立维护状态，支持多连接并发呈现。
 */
export interface ConnectionHandle {
  /** 关联的 profileId */
  profileId: string;
  /** 当前连接状态（六态之一） */
  state: SmbConnectionState;
  /** 最近错误（供 UI 呈现） */
  lastError: SmbConnectionError | null;
  /** 最近连接上下文（内存凭据，不持久化不入日志，DFX-MC-04） */
  lastConnect: { profileId: string; options: SmbConnectOptions } | null;
  /** 是否为当前热会话（物理 SmbPlugin 单会话的活跃 profile） */
  isHot: boolean;
  /** 最近连接时间戳 */
  lastConnectTime: number | null;
}

/**
 * 创建新句柄（工厂函数）。
 * 初始态为 disconnected。
 */
export function createHandle(profileId: string): ConnectionHandle {
  return {
    profileId,
    state: 'disconnected',
    lastError: null,
    lastConnect: null,
    isHot: false,
    lastConnectTime: null,
  };
}

/**
 * 受控迁移：校验迁移表合法性，非法路径拒绝并仅开发模式告警（不抛出）。
 * 与 smbConnectionStore.ts:72-78 行为一致。
 */
export function transitionHandle(
  handle: ConnectionHandle,
  to: SmbConnectionState,
  patch?: Partial<Pick<ConnectionHandle, 'lastError' | 'lastConnect' | 'isHot' | 'lastConnectTime'>>,
): ConnectionHandle {
  const from = handle.state;
  if (!TRANSITIONS[from].includes(to)) {
    if (import.meta.env.DEV) {
      console.error(`[connectionHandle] 非法状态迁移被拒绝: ${from} → ${to} (profileId=${handle.profileId})`);
    }
    return handle;
  }
  return { ...handle, state: to, ...patch };
}

/**
 * 判定迁移是否合法（不执行，仅查询）。
 */
export function canTransition(from: SmbConnectionState, to: SmbConnectionState): boolean {
  return TRANSITIONS[from].includes(to);
}