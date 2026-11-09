/**
 * 收藏夹 store（spec 5.3，design.md 2.2/2.6）
 * Preferences `pad2.favorites.v1` 版本化持久化：
 * - 读取校验版本号与结构，不匹配/损坏安全丢弃（回空列表，不崩溃）
 * - 去重键：path + sourceType + profileId 三元组唯一
 * - fail-secure：非法数据静默清除并回写
 */
import { create } from 'zustand';
import { Preferences } from '@capacitor/preferences';

const FAVORITES_PREF_KEY = 'pad2.favorites.v1';
const STORAGE_VERSION = 1;

export interface FavoriteItem {
  id: string;
  name: string;
  path: string;
  sourceType: 'smb' | 'local';
  profileId?: string;
  isDirectory: boolean;
  createdAt: number;
}

export interface FavoriteStoreState {
  favorites: FavoriteItem[];
  loaded: boolean;
  addFavorite(item: Omit<FavoriteItem, 'id' | 'createdAt'>): void;
  removeFavorite(id: string): void;
  isFavorite(path: string, sourceType: 'smb' | 'local', profileId?: string): boolean;
  loadFavorites(): Promise<void>;
}

function makeFavoriteId(path: string, sourceType: string, profileId?: string): string {
  return `${sourceType}:${profileId ?? 'none'}:${path}`;
}

function sanitizeFavoriteItem(raw: unknown): FavoriteItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.name !== 'string' || typeof obj.path !== 'string') return null;
  if (obj.sourceType !== 'smb' && obj.sourceType !== 'local') return null;
  if (typeof obj.isDirectory !== 'boolean') return null;
  if (typeof obj.createdAt !== 'number') return null;
  if (obj.sourceType === 'smb' && typeof obj.profileId !== 'string') return null;
  return {
    id: obj.id,
    name: obj.name,
    path: obj.path,
    sourceType: obj.sourceType,
    profileId: obj.sourceType === 'smb' ? (obj.profileId as string) : undefined,
    isDirectory: obj.isDirectory,
    createdAt: obj.createdAt,
  };
}

export const useFavoriteStore = create<FavoriteStoreState>()((set, get) => ({
  favorites: [],
  loaded: false,

  addFavorite: (item) => {
    const id = makeFavoriteId(item.path, item.sourceType, item.profileId);
    const existing = get().favorites;
    if (existing.some((f) => f.id === id)) return;
    const newItem: FavoriteItem = { ...item, id, createdAt: Date.now() };
    const next = [...existing, newItem];
    set({ favorites: next });
    void persistFavorites(next);
  },

  removeFavorite: (id) => {
    const next = get().favorites.filter((f) => f.id !== id);
    set({ favorites: next });
    void persistFavorites(next);
  },

  isFavorite: (path, sourceType, profileId) => {
    const id = makeFavoriteId(path, sourceType, profileId);
    return get().favorites.some((f) => f.id === id);
  },

  loadFavorites: async () => {
    try {
      const { value } = await Preferences.get({ key: FAVORITES_PREF_KEY });
      if (!value) {
        set({ loaded: true });
        return;
      }
      const parsed = JSON.parse(value) as { version: number; items: unknown[] };
      if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.items)) {
        set({ favorites: [], loaded: true });
        return;
      }
      const sanitized = parsed.items
        .map(sanitizeFavoriteItem)
        .filter((item): item is FavoriteItem => item !== null);
      set({ favorites: sanitized, loaded: true });
      if (sanitized.length !== parsed.items.length) {
        void persistFavorites(sanitized);
      }
    } catch {
      set({ favorites: [], loaded: true });
    }
  },
}));

async function persistFavorites(favorites: FavoriteItem[]): Promise<void> {
  try {
    const payload = JSON.stringify({ version: STORAGE_VERSION, items: favorites });
    await Preferences.set({ key: FAVORITES_PREF_KEY, value: payload });
  } catch {
    // 持久化失败不阻断 UI 操作（内存态已更新）
  }
}