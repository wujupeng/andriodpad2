import { registerPlugin } from '@capacitor/core';

export interface SmbConnectOptions {
  host: string;
  share: string;
  username?: string;
  password?: string;
  domain?: string;
}

export interface SmbConnectResult {
  connected: boolean;
  host: string;
  share: string;
}

export interface SmbFileEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
  path: string;
}

export interface SmbListResult {
  files: SmbFileEntry[];
}

export interface WpsOpenResult {
  uri: string;
  localPath: string;
  baselineHash: string;
  baselineMtime: number;
  remoteMtime?: number;
  fileSize?: number;
  mimeType?: string;
  appName?: string;
  isWps?: boolean;
  intentLaunched: boolean;
  intentAction?: string;
  uriScheme?: string;
  sessionId?: string;
  sessionStatus?: string;
  streamingUsed?: boolean;
  cacheElapsedMs?: number;
  errorType?: string;
  fallbackTried?: boolean;
  error?: string;
}

export interface FileChangeResult {
  changed: boolean;
  currentMtime: number;
  baselineMtime: number;
  newHash?: string;
  baselineHash?: string;
  contentChanged?: boolean;
  observerDetectedChange?: boolean;
  observerEventLog?: string;
  error?: string;
  saveAsDiscovered?: boolean;
  saveAsFilePath?: string;
  saveAsPrompt?: string;
}

export interface SaveAsResolveOptions {
  choice: 'OVERWRITE_ORIGINAL' | 'WRITE_AS_NEW' | 'DISCARD';
  saveAsFilePath?: string;
}

export interface SaveAsResolveResult {
  writebackSuccess: boolean;
  localHash?: string;
  verifyHash?: string;
  remoteMtimeBefore: number;
  remoteMtimeAfter: number;
  choice: 'OVERWRITE_ORIGINAL' | 'WRITE_AS_NEW' | 'DISCARD';
  error?: string;
}

export interface WritebackResult {
  writebackSuccess: boolean;
  localHash: string;
  verifyHash: string;
  remoteMtimeBefore: number;
  remoteMtimeAfter: number;
  error?: string;
}

export interface RemoteChangeResult {
  remoteMtime: number;
  baselineMtime: number;
  remoteChanged: boolean;
  error?: string;
}

export interface SessionInfoResult {
  sessionId?: string;
  remotePath?: string;
  localCachePath?: string;
  fileName?: string;
  baselineSha256?: string;
  status?: string;
  uriScheme?: string;
  intentAction?: string;
  openSessions: number;
}

export interface WpsInstallResult {
  installed: boolean;
  packageName: string | null;
}

export interface SmbPluginInterface {
  connect(options: SmbConnectOptions): Promise<SmbConnectResult>;
  disconnect(): Promise<void>;
  isConnected(): Promise<{ connected: boolean }>;
  listDirectory(options: { path?: string }): Promise<SmbListResult>;
  openInWps(options: { path: string }): Promise<WpsOpenResult>;
  checkLocalFileChanged(): Promise<FileChangeResult>;
  foregroundCheck(): Promise<FileChangeResult>;
  resolveSaveAs(options: SaveAsResolveOptions): Promise<SaveAsResolveResult>;
  writeback(): Promise<WritebackResult>;
  checkRemoteChanged(): Promise<RemoteChangeResult>;
  getFileAttributes(options: { path: string }): Promise<{ size: number; lastWriteTime: number }>;
  cleanup(): Promise<void>;
  writeTextFile(options: { path: string; content: string }): Promise<{ success: boolean; path: string }>;
  ensureDirectory(options: { path: string }): Promise<{ success: boolean; path: string }>;
  /** TASK-S5-03：远端复制（流式+临时文件+原子落位+SHA-256 校验；目标存在且未授权覆盖走 reject） */
  copyFile(options: {
    sourcePath: string;
    destinationDir: string;
    destFileName?: string;
    overwrite?: boolean;
  }): Promise<{ success: boolean; bytesCopied: number; sha256: string }>;
  /** TASK-S5-03：远端移动（copy+SHA 校验成功后才删除源；无文件消失窗口） */
  moveFile(options: {
    sourcePath: string;
    destinationDir: string;
    destFileName?: string;
    overwrite?: boolean;
  }): Promise<{ success: boolean; bytesCopied: number; sha256: string }>;
  /** TASK-S5-04-R：远端重命名（完整共享相对路径+replaceIfExists=false 服务端原子防覆盖；目标存在走 reject→conflict 类） */
  renameFile(options: { path: string; newName: string }): Promise<{ success: boolean }>;
  /** TASK-S5-05：远端单文件删除（目录拒绝/不存在明确失败/删除后服务器核验；错误走 reject→mapper 分类） */
  deleteRemoteFile(options: { path: string }): Promise<{ success: boolean }>;
  exportLog(options: { logDir?: string; content: string; fileName: string }): Promise<{ success: boolean; path: string }>;
  getSessionInfo(): Promise<SessionInfoResult>;
  isWpsInstalled(): Promise<WpsInstallResult>;
}

const SmbPlugin = registerPlugin<SmbPluginInterface>('SmbPlugin');

export default SmbPlugin;