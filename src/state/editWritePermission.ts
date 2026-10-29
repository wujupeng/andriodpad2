/**
 * 编辑会话写回权限守卫（AU-006 TASK-06，design.md §2.2.2.3 路径级判定）。
 *
 * 纯函数——不依赖 SmbPlugin/Capacitor，可在 Node.js 测试环境独立验证。
 * editSessionStore 所有写入口经此函数判定后再执行状态转换。
 *
 * 三条件 AND（默认拒绝）：
 * 1. baseline 存在（remotePath 非空）
 * 2. isWriteEnabledForPath(path) — 全局开关 × 路径边界 × 账户权限
 * 3. candidatePath（saveas 场景）同样须通过路径边界校验
 *
 * 追溯：REQ-P4-04、REQ-DFX-SEC-04/06/07、design.md §2.5.2 三层防御
 */
import { isWriteEnabledForPath } from './writePermission.ts';
import { READ_ONLY_MODE, READ_ONLY_NOTICES } from './readOnlyMode.ts';

export interface WritePermissionCheckResult {
  permitted: boolean;
  reason?: string;
}

/**
 * 判定编辑会话是否允许写回操作。
 *
 * @param remotePath — 当前打开文件的远端路径（baseline.remotePath），null 表示未打开
 * @param candidatePath — saveas 场景的目标路径（可选），提供时检查此路径而非 remotePath
 * @returns { permitted: true } 或 { permitted: false, reason: '...' }
 *
 * 拒绝场景：
 * - remotePath 为 null/空 → 未打开文件基线
 * - READ_ONLY_MODE=true → 全局只读（AU-005 兼容）
 * - 路径不在受限可写目录内 → 路径越界
 * - 专用账户无权限 → 账户未授权
 */
export function checkEditWritePermission(
  remotePath: string | null,
  candidatePath?: string,
): WritePermissionCheckResult {
  if (!remotePath) {
    return { permitted: false, reason: '写回权限不足：未打开文件基线' };
  }
  const pathToCheck = candidatePath ?? remotePath;
  if (!isWriteEnabledForPath(pathToCheck)) {
    if (READ_ONLY_MODE) {
      return { permitted: false, reason: READ_ONLY_NOTICES.writebackDisabledReason };
    }
    return { permitted: false, reason: '写回权限不足：该路径不在可写目录范围内' };
  }
  return { permitted: true };
}