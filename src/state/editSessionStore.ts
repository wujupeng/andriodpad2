/**
 * 编辑会话 store（design.md 2.6.2-A，最核心接口）
 * 十四值状态机（11 业务态 + 终止态细分，spec 6.2-1）。
 * 安全约束（spec 4.2-1、design.md 2.5.2）：
 * - 不暴露任何裸 setState 类方法；迁移仅经语义化事实驱动 action；
 * - WRITEBACK_SUCCESS 仅由 applyWritebackResult(writebackSuccess===true) 事实路径可达。
 * 状态机实现填充于 TASK-S5-01（契约冻结骨架，R-07）。
 */
import { create } from 'zustand';
import { App } from '@capacitor/app';
import SmbPlugin from '../adapter/smb/SmbPlugin';
import type {
  FileChangeResult,
  RemoteChangeResult,
  WritebackResult,
} from '../adapter/smb/SmbPlugin';
import type { SmbErrorCategory } from '../utils/smbErrorMapper';

export type EditSessionState =
  | 'idle'
  | 'opening'
  | 'open_failed'
  | 'opened'
  | 'editing'
  | 'saving'
  | 'writeback_pending'
  | 'writeback_success'
  | 'writeback_failed'
  | 'conflict'
  | 'saveas_detected'
  | 'network_interrupted'
  | 'session_invalid'
  | 'session_terminated';

export interface BaselineInfo {
  remotePath: string;
  fileName: string;
  baselineMtime: number;
  baselineSha256: string;
  localCachePath: string;
  sourceProfileId: string;
}

export interface TimelineEntry {
  state: EditSessionState;
  timestamp: number;
  detail?: string;
}

export interface WritebackProgress {
  percentage: number;
  bytesTransferred: number;
  totalBytes: number;
}

export interface SaveAsCandidate {
  candidatePath: string;
  prompt: string;
}

export interface ConflictInfo {
  remoteMtime: number;
  baselineMtime: number;
}

export interface EditSessionError {
  category: SmbErrorCategory;
  userMessage: string;
  raw?: string;
}

export type SaveAsChoice = 'OVERWRITE_ORIGINAL' | 'WRITE_AS_NEW' | 'DISCARD';
export type ConflictChoice =
  | 'SAVE_AS_COPY'
  | 'RELOAD'
  | 'OVERWRITE_CONFIRMED'
  | 'DISCARD';

export type ManualStepAction =
  | 'check-change'
  | 'writeback'
  | 'check-remote'
  | 'foreground-check';

export interface EditSessionStoreState {
  state: EditSessionState;
  baseline: BaselineInfo | null;
  timeline: TimelineEntry[];
  writebackProgress: WritebackProgress | null;
  pendingSaveAs: SaveAsCandidate | null;
  conflictInfo: ConflictInfo | null;
  lastError: EditSessionError | null;

  openFile(profileId: string, filePath: string): Promise<void>;
  applyForegroundCheckResult(result: FileChangeResult): void;
  applyWritebackResult(result: WritebackResult): void;
  applyRemoteCheckResult(result: RemoteChangeResult): void;
  applySaveAsDiscovery(result: FileChangeResult): void;
  resolveSaveAs(choice: SaveAsChoice): Promise<void>;
  resolveConflict(choice: ConflictChoice): Promise<void>;
  applyError(error: { category: SmbErrorCategory; message: string }): void;
  notifyAppStateChange(active: boolean): void;
  closeSession(): void;
  /** 手动驱动兼容（M2 页面模式，spec 1.2.2 约束 4；TASK-S5-04 收口） */
  manualStep(action: ManualStepAction): Promise<void>;
}

function transition(
  set: (partial: Partial<EditSessionStoreState>) => void,
  get: () => EditSessionStoreState,
  nextState: EditSessionState,
  detail?: string,
): void {
  set({
    state: nextState,
    timeline: [...get().timeline, { state: nextState, timestamp: Date.now(), detail }],
  });
}

export const useEditSessionStore = create<EditSessionStoreState>()((set, get) => ({
  state: 'idle',
  baseline: null,
  timeline: [],
  writebackProgress: null,
  pendingSaveAs: null,
  conflictInfo: null,
  lastError: null,

  openFile: async (profileId, filePath) => {
    transition(set, get, 'opening');
    try {
      const result = await SmbPlugin.openInWps({ path: filePath });
      const baseline: BaselineInfo = {
        remotePath: filePath,
        fileName: filePath.split('/').pop() || filePath,
        baselineMtime: result.baselineMtime,
        baselineSha256: result.baselineHash,
        localCachePath: result.localPath,
        sourceProfileId: profileId,
      };
      set({ baseline });
      transition(set, get, 'opened');
      const listener = await App.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) return;
        try {
          const checkResult = await SmbPlugin.checkLocalFileChanged();
          get().applyForegroundCheckResult(checkResult);
          if (checkResult.changed && get().state === 'editing') {
            transition(set, get, 'writeback_pending');
            const wbResult = await SmbPlugin.writeback();
            get().applyWritebackResult(wbResult);
          }
        } catch (err) {
          get().applyError({ category: 'unknown', message: String(err) });
        }
        await listener.remove();
      });
    } catch (err) {
      set({ lastError: { category: 'unknown', userMessage: String(err) } });
      transition(set, get, 'open_failed', String(err));
    }
  },

  applyForegroundCheckResult: (result) => {
    const cur = get();
    if (cur.state !== 'opened' && cur.state !== 'editing') return;
    if (result.saveAsDiscovered) {
      set({
        pendingSaveAs: result.saveAsFilePath
          ? { candidatePath: result.saveAsFilePath, prompt: result.saveAsPrompt || '' }
          : null,
      });
      transition(set, get, 'saveas_detected');
    } else if (result.changed) {
      transition(set, get, 'editing');
    }
  },

  applyWritebackResult: (result) => {
    if (result.writebackSuccess) {
      transition(set, get, 'writeback_success');
    } else {
      set({
        lastError: result.error
          ? { category: 'unknown', userMessage: result.error }
          : null,
      });
      transition(set, get, 'writeback_failed', result.error);
    }
  },

  applyRemoteCheckResult: (result) => {
    if (result.remoteChanged) {
      set({
        conflictInfo: { remoteMtime: result.remoteMtime, baselineMtime: result.baselineMtime },
      });
      transition(set, get, 'conflict');
    }
  },

  applySaveAsDiscovery: (result) => {
    set({
      pendingSaveAs: result.saveAsFilePath
        ? { candidatePath: result.saveAsFilePath, prompt: result.saveAsPrompt || '' }
        : null,
    });
    transition(set, get, 'saveas_detected');
  },

  resolveSaveAs: async (choice) => {
    const cur = get();
    if (choice === 'DISCARD') {
      set({ pendingSaveAs: null });
      transition(set, get, 'session_terminated', 'saveas discarded');
      return;
    }
    try {
      await SmbPlugin.resolveSaveAs({ choice, saveAsFilePath: cur.pendingSaveAs?.candidatePath });
      set({ pendingSaveAs: null });
      transition(set, get, 'opened', `saveas resolved: ${choice}`);
    } catch (err) {
      get().applyError({ category: 'unknown', message: String(err) });
    }
  },

  resolveConflict: async (choice) => {
    set({ conflictInfo: null });
    if (choice === 'DISCARD') {
      transition(set, get, 'session_terminated', 'conflict discarded');
      return;
    }
    if (choice === 'OVERWRITE_CONFIRMED') {
      transition(set, get, 'writeback_pending');
      try {
        const wbResult = await SmbPlugin.writeback();
        get().applyWritebackResult(wbResult);
      } catch (err) {
        get().applyError({ category: 'unknown', message: String(err) });
      }
      return;
    }
    transition(set, get, 'opened', `conflict resolved: ${choice}`);
  },

  applyError: (error) => {
    const nextState: EditSessionState =
      error.category === 'network_lost' || error.category === 'unreachable'
        ? 'network_interrupted'
        : 'session_invalid';
    set({ lastError: { category: error.category, userMessage: error.message } });
    transition(set, get, nextState, error.message);
  },

  notifyAppStateChange: (active) => {
    if (!active) return;
    const cur = get();
    if (cur.state === 'network_interrupted') {
      transition(set, get, 'opened', 'network restored');
    }
  },

  closeSession: () => {
    set({ baseline: null, pendingSaveAs: null, conflictInfo: null });
    transition(set, get, 'session_terminated');
  },

  manualStep: async (action) => {
    try {
      if (action === 'check-change') {
        get().applyForegroundCheckResult(await SmbPlugin.checkLocalFileChanged());
      } else if (action === 'writeback') {
        transition(set, get, 'writeback_pending');
        get().applyWritebackResult(await SmbPlugin.writeback());
      } else if (action === 'check-remote') {
        get().applyRemoteCheckResult(await SmbPlugin.checkRemoteChanged());
      } else if (action === 'foreground-check') {
        get().applyForegroundCheckResult(await SmbPlugin.foregroundCheck());
      }
    } catch (err) {
      get().applyError({ category: 'unknown', message: String(err) });
    }
  },
}));