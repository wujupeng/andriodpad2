/**
 * 本地文件系统适配层（TASK-LSO-01~04，design.md 模块 A）。
 * 封装 @capacitor/filesystem，提供与 SmbPlugin 同形的操作接口。
 * 纯新增文件，不触碰冻结区（SmbPlugin.ts/core/android 既有签名零变更）。
 *
 * 路径约定：所有 path 均为相对 Directory.ExternalStorage 的路径，
 * 以 '/' 分隔，根目录为 ''（空串）。
 *
 * 异常映射：权限不足→permission_denied、路径不存在→not_found、
 * 名称冲突→conflict、其他→unknown。
 */
import { Filesystem, Directory } from '@capacitor/filesystem';
import type { FileInfo } from '@capacitor/filesystem';
import type {
  LocalFileEntry,
  LocalListResult,
  LocalFsError,
  LocalFsErrorCategory,
  LocalTransferOptions,
} from './types';
import { MAX_RECURSION_DEPTH } from './types';

/** 拼接相对路径（根目录为 ''） */
function joinPath(parent: string, child: string): string {
  if (!parent) return child;
  if (parent.endsWith('/')) return parent + child;
  return `${parent}/${child}`;
}

/** 从相对路径提取文件名 */
function basename(path: string): string {
  if (!path) return '';
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

/** 从相对路径提取父目录 */
function dirname(path: string): string {
  if (!path) return '';
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(0, idx) : '';
}

/** 将 Capacitor Filesystem 错误映射为 LocalFsError */
function mapLocalError(error: unknown): LocalFsError {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  let category: LocalFsErrorCategory;
  if (lower.includes('not found') || lower.includes('enoent') || lower.includes('does not exist')) {
    category = 'not_found';
  } else if (lower.includes('permission') || lower.includes('eacces') || lower.includes('denied')) {
    category = 'permission_denied';
  } else if (lower.includes('exist') || lower.includes('eexist') || lower.includes('already')) {
    category = 'conflict';
  } else {
    category = 'unknown';
  }
  return { category, userMessage: msg };
}

/** 抛出映射后的 LocalFsError（保持 Error 原型链，message 含分类前缀供 mapSmbError 兜底） */
function throwLocalError(error: unknown): never {
  const mapped = mapLocalError(error);
  throw new Error(`[local:${mapped.category}] ${mapped.userMessage}`);
}

/** 将 FileInfo 转为 LocalFileEntry */
function toEntry(info: FileInfo, parentPath: string): LocalFileEntry {
  return {
    name: info.name,
    isDirectory: info.type === 'directory',
    size: info.size,
    lastModified: info.mtime,
    path: joinPath(parentPath, info.name),
  };
}

export const LocalFsAdapter = {
  /**
   * 列出目录内容（TASK-LSO-01，R-LSO-06）。
   * @param path 相对 ExternalStorage 的目录路径，'' 表示根
   */
  async listDirectory(path: string): Promise<LocalListResult> {
    try {
      const result = await Filesystem.readdir({
        path: path || '',
        directory: Directory.ExternalStorage,
      });
      const files = result.files.map((f) => toEntry(f, path));
      return { files };
    } catch (error) {
      throwLocalError(error);
    }
  },

  /**
   * 创建文件夹（TASK-LSO-02，R-LSO-07）。
   * @param parentPath 父目录相对路径
   * @param name 新文件夹名
   */
  async createDirectory(parentPath: string, name: string): Promise<void> {
    try {
      await Filesystem.mkdir({
        path: joinPath(parentPath, name),
        directory: Directory.ExternalStorage,
        recursive: false,
      });
    } catch (error) {
      throwLocalError(error);
    }
  },

  /**
   * 重命名文件/文件夹（TASK-LSO-02，R-LSO-08）。
   * @param path 相对路径
   * @param newName 新名称
   */
  async renameFile(path: string, newName: string): Promise<void> {
    try {
      const parent = dirname(path);
      await Filesystem.rename({
        from: path,
        to: joinPath(parent, newName),
        directory: Directory.ExternalStorage,
        toDirectory: Directory.ExternalStorage,
      });
    } catch (error) {
      throwLocalError(error);
    }
  },

  /**
   * 删除单文件（TASK-LSO-02，R-LSO-09）。
   */
  async deleteFile(path: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path,
        directory: Directory.ExternalStorage,
      });
    } catch (error) {
      throwLocalError(error);
    }
  },

  /**
   * 递归删除文件夹（TASK-LSO-03，R-LSO-10）。
   * 尽力语义：子项删除失败不回滚已删除部分，聚合失败清单。
   * @returns failures 失败项清单（path/reason）
   */
  async deleteDirectory(
    path: string,
    depth = 0,
  ): Promise<{ failures: { path: string; reason: string }[] }> {
    if (depth > MAX_RECURSION_DEPTH) {
      return { failures: [{ path, reason: '递归深度超限（>32 层）' }] };
    }
    const failures: { path: string; reason: string }[] = [];
    try {
      const result = await Filesystem.readdir({
        path,
        directory: Directory.ExternalStorage,
      });
      for (const child of result.files) {
        const childPath = joinPath(path, child.name);
        if (child.type === 'directory') {
          const sub = await this.deleteDirectory(childPath, depth + 1);
          failures.push(...sub.failures);
        } else {
          try {
            await this.deleteFile(childPath);
          } catch (e) {
            failures.push({ path: childPath, reason: e instanceof Error ? e.message : String(e) });
          }
        }
      }
      try {
        await Filesystem.rmdir({
          path,
          directory: Directory.ExternalStorage,
          recursive: false,
        });
      } catch (e) {
        if (failures.length === 0) {
          failures.push({ path, reason: e instanceof Error ? e.message : String(e) });
        }
      }
    } catch (error) {
      throwLocalError(error);
    }
    return { failures };
  },

  /**
   * 复制单文件（TASK-LSO-04，R-LSO-16）。
   * @param source 源相对路径
   * @param destinationDir 目标目录相对路径
   * @param destFileName 目标文件名（缺省取源名）
   * @param overwrite 是否覆盖已存在目标
   */
  async copyFile(
    source: string,
    destinationDir: string,
    destFileName?: string,
    overwrite?: boolean,
  ): Promise<{ success: boolean; bytesCopied: number }> {
    const destName = destFileName ?? basename(source);
    const destPath = joinPath(destinationDir, destName);
    if (!overwrite) {
      const exists = await this.exists(destPath);
      if (exists) {
        throw new Error(`[local:conflict] 目标已存在：${destPath}`);
      }
    }
    try {
      const stat = await Filesystem.stat({
        path: source,
        directory: Directory.ExternalStorage,
      });
      await Filesystem.copy({
        from: source,
        to: destPath,
        directory: Directory.ExternalStorage,
        toDirectory: Directory.ExternalStorage,
      });
      return { success: true, bytesCopied: stat.size };
    } catch (error) {
      throwLocalError(error);
    }
  },

  /**
   * 递归复制文件夹（TASK-LSO-03，R-LSO-16/18）。
   * @param source 源文件夹相对路径
   * @param destinationDir 目标父目录相对路径
   * @param destDirName 目标文件夹名（缺省取源名）
   * @param overwrite 覆盖授权
   * @param depth 递归深度
   */
  async copyDirectory(
    source: string,
    destinationDir: string,
    destDirName?: string,
    overwrite?: boolean,
    depth = 0,
  ): Promise<{ success: boolean; totalFiles: number; totalBytes: number; failures: { path: string; reason: string }[] }> {
    if (depth > MAX_RECURSION_DEPTH) {
      return { success: false, totalFiles: 0, totalBytes: 0, failures: [{ path: source, reason: '递归深度超限' }] };
    }
    const targetName = destDirName ?? basename(source);
    const targetPath = joinPath(destinationDir, targetName);
    const failures: { path: string; reason: string }[] = [];
    let totalFiles = 0;
    let totalBytes = 0;

    try {
      const exists = await this.exists(targetPath);
      if (exists && !overwrite) {
        throw new Error(`[local:conflict] 目标已存在：${targetPath}`);
      }
      if (!exists) {
        await this.createDirectory(destinationDir, targetName);
      }
      const result = await Filesystem.readdir({
        path: source,
        directory: Directory.ExternalStorage,
      });
      for (const child of result.files) {
        const srcChild = joinPath(source, child.name);
        if (child.type === 'directory') {
          const sub = await this.copyDirectory(srcChild, targetPath, child.name, overwrite, depth + 1);
          totalFiles += sub.totalFiles;
          totalBytes += sub.totalBytes;
          failures.push(...sub.failures);
        } else {
          try {
            const r = await this.copyFile(srcChild, targetPath, child.name, overwrite);
            totalFiles += 1;
            totalBytes += r.bytesCopied;
          } catch (e) {
            failures.push({ path: srcChild, reason: e instanceof Error ? e.message : String(e) });
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('[local:')) throw error;
      throwLocalError(error);
    }
    return { success: failures.length === 0, totalFiles, totalBytes, failures };
  },

  /**
   * 移动单文件（原子语义，TASK-LSO-04，R-LSO-17，DFX 4.2-3）。
   * 策略：copy + 验证 + delete 源。目标写入成功后才删源（无文件消失窗口）。
   */
  async moveFile(
    source: string,
    destinationDir: string,
    destFileName?: string,
    overwrite?: boolean,
  ): Promise<{ success: boolean; bytesCopied: number }> {
    const destName = destFileName ?? basename(source);
    const destPath = joinPath(destinationDir, destName);
    if (!overwrite) {
      const exists = await this.exists(destPath);
      if (exists) {
        throw new Error(`[local:conflict] 目标已存在：${destPath}`);
      }
    }
    try {
      const stat = await Filesystem.stat({
        path: source,
        directory: Directory.ExternalStorage,
      });
      await Filesystem.copy({
        from: source,
        to: destPath,
        directory: Directory.ExternalStorage,
        toDirectory: Directory.ExternalStorage,
      });
      const verify = await Filesystem.stat({
        path: destPath,
        directory: Directory.ExternalStorage,
      });
      if (verify.size !== stat.size) {
        await Filesystem.deleteFile({ path: destPath, directory: Directory.ExternalStorage }).catch(() => {});
        throw new Error('[local:unknown] 移动校验失败：目标大小不一致');
      }
      await Filesystem.deleteFile({
        path: source,
        directory: Directory.ExternalStorage,
      });
      return { success: true, bytesCopied: stat.size };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('[local:')) throw error;
      throwLocalError(error);
    }
  },

  /**
   * 递归移动文件夹（原子语义：逐项 copy+verify+delete 源）。
   */
  async moveDirectory(
    source: string,
    destinationDir: string,
    destDirName?: string,
    overwrite?: boolean,
    depth = 0,
  ): Promise<{ success: boolean; totalFiles: number; totalBytes: number; failures: { path: string; reason: string }[] }> {
    if (depth > MAX_RECURSION_DEPTH) {
      return { success: false, totalFiles: 0, totalBytes: 0, failures: [{ path: source, reason: '递归深度超限' }] };
    }
    const targetName = destDirName ?? basename(source);
    const targetPath = joinPath(destinationDir, targetName);
    const failures: { path: string; reason: string }[] = [];
    let totalFiles = 0;
    let totalBytes = 0;

    try {
      const exists = await this.exists(targetPath);
      if (exists && !overwrite) {
        throw new Error(`[local:conflict] 目标已存在：${targetPath}`);
      }
      if (!exists) {
        await this.createDirectory(destinationDir, targetName);
      }
      const result = await Filesystem.readdir({
        path: source,
        directory: Directory.ExternalStorage,
      });
      for (const child of result.files) {
        const srcChild = joinPath(source, child.name);
        if (child.type === 'directory') {
          const sub = await this.moveDirectory(srcChild, targetPath, child.name, overwrite, depth + 1);
          totalFiles += sub.totalFiles;
          totalBytes += sub.totalBytes;
          failures.push(...sub.failures);
        } else {
          try {
            const r = await this.moveFile(srcChild, targetPath, child.name, overwrite);
            totalFiles += 1;
            totalBytes += r.bytesCopied;
          } catch (e) {
            failures.push({ path: srcChild, reason: e instanceof Error ? e.message : String(e) });
          }
        }
      }
      if (failures.length === 0) {
        await Filesystem.rmdir({
          path: source,
          directory: Directory.ExternalStorage,
          recursive: false,
        }).catch(() => {});
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('[local:')) throw error;
      throwLocalError(error);
    }
    return { success: failures.length === 0, totalFiles, totalBytes, failures };
  },

  /**
   * 获取文件属性（TASK-LSO-04）。
   */
  async getFileAttributes(path: string): Promise<{ size: number; lastModified: number; isDirectory: boolean }> {
    try {
      const stat = await Filesystem.stat({
        path,
        directory: Directory.ExternalStorage,
      });
      return {
        size: stat.size,
        lastModified: stat.mtime,
        isDirectory: stat.type === 'directory',
      };
    } catch (error) {
      throwLocalError(error);
    }
  },

  /**
   * 判断路径是否存在（TASK-LSO-04）。
   */
  async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat({
        path,
        directory: Directory.ExternalStorage,
      });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * 将相对 ExternalStorage 的路径转为绝对路径（供 uploadFromLocal/uploadDirectoryFromLocal 使用）。
   * Filesystem.getUri 返回形如 "file:///storage/emulated/0/path" 的 URI，剥离 file:// 前缀即绝对路径。
   */
  async getAbsolutePath(relativePath: string): Promise<string> {
    const result = await Filesystem.getUri({
      path: relativePath || '.',
      directory: Directory.ExternalStorage,
    });
    return result.uri.replace(/^file:\/\//, '');
  },
} as const;

export { joinPath, basename, dirname };
export type { LocalFileEntry, LocalListResult, LocalFsError, LocalFsErrorCategory, LocalTransferOptions };