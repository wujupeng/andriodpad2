/**
 * SMB 连接 store（design.md 2.6.2-B、2.2.3-B，TASK-S3-01 六态完整实现）
 * 六态状态机（spec 6.3-1），迁移表（design.md 2.2.3-B）：
 *   disconnected → connecting（connect 调用）
 *   connecting → connected（插件 resolve connected=true）
 *   connecting → connect_failed（reject，经 smbErrorMapper 分类）
 *   connect_failed → connecting（用户重试）/ disconnected（用户确认）
 *   connected → disconnected（disconnect 成功或用户主动断开）
 *   connected → session_invalid（操作触发认证失效错误）
 *   connected → network_interrupted（操作触发网络丢失错误）
 *   session_invalid → connecting（用户重连，携带已存凭据）
 *   network_interrupted → connecting（网络恢复 + 用户重连）
 *   network_interrupted → connected（isConnected 探测成功，自动）
 * 状态真实呈现原则：connected 仅由插件 resolve 事实可达（禁乐观更新，design.md 2.1.3 原则 5）；
 * 连接宣称的解除同样仅凭事实（isConnected=false）或明确错误分类，传输超时等操作级错误不武断解除。
 * 非法迁移在开发模式 console.error（design.md 2.2.3 状态机约束）。
 * 插件调用收敛于 store，页面禁直调（design.md 2.2.2 分层规则）。
 * 接口签名冻结于 S1-09（R-07），本任务零接口变更（仅补全行为）。
 */
import { create } from 'zustand';
import { mapSmbError, categoryMessage } from '../utils/smbErrorMapper';
import type { SmbErrorCategory } from '../utils/smbErrorMapper';
import SmbPlugin from '../adapter/smb/SmbPlugin';
import type { SmbConnectOptions } from '../adapter/smb/SmbPlugin';

export type SmbConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'connect_failed'
  | 'session_invalid'
  | 'network_interrupted';

export interface SmbConnectionError {
  category: SmbErrorCategory;
  userMessage: string;
}

/** 连接凭据（会话内存持有；design.md 2.7.2 SmbCredentials，不持久化） */
export interface SmbCredentials {
  username: string;
  password: string;
  domain?: string;
}

export interface SmbConnectionStoreState {
  state: SmbConnectionState;
  activeProfileId: string | null;
  lastError: SmbConnectionError | null;
  connect(profileId: string, options: SmbConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  probe(): Promise<void>;
  applyOperationError(error: unknown): void;
}

/** 合法迁移表（design.md 2.2.3-B；disconnected 为用户显式断开的万能出边，见 disconnect 注释） */
const TRANSITIONS: Readonly<Record<SmbConnectionState, readonly SmbConnectionState[]>> = {
  disconnected: ['connecting'],
  connecting: ['connected', 'connect_failed', 'disconnected'],
  connect_failed: ['connecting', 'disconnected'],
  connected: ['disconnected', 'session_invalid', 'network_interrupted'],
  session_invalid: ['connecting', 'disconnected'],
  network_interrupted: ['connecting', 'connected', 'disconnected'],
};

/** 最近一次连接上下文（会话内存，供 reconnect 携带已存凭据重试） */
let lastConnect: { profileId: string; options: SmbConnectOptions } | null = null;

export const useSmbConnectionStore = create<SmbConnectionStoreState>()((set, get) => {
  /** 受控迁移：非法路径拒绝并仅在开发模式告警（不抛出，状态机保持一致） */
  const transitionTo = (to: SmbConnectionState, patch?: Partial<SmbConnectionStoreState>) => {
    const from = get().state;
    if (!TRANSITIONS[from].includes(to)) {
      if (import.meta.env.DEV) {
        console.error(`[smbConnectionStore] 非法状态迁移被拒绝: ${from} → ${to}`);
      }
      return;
    }
    set({ state: to, ...patch });
  };


  return {
    state: 'disconnected',
    activeProfileId: null,
    lastError: null,

    connect: async (profileId, options) => {
      const current = get().state;
      if (current === 'connecting') return; // 防重入：连接中忽略重复发起
      // TASK-S5-06-A（V3 实测缺陷）：已连接同一 profile 时点卡为幂等语义——
      // 连点若走"切换连接"分支（await disconnect → connect）无并发保护，
      // 三连点实测产生 3 次 SmbPlugin.connect 互踩。同 profile 直接幂等返回。
      if (current === 'connected' && get().activeProfileId === profileId) return;
      lastConnect = { profileId, options };
      if (current === 'connected') {
        // 切换连接：先按用户主动断开语义解除旧连接（单活动连接模型，activeProfileId 唯一）
        try {
          await SmbPlugin.disconnect();
        } catch {
          // 插件断开失败不阻塞本地状态清理（连接上下文已不可信）
        }
        set({ state: 'disconnected', activeProfileId: null });
      }
      // connect_failed/session_invalid/network_interrupted → connecting 均为迁移表合法路径
      // （用户重试 / 用户重连 / 网络恢复+用户重连）
      transitionTo('connecting', { lastError: null, activeProfileId: profileId });
      try {
        await SmbPlugin.connect(options);
        // 事实驱动：仅凭插件真实 resolve 判定连接（设计原则 5，禁乐观更新）
        transitionTo('connected', { lastError: null });
      } catch (error) {
        // 失败分类驱动：timeout/unreachable/auth_failed/network_lost 等分类随 lastError 供 UI 呈现
        transitionTo('connect_failed', { lastError: mapSmbError(error) });
      }
    },

    disconnect: async () => {
      // 用户显式动作：任意态可达 disconnected（迁移表 connected 出边的"用户主动断开"语义推广）
      try {
        await SmbPlugin.disconnect();
      } catch {
        // 断开失败不阻塞本地状态清理（连接上下文已不可信）
      }
      lastConnect = null;
      set({ state: 'disconnected', activeProfileId: null, lastError: null });
    },

    reconnect: async () => {
      const current = get().state;
      // 已连接或连接中：重连无意义，忽略（防误触发）；无连接上下文（冷启动后）亦忽略
      if (current === 'connected' || current === 'connecting' || !lastConnect) return;
      const { profileId, options } = lastConnect;
      await get().connect(profileId, options);
    },

    probe: async () => {
      const { state } = get();
      // 仅对已宣称连接或中断待恢复的会话探测，其余态探测无语义
      if (state !== 'connected' && state !== 'network_interrupted') return;
      try {
        const { connected } = await SmbPlugin.isConnected();
        if (connected) {
          if (state === 'network_interrupted') {
            // 迁移表授权的自动回迁：网络恢复 + 探测成功（无需用户操作）
            transitionTo('connected', { lastError: null });
          } else {
            set({ lastError: null }); // 幂等确认，清除陈旧错误
          }
        } else if (state === 'connected') {
          // 插件事实：连接已不可用（探测失败），连接宣称解除
          transitionTo('network_interrupted', {
            lastError: { category: 'network_lost', userMessage: categoryMessage('network_lost') },
          });
        } else {
          // network_interrupted 态探测仍失败：保持中断态，仅刷新错误上下文
          set({
            lastError: { category: 'network_lost', userMessage: categoryMessage('network_lost') },
          });
        }
      } catch (error) {
        // 探测本身失败无法证伪连接宣称：仅记录，不迁移（解除连接宣称须凭 isConnected=false 事实）
        set({ lastError: mapSmbError(error) });
      }
    },

    applyOperationError: (error) => {
      const mapped = mapSmbError(error);
      const { state } = get();
      // 会话级错误分类迁移（design.md 2.2.3-B：操作触发认证失效/网络丢失）
      if (state === 'connected' || state === 'network_interrupted') {
        if (mapped.category === 'auth_failed') {
          if (state === 'connected') {
            transitionTo('session_invalid', { lastError: mapped });
          } else {
            set({ lastError: mapped }); // 已处中断态：认证错误仅记录，不降级既有态
          }
          return;
        }
        if (mapped.category === 'network_lost' || mapped.category === 'unreachable') {
          // unreachable 在已连接语境为网络层不可达，与 network_lost 同归中断语义
          if (state === 'connected') {
            transitionTo('network_interrupted', { lastError: mapped });
          } else {
            set({ lastError: mapped });
          }
          return;
        }
      }
      // 操作级错误（timeout/permission_denied/disk_full/unknown）与非连接态：
      // 不武断解除连接宣称（超时不可证伪连接），仅记录错误供操作层呈现
      set({ lastError: mapped });
    },
  };
});
