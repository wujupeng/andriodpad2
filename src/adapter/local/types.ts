/**
 * 本地文件系统条目类型（TASK-LSO-01）。
 * 字段与 SmbFileEntry 对齐（name/isDirectory/size/lastModified/path），
 * 供 localBrowseStore 与 operationStore 跨源分发统一消费。
 * path 为相对 Directory.ExternalStorage 的路径，以 '/' 分隔（根目录为 ''）。
 */
export interface LocalFileEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
  path: string;
}

export interface LocalListResult {
  files: LocalFileEntry[];
}

/**
 * 本地文件操作错误分类（与 smbErrorMapper.SmbErrorCategory 对齐子集）。
 * 供 localBrowseStore 与 operationStore 统一错误语义。
 */
export type LocalFsErrorCategory =
  | 'not_found'
  | 'permission_denied'
  | 'conflict'
  | 'disk_full'
  | 'unknown';

export interface LocalFsError {
  category: LocalFsErrorCategory;
  userMessage: string;
}

/** 跨源传输选项（与 operationStore.TransferOptions 对齐子集） */
export interface LocalTransferOptions {
  overwrite?: boolean;
  destNames?: Record<string, string>;
}

/** 递归深度上限（缓解 R-2 深目录栈溢出） */
export const MAX_RECURSION_DEPTH = 32;