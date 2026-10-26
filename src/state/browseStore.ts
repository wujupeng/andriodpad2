/**
 * 共享目录浏览 store（design.md 2.6.2-C，TASK-S4-01 完整态）
 * 排序（name/size/lastModified/type 四字段 × 升降序）+ 搜索（大小写不敏感包含）
 * → sortedAndFilteredFiles 派生选择器（本文件导出，页面 useMemo 消费）；
 * 多选 selectionMode：进入（初始项）/追加切换/退出（保留列表与滚动位置——
 * 仅清选集，不动 files/currentPath，spec 5.4.1-R6）；
 * enterDirectory 全流程：loading=true → 旧数据立即清空（加载中不呈现旧数据，
 * spec 5.4.1-R8）→ listDirectory resolve 填充 / reject 经 smbErrorMapper 分类入
 * loadError；NETWORK_LOST/AUTH_FAILED 会话级分类同步回流
 * smbConnectionStore.applyOperationError（连接状态机迁移，design.md 2.2.3-B）；
 * refresh：同目录刷新保留既有数据呈现（滚动位置语义由页面层配合，
 * 失败时保留旧列表 + loadError，spec 5.4.3 异常 1 重试入口）。
 * 状态真实呈现：files/currentPath 仅凭插件 resolve 事实更新（禁乐观更新）。
 * 插件调用收敛于 store，页面禁直调（design.md 2.2.2 分层规则）。
 * 接口签名冻结于 S1-09（R-07），本任务零接口变更（仅补全行为）。
 */
import { create } from 'zustand';
import SmbPlugin from '../adapter/smb/SmbPlugin';
import type { SmbFileEntry } from '../adapter/smb/SmbPlugin';
import { mapSmbError } from '../utils/smbErrorMapper';
import type { SmbErrorCategory } from '../utils/smbErrorMapper';
import { useSmbConnectionStore } from './smbConnectionStore';

export type SortField = 'name' | 'size' | 'lastModified' | 'type';

export interface BrowseSort {
  field: SortField;
  ascending: boolean;
}

export interface BrowseError {
  category: SmbErrorCategory;
  userMessage: string;
}

export interface BrowseState {
  currentPath: string;
  files: SmbFileEntry[];
  loading: boolean;
  loadError: BrowseError | null;
  sort: BrowseSort;
  searchQuery: string;
  selection: Set<string>;
  selectionMode: boolean;
  enterDirectory(path: string): Promise<void>;
  refresh(): Promise<void>;
  setSort(sort: BrowseSort): void;
  setSearchQuery(query: string): void;
  enterSelectionMode(initialPath: string): void;
  toggleSelection(path: string): void;
  exitSelectionMode(): void;
}

/** 会话级错误分类（失败回流连接状态机的判定口径）
 * network_lost/auth_failed 为任务卡原始授权；unreachable 为 Gate-UI-4 补验
 * （方案 B）最小修复新增——与 smbConnectionStore.applyOperationError（S3-01，
 * Gate-UI-3 已验证）口径对齐：断网实测错误 ENETUNREACH 归 unreachable，若不
 * 回流则 spec 5.4.1-R11 断网状态条在 wifi-off 场景失效（已连接语境下的
 * 操作级不可达=网络层中断，同 network_lost 语义） */
const SESSION_ERROR_CATEGORIES: ReadonlySet<SmbErrorCategory> = new Set([
  'network_lost',
  'unreachable',
  'auth_failed',
]);

export const useBrowseStore = create<BrowseState>()((set, get) => ({
  currentPath: '',
  files: [],
  loading: false,
  loadError: null,
  sort: { field: 'name', ascending: true },
  searchQuery: '',
  selection: new Set<string>(),
  selectionMode: false,

  enterDirectory: async (path) => {
    // 切换目录：旧数据立即清空（加载中不呈现旧目录内容，spec 5.4.1-R8）
    set({ loading: true, loadError: null, files: [] });
    try {
      const result = await SmbPlugin.listDirectory({ path });
      // 事实驱动：仅凭插件真实返回更新列表与路径（禁乐观更新）
      set({ files: result.files, currentPath: path, loading: false });
    } catch (error) {
      const mapped = mapSmbError(error);
      // 会话级分类回流连接状态机（NETWORK_LOST/AUTH_FAILED 等，design.md 2.2.3-B）
      if (SESSION_ERROR_CATEGORIES.has(mapped.category)) {
        useSmbConnectionStore.getState().applyOperationError(error);
      }
      // 目录未进入：currentPath 不推进（失败目录无事实依据）
      set({ loading: false, loadError: mapped });
    }
  },

  refresh: async () => {
    const { currentPath } = get();
    // 同目录刷新：保留既有数据呈现（滚动位置不跳），失败保留旧列表 + 错误
    set({ loading: true, loadError: null });
    try {
      const result = await SmbPlugin.listDirectory({ path: currentPath });
      set({ files: result.files, currentPath, loading: false });
    } catch (error) {
      const mapped = mapSmbError(error);
      if (SESSION_ERROR_CATEGORIES.has(mapped.category)) {
        useSmbConnectionStore.getState().applyOperationError(error);
      }
      set({ loading: false, loadError: mapped });
    }
  },

  setSort: (sort) => {
    set({ sort });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  enterSelectionMode: (initialPath) => {
    set({ selectionMode: true, selection: new Set([initialPath]) });
  },

  toggleSelection: (path) => {
    const { selection } = get();
    const next = new Set(selection);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    set({ selection: next });
  },

  exitSelectionMode: () => {
    // 保留列表与滚动位置：仅清选集与模式，不动 files/currentPath
    set({ selectionMode: false, selection: new Set<string>() });
  },
}));

/** 排序 + 搜索过滤派生选择器（useMemo 语义，供页面消费） */
export function sortedAndFilteredFiles(
  files: SmbFileEntry[],
  sort: BrowseSort,
  query: string,
): SmbFileEntry[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? files.filter((f) => f.name.toLowerCase().includes(q))
    : [...files];
  const dir = sort.ascending ? 1 : -1;
  return filtered.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    switch (sort.field) {
      case 'size':
        return (a.size - b.size) * dir;
      case 'lastModified':
        return (a.lastModified - b.lastModified) * dir;
      case 'type':
        return a.name.localeCompare(b.name) * dir;
      case 'name':
      default:
        return a.name.localeCompare(b.name, 'zh-CN') * dir;
    }
  });
}