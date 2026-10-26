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

export const useEditSessionStore = create<EditSessionStoreState>()(() => ({
  state: 'idle',
  baseline: null,
  timeline: [],
  writebackProgress: null,
  pendingSaveAs: null,
  conflictInfo: null,
  lastError: null,
  openFile: async (_profileId, filePath) => {
    await SmbPlugin.openInWps({ path: filePath });
    const listener = await App.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive) return;
      try {
        const checkResult = await SmbPlugin.checkLocalFileChanged();
        if (checkResult.changed) {
          await SmbPlugin.writeback();
        }
      } catch { /* 写回失败不阻塞用户操作 */ }
      await listener.remove();
    });
  },
  applyForegroundCheckResult: () => undefined,
  applyWritebackResult: () => undefined,
  applyRemoteCheckResult: () => undefined,
  applySaveAsDiscovery: () => undefined,
  resolveSaveAs: async () => undefined,
  resolveConflict: async () => undefined,
  applyError: () => undefined,
  notifyAppStateChange: () => undefined,
  closeSession: () => undefined,
  manualStep: async () => undefined,
}));