/**
 * 最近文件排序偏好 store（TASK-RF-01）。
 *
 * 从 Capacitor Preferences `pad2.recent.prefs.v1` 读取排序偏好。
 * 默认按时间降序（等价既有 LRU，REQ-RF-03）。
 * 独立键不破坏既有 `pad2.recent.v1` 最近文件数据（DFX-RF-03）。
 * 不引入新 npm 依赖（HC-01），复用既有 @capacitor/preferences。
 *
 * 追溯：REQ-RF-02/03, DFX-RF-02/03, 决策 D-RF-01
 */
import { create } from 'zustand';
import { Preferences } from '@capacitor/preferences';

/** 排序字段 */
export type RecentSortField = 'accessedAt' | 'name' | 'fileType' | 'source';

/** 排序偏好 */
export interface RecentSortPrefs {
  field: RecentSortField;
  ascending: boolean;
}

/** 持久化键名（与 pad2.recent.v1 不冲突，DFX-RF-03） */
const PREF_KEY = 'pad2.recent.prefs.v1';

/** 默认排序：按时间降序（等价 LRU，REQ-RF-03） */
const DEFAULT_SORT: RecentSortPrefs = { field: 'accessedAt', ascending: false };

/** 合法字段枚举 */
const VALID_FIELDS: RecentSortField[] = ['accessedAt', 'name', 'fileType', 'source'];

/** 校验排序偏好合法性 */
function isValidSortPrefs(raw: unknown): raw is RecentSortPrefs {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.field === 'string' &&
    VALID_FIELDS.includes(r.field as RecentSortField) &&
    typeof r.ascending === 'boolean'
  );
}

export interface RecentSortPrefsState {
  sort: RecentSortPrefs;
  loadSortPrefs(): Promise<void>;
  setSort(sort: RecentSortPrefs): void;
}

export const useRecentSortPrefsStore = create<RecentSortPrefsState>()((set) => ({
  sort: { ...DEFAULT_SORT },

  loadSortPrefs: async () => {
    try {
      const { value } = await Preferences.get({ key: PREF_KEY });
      if (!value) return;
      const parsed = JSON.parse(value);
      if (isValidSortPrefs(parsed)) {
        set({ sort: parsed });
      } else {
        set({ sort: { ...DEFAULT_SORT } });
      }
    } catch {
      set({ sort: { ...DEFAULT_SORT } });
    }
  },

  setSort: (sort) => {
    set({ sort });
    void Preferences.set({ key: PREF_KEY, value: JSON.stringify(sort) }).catch(() => {});
  },
}));

/**
 * @internal 仅供测试注入排序偏好，生产代码禁止调用
 */
export function __setSortPrefsForTest(sort: RecentSortPrefs | null): void {
  if (sort) {
    useRecentSortPrefsStore.setState({ sort });
  } else {
    useRecentSortPrefsStore.setState({ sort: { ...DEFAULT_SORT } });
  }
}