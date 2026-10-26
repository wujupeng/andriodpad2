export interface UpdateManifest {
  versionCode: number;
  versionName: string;
  fileName: string;
  sha256: string;
  minVersionCode?: number;
  releaseNotes?: string;
  publishedAt?: string;
}

export type UpdateStatus =
  | 'idle' | 'checking' | 'available' | 'downloading'
  | 'verifying' | 'ready' | 'installing' | 'success' | 'failed' | 'skipped';

export type UpdateErrorCategory =
  | 'auth_failed' | 'timeout' | 'unreachable' | 'network_lost'
  | 'permission_denied' | 'disk_full' | 'unknown'
  | 'manifest_invalid' | 'verify_failed' | 'signature_mismatch' | 'permission_missing';

export interface UpdateInfo {
  manifest: UpdateManifest;
  forceUpdate: boolean;
}

export interface CurrentVersion {
  versionCode: number;
  versionName: string;
}

export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
}

export interface DownloadProgressEvent extends DownloadProgress {}

export interface UpdatePluginInterface {
  connectToUpdateSource(options: { host: string; share: string; username: string; password: string; domain?: string }): Promise<{ connected: boolean }>;
  disconnectUpdateSource(): Promise<void>;
  readUpdateManifest(options: { path: string }): Promise<{ manifest: UpdateManifest }>;
  downloadApk(options: { path: string; fileName: string }): Promise<{ localPath: string; size: number }>;
  cancelDownload(): Promise<void>;
  calculateSha256(options: { path: string }): Promise<{ sha256: string }>;
  verifySignature(options: { path: string }): Promise<{ verified: boolean }>;
  triggerInstall(options: { path: string }): Promise<{ launched: boolean }>;
  getCurrentVersion(): Promise<CurrentVersion>;
}