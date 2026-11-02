/**
 * 浏览上下文分区 store（TASK-MC-03）。
 *
 * 维护 Map<profileId, BrowseContextEntry>，每 profile 独立浏览上下文。
 * setActiveProfile 同步切换不触发 SmbPlugin.connect（REQ-MC-03 逻辑层）。
 * 切换响应 < 500ms（DFX-MC-02，纯内存操作）。
 *
 * 追溯：REQ-MC-03、DFX-MC-02
 */
import { create } from 'zustand';
import SmbPlugin from '../adapter/smb/SmbPlugin';
import type { SmbFileEntry } from '../adapter/smb/SmbPlugin';
import { mapSmbError } from '../utils/smbErrorMapper';
import type { SmbErrorCategory } from '../utils/smbErrorMapper';
import { useSmbMultiConnStore } from './smbMultiConnStore.ts';
import { useSmbProfilesStore } from './smbProfilesStore';

export type SortField = 'name' | 'size' | 'lastModified' | 'type';

export interface BrowseSort {
  field: SortField;
  ascending: boolean;
}

export interface BrowseContextEntry {
  currentPath: string;
  files: SmbFileEntry[];
  loading: boolean;
  loadError: { category: SmbErrorCategory; userMessage: string } | null;
  sort: BrowseSort;
  searchQuery: string;
}

/**
 * 根据 profile.rootPath 计算浏览上下文初始 currentPath（TASK-RP-03-A）。
 * - rootPath 非空（非 undefined、非空串）→ 返回 rootPath（浏览逻辑根）
 * - rootPath 为 undefined 或空串 → 返回 '/'（share 根，与 createEntry 现状一致，REQ-RP-03）
 * 前置条件：rootPath 已规范化（不含首尾分隔符、不含 `..`）或 undefined
 * 后置条件：返回 share 内相对路径
 */
export function resolveInitialPath(rootPath: string | undefined): string {
  if (rootPath && rootPath.length > 0) return rootPath;
  return '/';
}

/**
 * 将请求路径钳制到浏览逻辑根之内，防止越界（TASK-RP-03-B，CON-RP-03）。
 * - rootPath 为 undefined 或空串 → 原样返回 path（无约束，现状）
 * - rootPath 非空且 path 不以 rootPath 开头（即 path !== rootPath 且不以 rootPath + '\\' 开头）→ 返回 rootPath（钳制到浏览逻辑根）
 * - 否则原样返回 path（在逻辑根之内）
 */
export function clampToLogicalRoot(path: string, rootPath: string | undefined): string {
  if (!rootPath || rootPath.length === 0) return path;
  if (path === rootPath || path.startsWith(rootPath + '\\')) return path;
  return rootPath;
}

function createEntry(rootPath?: string): BrowseContextEntry {
  return {
    currentPath: resolveInitialPath(rootPath),
    files: [],
    loading: false,
    loadError: null,
    sort: { field: 'name', ascending: true },
    searchQuery: '',
  };
}

export interface BrowseContextStoreState {
  contexts: ReadonlyMap<string, BrowseContextEntry>;
  activeProfileId: string | null;

  setActiveProfile(profileId: string): void;
  enterDirectory(profileId: string, path: string): Promise<void>;
  refresh(profileId: string): Promise<void>;
  setSort(profileId: string, sort: BrowseSort): void;
  setSearchQuery(profileId: string, query: string): void;
  getContext(profileId: string): BrowseContextEntry | undefined;
  clearContext(profileId: string): void;
}

export const useBrowseContextStore = create<BrowseContextStoreState>()((set, get) => {
  const updateContext = (profileId: string, updater: (c: BrowseContextEntry) => BrowseContextEntry) => {
    const cur = get().contexts.get(profileId);
    if (!cur) return;
    const next = new Map(get().contexts);
    next.set(profileId, updater(cur));
    set({ contexts: next });
  };

  return {
    contexts: new Map(),
    activeProfileId: null,

    setActiveProfile: (profileId) => {
      // 纯内存指针切换，不触发 SmbPlugin.connect（REQ-MC-03）
      // 若该 profile 无上下文则创建空条目（TASK-RP-03-D：查 profile.rootPath 计算初始路径）
      if (!get().contexts.has(profileId)) {
        const profile = useSmbProfilesStore.getState().profiles.find((p) => p.id === profileId);
        const next = new Map(get().contexts);
        next.set(profileId, createEntry(profile?.rootPath));
        set({ contexts: next, activeProfileId: profileId });
      } else {
        // 复用既有上下文（REQ-RP-04：切换复用不重置 currentPath）
        set({ activeProfileId: profileId });
      }
    },

    enterDirectory: async (profileId, path) => {
      // 确保上下文存在
      if (!get().contexts.has(profileId)) {
        const profile = useSmbProfilesStore.getState().profiles.find((p) => p.id === profileId);
        const next = new Map(get().contexts);
        next.set(profileId, createEntry(profile?.rootPath));
        set({ contexts: next });
      }

      // TASK-RP-03-E：越界钳制（CON-RP-03 防御层 1）——查找 profile.rootPath 并钳制入参 path
      const profile = useSmbProfilesStore.getState().profiles.find((p) => p.id === profileId);
      const clampedPath = clampToLogicalRoot(path, profile?.rootPath);

      // 若该 profile 非 hot，先切换热会话（物理层异步重连）
      const multiConn = useSmbMultiConnStore.getState();
      const handle = multiConn.getHandle(profileId);
      if (handle && !handle.isHot && handle.state === 'connected') {
        await multiConn.switchHotTo(profileId);
      }

      // 设置 loading 并清空旧数据
      updateContext(profileId, (c) => ({ ...c, loading: true, loadError: null, files: [], currentPath: clampedPath }));

      try {
        const result = await SmbPlugin.listDirectory({ path: clampedPath });
        updateContext(profileId, (c) => ({ ...c, files: result.files, loading: false }));
      } catch (error) {
        const mapped = mapSmbError(error);
        updateContext(profileId, (c) => ({ ...c, loading: false, loadError: mapped }));
        // 回流连接状态机
        useSmbMultiConnStore.getState().applyOperationError(profileId, error);
      }
    },

    refresh: async (profileId) => {
      const ctx = get().contexts.get(profileId);
      if (!ctx || ctx.loading) return;
      await get().enterDirectory(profileId, ctx.currentPath);
    },

    setSort: (profileId, sort) => {
      updateContext(profileId, (c) => ({ ...c, sort }));
    },

    setSearchQuery: (profileId, query) => {
      updateContext(profileId, (c) => ({ ...c, searchQuery: query }));
    },

    getContext: (profileId) => get().contexts.get(profileId),

    clearContext: (profileId) => {
      const next = new Map(get().contexts);
      next.delete(profileId);
      const newActive = get().activeProfileId === profileId ? null : get().activeProfileId;
      set({ contexts: next, activeProfileId: newActive });
    },
  };
});