import { create } from 'zustand';
import type { UpdateStatus, UpdateInfo, DownloadProgress, UpdateErrorCategory } from '../adapter/update/types';

const VALID_TRANSITIONS: Record<UpdateStatus, UpdateStatus[]> = {
  idle: ['checking'],
  checking: ['available', 'idle', 'failed'],
  available: ['downloading', 'idle', 'skipped'],
  downloading: ['verifying', 'failed', 'idle'],
  verifying: ['ready', 'failed'],
  ready: ['installing', 'skipped'],
  installing: ['success', 'failed'],
  success: ['idle'],
  failed: ['idle', 'checking'],
  skipped: ['idle'],
};

interface UpdateState {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  progress: DownloadProgress | null;
  error: { category: UpdateErrorCategory; message: string } | null;
  lastCheckAt: number | null;
  setStatus: (status: UpdateStatus) => void;
  setUpdateInfo: (info: UpdateInfo | null) => void;
  setProgress: (p: DownloadProgress | null) => void;
  setError: (e: { category: UpdateErrorCategory; message: string } | null) => void;
  setLastCheckAt: (ts: number) => void;
  reset: () => void;
  canTransition: (to: UpdateStatus) => boolean;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  updateInfo: null,
  progress: null,
  error: null,
  lastCheckAt: null,
  setStatus: (status) => {
    const current = get().status;
    if (VALID_TRANSITIONS[current]?.includes(status) || status === 'idle') {
      set({ status, error: status === 'failed' ? get().error : null });
    }
  },
  setUpdateInfo: (updateInfo) => set({ updateInfo }),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error }),
  setLastCheckAt: (lastCheckAt) => set({ lastCheckAt }),
  reset: () => set({ status: 'idle', updateInfo: null, progress: null, error: null }),
  canTransition: (to) => {
    const current = get().status;
    return VALID_TRANSITIONS[current]?.includes(to) || to === 'idle';
  },
}));