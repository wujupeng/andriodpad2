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
  intentLaunched: boolean;
  intentAction?: string;
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

export interface SmbPluginInterface {
  connect(options: SmbConnectOptions): Promise<SmbConnectResult>;
  disconnect(): Promise<void>;
  isConnected(): Promise<{ connected: boolean }>;
  listDirectory(options: { path?: string }): Promise<SmbListResult>;
  openInWps(options: { path: string }): Promise<WpsOpenResult>;
  checkLocalFileChanged(): Promise<FileChangeResult>;
  writeback(): Promise<WritebackResult>;
  checkRemoteChanged(): Promise<RemoteChangeResult>;
  getFileAttributes(options: { path: string }): Promise<{ size: number; lastWriteTime: number }>;
  cleanup(): Promise<void>;
  writeTextFile(options: { path: string; content: string }): Promise<{ success: boolean; path: string }>;
  ensureDirectory(options: { path: string }): Promise<{ success: boolean; path: string }>;
  exportLog(options: { logDir?: string; content: string; fileName: string }): Promise<{ success: boolean; path: string }>;
}

const SmbPlugin = registerPlugin<SmbPluginInterface>('SmbPlugin');

export default SmbPlugin;