/**
 * 最近文件 store（design.md 2.7.2 RecentFileEntry、TASK-S2-04）
 * LRU 20 条，Preferences `pad2.recent.v1` 版本化持久化
 * （读取校验版本，不匹配/损坏安全丢弃重建，同 uiPrefs 模式）。
 * 记录时机：openInWps 成功后（spec 5.2 规则 3）。
 * 接口签名冻结于 S1-09（R-07）。
 */
import { create } from 'zustand';
import { Preferences } from '@capacitor/preferences';
import type { FileKind } from '../ui/icons/fileTypeIcons';

export interface RecentFileEntry {
  path: string;
  name: string;
  fileType: FileKind;
  source: string;
  accessedAt: number;
}

export interface RecentFilesState {
  entries: RecentFileEntry[];
  record(entry: Omit<RecentFileEntry, 'accessedAt'>): void;
  load(): Promise<void>;
}

const RECENT_KEY = 'pad2.recent.v1';
const RECENT_VERSION = 1;
const MAX_ENTRIES = 20;

function isRecentEntry(value: unknown): value is RecentFileEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.path === 'string' &&
    typeof v.name === 'string' &&
    typeof v.fileType === 'string' &&
    typeof v.source === 'string' &&
    typeof v.accessedAt === 'number'
  );
}

async function persistEntries(entries: RecentFileEntry[]): Promise<void> {
  try {
    await Preferences.set({
      key: RECENT_KEY,
      value: JSON.stringify({ version: RECENT_VERSION, entries }),
    });
  } catch {
    // 持久化失败静默降级：内存态仍生效
  }
}

export const useRecentFilesStore = create<RecentFilesState>()((set, get) => ({
  entries: [],

  record: (entry) => {
    const now = Date.now();
    const next: RecentFileEntry[] = [
      { ...entry, accessedAt: now },
      ...get().entries.filter((e) => e.path !== entry.path),
    ].slice(0, MAX_ENTRIES);
    set({ entries: next });
    void persistEntries(next);
  },

  load: async () => {
    try {
      const { value } = await Preferences.get({ key: RECENT_KEY });
      if (!value) return;
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (parsed.version !== RECENT_VERSION || !Array.isArray(parsed.entries)) return;
      const entries = parsed.entries.filter(isRecentEntry).slice(0, MAX_ENTRIES);
      set({ entries });
    } catch {
      // 损坏数据安全丢弃：保持内存默认空列表
    }
  },
}));
