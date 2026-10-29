/**
 * 写回权限安全原语（AU-006 design.md §2.2.2.1~2.2.2.5）。
 *
 * 权限矩阵驱动的写回安全基础设施：
 * - WRITE_ENABLED_SCOPE: 写回启用范围（专用账户+受限目录+凭据存储）
 * - WRITE_PERMISSION_MATRIX: 写回能力权限矩阵
 * - normalizeAndValidatePath: 路径规范化与目录穿越防御
 * - detectSymlink: 符号链接检测
 * - isWriteEnabledForPath: 路径级写回权限判定（三条件 AND，默认拒绝）
 *
 * 当前状态：enabled=false → 等价 AU-005 全拦截。
 * 服务器就绪后（pad2_app 账户创建 + /mnt/share/writable/ 目录 + Samba write list 配置）切换为 true。
 *
 * 追溯：REQ-P4-04、REQ-P4-11、REQ-DFX-SEC-04/06/07、数据约束 6.6-3/6.9-2/6.9-3
 */

/**
 * 写回启用范围（AU-006 design.md §2.2.2.1）。
 *
 * enabled=false 时等价 AU-005 全拦截（READ_ONLY_MODE=true）。
 * enabled=true 须在服务器侧 pad2_app 账户 + /mnt/share/writable/ 就绪后切换。
 */
export const WRITE_ENABLED_SCOPE = {
  /** 写回功能全局启用。false=AU-005 只读兼容，true=按权限矩阵选择性放行 */
  enabled: false as boolean,
  /** 专用账户名（≠ debian） */
  account: 'pad2_app' as string,
  /** 受限可写目录路径集合（⊂ /mnt/share/） */
  writablePaths: ['/mnt/share/writable/'] as readonly string[],
  /** 凭据存储设施 */
  credentialStorage: 'keystore' as 'keystore' | 'encrypted_shared_prefs',
  /** 轮换周期（天） */
  rotationPeriodDays: 90 as number,
} as const;

/**
 * 写回权限矩阵（AU-006 design.md §2.2.2.2）。
 *
 * 驱动 OPERATION_CAPABILITIES 派生——受限目录内 writeback/saveas 置 true，
 * 其余远端写操作保持 false（非写回核心，仍拦截）。
 */
export const WRITE_PERMISSION_MATRIX = {
  /** writeback 能力：受限目录内 true，外 false */
  writeback: true as boolean,
  /** saveas 能力：受限目录内 true，外 false */
  saveas: true as boolean,
  /** overwrite 策略：须用户显式确认 */
  overwrite: 'explicit_confirm' as 'explicit_confirm' | 'silent',
  /** 临时文件+重命名：受限目录内允许 */
  tempFileRename: true as boolean,
  /** 冲突检测：启用 */
  conflictDetection: true as boolean,
} as const;

/**
 * 路径规范化（自包含实现，无 Node.js path 依赖）。
 *
 * 解析 ../、./、多斜杠，生成规范化的绝对路径。
 */
function normalizePath(filePath: string): string {
  if (!filePath) return '/';
  const isAbsolute = filePath.startsWith('/');
  const segments: string[] = [];
  const parts = filePath.split('/');
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  let result = segments.join('/');
  if (isAbsolute) result = '/' + result;
  if (filePath.endsWith('/') && !result.endsWith('/')) result += '/';
  return result || (isAbsolute ? '/' : '.');
}

/**
 * 路径规范化与受限目录边界校验（AU-006 design.md §2.2.2.4，REQ-DFX-SEC-06）。
 *
 * 防御目录穿越攻击（../ 越界）与绝对路径逃逸。
 * 规范化后须位于受限目录内方放行。
 */
export function normalizeAndValidatePath(
  filePath: string,
  writableRoots: readonly string[],
): {
  normalized: string;
  isWithinWritable: boolean;
  violation?: 'traversal' | 'absolute_escape';
} {
  const normalized = normalizePath(filePath);
  const isWithinWritable = writableRoots.some(
    (root) =>
      normalized.startsWith(root) && !normalized.includes('..'),
  );
  const violation = !isWithinWritable
    ? filePath.includes('..')
      ? 'traversal'
      : 'absolute_escape'
    : undefined;
  return { normalized, isWithinWritable, violation };
}

/**
 * 符号链接检测（AU-006 design.md §2.2.2.5，REQ-DFX-SEC-07）。
 *
 * 检测到符号链接则拒绝写回。
 * 实际 lstat 须经原生桥调用，此处为类型契约定义。
 */
export interface SymlinkDetectionResult {
  isSymlink: boolean;
  reject: boolean;
}

export async function detectSymlink(
  _filePath: string,
): Promise<SymlinkDetectionResult> {
  return { isSymlink: false, reject: false };
}

/**
 * 专用账户写权限检查（AU-006 design.md §2.2.2.3 条件3，REQ-P4-11）。
 *
 * 运行时验证 pad2_app 账户是否存在且属于 pad2_app_group。
 * 当前返回 false（pad2_app 账户未创建），服务器就绪后改为真实检查。
 */
export function accountHasWritePermission(): boolean {
  return false;
}

/**
 * 判定指定路径是否启用写回（AU-006 design.md §2.2.2.3，数据约束 6.6-3）。
 *
 * 三条件 AND 逻辑（默认拒绝）：
 * 1. WRITE_ENABLED_SCOPE.enabled — 全局开关
 * 2. normalizeAndValidatePath — 路径规范化后位于受限目录内
 * 3. accountHasWritePermission — 专用账户有权限
 *
 * 任一条件失败 → return false（默认拒绝）。
 */
export function isWriteEnabledForPath(filePath: string): boolean {
  if (!WRITE_ENABLED_SCOPE.enabled) return false;
  const normalized = normalizeAndValidatePath(
    filePath,
    WRITE_ENABLED_SCOPE.writablePaths,
  );
  return normalized.isWithinWritable && accountHasWritePermission();
}

/**
 * 路径级只读判定（isWriteEnabledForPath 的否定）。
 */
export function isReadOnlyForPath(filePath: string): boolean {
  return !isWriteEnabledForPath(filePath);
}