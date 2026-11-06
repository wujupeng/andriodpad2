/**
 * 本地目录浏览 store（TASK-LSO-05~06，design.md 模块 B）。
 * 独立于 browseStore/SmbPlugin/smbConnectionStore（DFX 4.2-4：SMB 离线时本地完全可用）。
 * 参照 browseStore 结构，数据源换为 LocalFsAdapter，路径分隔符为 '/'。
 *
 * enterDirectory：loading=true → 旧数据立即清空（加载中不呈现旧数据，
 * spec 禁止项）→ listDirectory resolve 填充 / reject 入 loadError；
 * 失败时 currentPath 不推进（保留上一级列表 + 重试入口，DFX 4.2-1）。
 * goBack：pathStack pop；根目录时交 navigationStore.pop 回首页（不退出应用）。
 * 错误不回流 smbConnectionStore（本地操作与 SMB 连接无关，design 2.7.3）。
 */
import { create } from 'zustand';
import { LocalFsAdapter } from '../adapter/local/LocalFsAdapter';
import type { LocalFileEntry, LocalFsErrorCategory } from '../adapter/local/types';

export type SortField = 'name' | 'size' | 'lastModified' | 'type';

export interface BrowseSort {
  field: SortField;
  ascending: boolean;
}

export interface LocalBrowseError {
  category: LocalFsErrorCategory;
  userMessage: string;
}

export interface LocalBrowseState {
  currentPath: string;
  pathStack: string[];
  files: LocalFileEntry[];
  loading: boolean;
  loadError: LocalBrowseError | null;
  sort: BrowseSort;
  searchQuery: string;
  selection: Set<string>;
  selectionMode: boolean;
  enterDirectory(path: string): Promise<void>;
  goBack(): Promise<void>;
  refresh(): Promise<void>;
  setSort(sort: BrowseSort): void;
  setSearchQuery(query: string): void;
  enterSelectionMode(initialPath: string): void;
  toggleSelection(path: string): void;
  exitSelectionMode(): void;
}

/** 解析 LocalFsAdapter 抛出的 [local:category] message 为 LocalBrowseError */
function parseLocalError(error: unknown): LocalBrowseError {
  const msg = error instanceof Error ? error.message : String(error);
  const match = msg.match(/^\[local:(\w+)\]\s*(.*)$/);
  if (match) {
    return { category: match[1] as LocalFsErrorCategory, userMessage: match[2] };
  }
  return { category: 'unknown', userMessage: msg };
}

export const useLocalBrowseStore = create<LocalBrowseState>()((set, get) => ({
  currentPath: '',
  pathStack: [],
  files: [],
  loading: false,
  loadError: null,
  sort: { field: 'name', ascending: true },
  searchQuery: '',
  selection: new Set<string>(),
  selectionMode: false,

  enterDirectory: async (path) => {
    const { currentPath, pathStack } = get();
    set({ loading: true, loadError: null, files: [] });
    try {
      const result = await LocalFsAdapter.listDirectory(path);
      const nextStack = path === '' ? [] : [...pathStack, currentPath].filter(Boolean);
      set({
        files: result.files,
        currentPath: path,
        pathStack: nextStack,
        loading: false,
      });
    } catch (error) {
      const mapped = parseLocalError(error);
      set({ loading: false, loadError: mapped });
    }
  },

  goBack: async () => {
    const { pathStack } = get();
    if (pathStack.length === 0) {
      return;
    }
    const parentPath = pathStack[pathStack.length - 1];
    const remainingStack = pathStack.slice(0, -1);
    set({ loading: true, loadError: null, files: [], pathStack: remainingStack });
    try {
      const result = await LocalFsAdapter.listDirectory(parentPath);
      set({
        files: result.files,
        currentPath: parentPath,
        loading: false,
      });
    } catch (error) {
      const mapped = parseLocalError(error);
      set({ loading: false, loadError: mapped });
    }
  },

  refresh: async () => {
    const { currentPath } = get();
    set({ loading: true, loadError: null });
    try {
      const result = await LocalFsAdapter.listDirectory(currentPath);
      set({ files: result.files, loading: false });
    } catch (error) {
      const mapped = parseLocalError(error);
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
    set({ selectionMode: false, selection: new Set<string>() });
  },
}));

/** 排序 + 搜索过滤派生选择器（与 browseStore.sortedAndFilteredFiles 同形） */
export function sortedAndFilteredLocalFiles(
  files: LocalFileEntry[],
  sort: BrowseSort,
  query: string,
): LocalFileEntry[] {
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