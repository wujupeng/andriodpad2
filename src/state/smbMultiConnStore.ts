/**
 * SMB 多连接 store（TASK-MC-02，D-MC-01 决策）。
 *
 * 维护 Map<profileId, ConnectionHandle> 活跃连接集合。
 * 逻辑多连接 + 物理单会话热切换（HC-02 冻结区约束）。
 * connect 新共享不 disconnect 旧共享（消除 RC-MC-02 根因，REQ-MC-01）。
 *
 * 追溯：REQ-MC-01/04/05/06/07/08、DFX-MC-01/03/04/05
 */
import { create } from 'zustand';
import { mapSmbError, categoryMessage } from '../utils/smbErrorMapper';
import type { SmbErrorCategory } from '../utils/smbErrorMapper';
import SmbPlugin from '../adapter/smb/SmbPlugin';
import type { SmbConnectOptions } from '../adapter/smb/SmbPlugin';
import {
  type ConnectionHandle,
  createHandle,
  transitionHandle,
} from './connectionHandle.ts';

/** 并发连接数上限（DFX-MC-01 下限 4） */
export const MAX_CONCURRENT = 4;

/** switchHotTo 竞态防护单调递增 token（REQ-SW-04, DFX-SW-02） */
let _switchToken = 0;

/** 测试注入点 */
interface SmbPluginDeps {
  connect: (options: SmbConnectOptions) => Promise<unknown>;
  disconnect: () => Promise<void>;
  isConnected: () => Promise<{ connected: boolean }>;
}
let _smbDeps: SmbPluginDeps | null = null;
function getSmb(): SmbPluginDeps {
  if (_smbDeps) return _smbDeps;
  return {
    connect: (o) => SmbPlugin.connect(o),
    disconnect: () => SmbPlugin.disconnect(),
    isConnected: () => SmbPlugin.isConnected(),
  };
}
/** @internal 仅供测试注入 */
export function __setSmbPluginDepsForTest(deps: SmbPluginDeps | null): void {
  _smbDeps = deps;
}

export interface SmbMultiConnStoreState {
  /** 活跃连接句柄集合 */
  handles: ReadonlyMap<string, ConnectionHandle>;
  /** 当前热会话 profileId（物理 SmbPlugin 单会话的活跃 profile） */
  hotProfileId: string | null;

  connect(profileId: string, options: SmbConnectOptions): Promise<void>;
  disconnect(profileId: string): Promise<void>;
  switchHotTo(profileId: string): Promise<void>;
  probe(profileId: string): Promise<void>;
  applyOperationError(profileId: string, error: unknown): void;
  getHandle(profileId: string): ConnectionHandle | undefined;
  activeHandles(): ConnectionHandle[];
}

export const useSmbMultiConnStore = create<SmbMultiConnStoreState>()((set, get) => {
  /** 更新单个 handle */
  const updateHandle = (profileId: string, updater: (h: ConnectionHandle) => ConnectionHandle) => {
    const cur = get().handles.get(profileId);
    if (!cur) return;
    const next = new Map(get().handles);
    next.set(profileId, updater(cur));
    set({ handles: next });
  };

  /** 设置热会话 */
  const setHot = (profileId: string | null) => {
    const cur = get().handles;
    const next = new Map(cur);
    for (const [pid, h] of next) {
      next.set(pid, { ...h, isHot: pid === profileId });
    }
    set({ handles: next, hotProfileId: profileId });
  };

  return {
    handles: new Map(),
    hotProfileId: null,

    connect: async (profileId, options) => {
      const existing = get().handles.get(profileId);
      // 防重入：已 connecting 则忽略
      if (existing?.state === 'connecting') return;
      // 同 profile 幂等：已 connected 且同一 profile 则返回（REQ-MC-06）
      if (existing?.state === 'connected') return;

      // 并发上限校验（REQ-MC-07）
      if (!existing && get().handles.size >= MAX_CONCURRENT) {
        const h = createHandle(profileId);
        const rejected = transitionHandle(h, 'connect_failed', {
          lastError: { category: 'unknown' as SmbErrorCategory, userMessage: `已达并发连接上限 ${MAX_CONCURRENT}` },
        });
        const next = new Map(get().handles);
        next.set(profileId, rejected);
        set({ handles: next });
        return;
      }

      // 创建/复用 handle，迁移到 connecting
      const handle = existing ?? createHandle(profileId);
      const connecting = transitionHandle(handle, 'connecting', {
        lastError: null,
        lastConnect: { profileId, options },
        lastConnectTime: Date.now(),
      });
      const next = new Map(get().handles);
      next.set(profileId, connecting);
      set({ handles: next });

      // 不 disconnect 既有连接（消除 RC-MC-02，REQ-MC-01）
      // 仅切换热会话：旧 hot 的 isHot=false（逻辑仍 connected）
      setHot(profileId);

      try {
        await getSmb().connect(options);
        // 事实驱动：仅凭插件真实 resolve 判定连接
        updateHandle(profileId, (h) => transitionHandle(h, 'connected', { lastError: null }));
      } catch (error) {
        updateHandle(profileId, (h) =>
          transitionHandle(h, 'connect_failed', { lastError: mapSmbError(error) }),
        );
        // 连接失败若该 profile 为 hot，回退 hot 到 null
        if (get().hotProfileId === profileId) setHot(null);
      }
    },

    disconnect: async (profileId) => {
      const handle = get().handles.get(profileId);
      if (!handle) return;

      // 若该 handle 为 hot，物理断开
      if (handle.isHot) {
        try {
          await getSmb().disconnect();
        } catch {
          // 断开失败不阻塞本地状态清理
        }
      }

      // 仅移除该 handle，其他 handle 不受影响（REQ-MC-04 隔离）
      const next = new Map(get().handles);
      next.delete(profileId);
      const newHot = get().hotProfileId === profileId ? null : get().hotProfileId;
      set({ handles: next, hotProfileId: newHot });
    },

    switchHotTo: async (profileId) => {
      const handle = get().handles.get(profileId);
      if (!handle || handle.state !== 'connected') return;
      if (get().hotProfileId === profileId) return; // 已是 hot

      const myToken = ++_switchToken;
      // 切换热会话：物理层异步重连（REQ-MC-03 降级披露）
      setHot(profileId);
      try {
        const opts = handle.lastConnect?.options;
        if (opts) {
          await getSmb().connect(opts);
        }
        if (myToken !== _switchToken) return; // 过期切换忽略
      } catch {
        if (myToken !== _switchToken) return; // 过期切换忽略
        // 物理重连失败不改变逻辑 connected 态（上下文缓存仍可用）
        updateHandle(profileId, (h) => ({
          ...h,
          lastError: { category: 'network_lost' as SmbErrorCategory, userMessage: categoryMessage('network_lost') },
        }));
      }
    },

    probe: async (profileId) => {
      const handle = get().handles.get(profileId);
      if (!handle) return;
      if (handle.state !== 'connected' && handle.state !== 'network_interrupted') return;

      try {
        const { connected } = await getSmb().isConnected();
        if (connected) {
          if (handle.state === 'network_interrupted') {
            updateHandle(profileId, (h) => transitionHandle(h, 'connected', { lastError: null }));
          } else {
            updateHandle(profileId, (h) => ({ ...h, lastError: null }));
          }
        } else if (handle.state === 'connected') {
          updateHandle(profileId, (h) =>
            transitionHandle(h, 'network_interrupted', {
              lastError: { category: 'network_lost', userMessage: categoryMessage('network_lost') },
            }),
          );
        }
      } catch (error) {
        updateHandle(profileId, (h) => ({ ...h, lastError: mapSmbError(error) }));
      }
    },

    applyOperationError: (profileId, error) => {
      const handle = get().handles.get(profileId);
      if (!handle) return;
      const mapped = mapSmbError(error);
      // 仅迁移指定 handle，不污染其他 handle（REQ-MC-05）
      if (handle.state === 'connected' || handle.state === 'network_interrupted') {
        if (mapped.category === 'auth_failed') {
          if (handle.state === 'connected') {
            updateHandle(profileId, (h) => transitionHandle(h, 'session_invalid', { lastError: mapped }));
          } else {
            updateHandle(profileId, (h) => ({ ...h, lastError: mapped }));
          }
          return;
        }
        if (mapped.category === 'network_lost' || mapped.category === 'unreachable') {
          if (handle.state === 'connected') {
            updateHandle(profileId, (h) => transitionHandle(h, 'network_interrupted', { lastError: mapped }));
          } else {
            updateHandle(profileId, (h) => ({ ...h, lastError: mapped }));
          }
          return;
        }
      }
      updateHandle(profileId, (h) => ({ ...h, lastError: mapped }));
    },

    getHandle: (profileId) => get().handles.get(profileId),

    activeHandles: () =>
      Array.from(get().handles.values()).filter((h) => h.state === 'connected'),
  };
});