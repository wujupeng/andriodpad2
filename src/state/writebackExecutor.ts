/**
 * SMB 写回执行器（AU-006 TASK-07，PM 授权：不触碰生产环境）。
 *
 * 编排写回全链路：权限检查 → 冲突检测 → 写回 → SHA-256 校验 → 重试 → 错误分类。
 * 依赖注入 SmbPlugin 方法（writeback/checkRemoteChanged），纯函数可测试。
 * 不直接 import SmbPlugin——由调用方（editSessionStore）注入 deps。
 *
 * 安全保证：
 * - 权限拒绝时不调用任何 SmbPlugin 方法
 * - 冲突时不自动覆盖（须用户显式决策）
 * - 写回成功须 SHA-256 校验通过（localHash === verifyHash）
 * - 网络错误可重试，其余错误不重试
 * - 写入失败明确报告，禁止以 UI 提示代替真实写入证据
 *
 * 追溯：REQ-P4-04、REQ-DFX-SEC-04、design.md §2.5.2 三层防御
 */
import { checkEditWritePermission } from './editWritePermission.ts';

export interface WritebackExecutorOptions {
  remotePath: string;
  baselineSha256: string;
  baselineMtime: number;
  maxRetries?: number;
  retryDelayMs?: number;
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

export interface WritebackDeps {
  writeback: () => Promise<WritebackResult>;
  checkRemoteChanged: () => Promise<RemoteChangeResult>;
  sleep?: (ms: number) => Promise<void>;
  checkPermission?: (remotePath: string) => { permitted: boolean; reason?: string };
}

export type WritebackErrorCategory =
  | 'permission_denied'
  | 'conflict'
  | 'network_error'
  | 'write_failed'
  | 'verify_failed'
  | 'no_baseline'
  | 'unknown';

export interface WritebackError {
  category: WritebackErrorCategory;
  message: string;
  retryable: boolean;
}

export interface WritebackExecutorResult {
  success: boolean;
  localHash?: string;
  verifyHash?: string;
  remoteMtimeBefore?: number;
  remoteMtimeAfter?: number;
  error?: WritebackError;
  retriesAttempted: number;
}

const NETWORK_PATTERNS = [
  'network', 'timeout', 'unreachable', 'disconnected', 'econnrefused',
  'etimedout', 'enetunreach', 'ehostunreach', 'socket', 'broken pipe',
];

function isNetworkError(message: string): boolean {
  const lower = message.toLowerCase();
  return NETWORK_PATTERNS.some((p) => lower.includes(p));
}

function makeError(
  category: WritebackErrorCategory,
  message: string,
  retryable: boolean,
): WritebackError {
  return { category, message, retryable };
}

/**
 * 执行写回全链路。
 *
 * @param options — 远端路径+基线信息+重试配置
 * @param deps — 注入的 SmbPlugin 方法（writeback/checkRemoteChanged/sleep）
 * @returns WritebackExecutorResult — 含 success/error/retriesAttempted
 *
 * 流程：
 * 1. 权限检查（checkEditWritePermission）— 拒绝时不调用任何 deps
 * 2. 冲突检测（checkRemoteChanged）— 远端已修改则拒绝（须用户决策）
 * 3. 写回（writeback）— 含 SHA-256 校验
 * 4. 网络错误重试（指数退避，重试前重新检测冲突）
 * 5. 结果分类报告
 */
export async function executeWriteback(
  options: WritebackExecutorOptions,
  deps: WritebackDeps,
): Promise<WritebackExecutorResult> {
  const maxRetries = options.maxRetries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 1000;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const checkPermission = deps.checkPermission ?? checkEditWritePermission;

  if (!options.remotePath) {
    return {
      success: false,
      error: makeError('no_baseline', '写回失败：远端路径为空', false),
      retriesAttempted: 0,
    };
  }

  const perm = checkPermission(options.remotePath);
  if (!perm.permitted) {
    return {
      success: false,
      error: makeError('permission_denied', perm.reason ?? '写回权限不足', false),
      retriesAttempted: 0,
    };
  }

  try {
    const remoteCheck = await deps.checkRemoteChanged();
    if (remoteCheck.remoteChanged) {
      return {
        success: false,
        error: makeError('conflict', '远端文件已修改，存在冲突', false),
        retriesAttempted: 0,
      };
    }
  } catch (err) {
    const msg = String(err);
    const isNet = isNetworkError(msg);
    return {
      success: false,
      error: makeError(
        isNet ? 'network_error' : 'unknown',
        `冲突检测失败: ${msg}`,
        isNet,
      ),
      retriesAttempted: 0,
    };
  }

  let lastError: WritebackError = makeError('unknown', '未知错误', false);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await deps.writeback();

      if (result.writebackSuccess) {
        if (result.localHash !== result.verifyHash) {
          return {
            success: false,
            localHash: result.localHash,
            verifyHash: result.verifyHash,
            remoteMtimeBefore: result.remoteMtimeBefore,
            remoteMtimeAfter: result.remoteMtimeAfter,
            error: makeError(
              'verify_failed',
              `SHA-256 校验失败: local=${result.localHash} verify=${result.verifyHash}`,
              false,
            ),
            retriesAttempted: attempt,
          };
        }
        return {
          success: true,
          localHash: result.localHash,
          verifyHash: result.verifyHash,
          remoteMtimeBefore: result.remoteMtimeBefore,
          remoteMtimeAfter: result.remoteMtimeAfter,
          retriesAttempted: attempt,
        };
      }

      const msg = result.error ?? '写回失败';
      const isNet = isNetworkError(msg);
      lastError = makeError(
        isNet ? 'network_error' : 'write_failed',
        msg,
        isNet && attempt < maxRetries,
      );
    } catch (err) {
      const msg = String(err);
      const isNet = isNetworkError(msg);
      lastError = makeError(
        isNet ? 'network_error' : 'unknown',
        msg,
        isNet && attempt < maxRetries,
      );
    }

    if (!lastError.retryable) {
      return { success: false, error: lastError, retriesAttempted: attempt };
    }

    if (attempt < maxRetries) {
      await sleep(retryDelayMs * Math.pow(2, attempt));
      try {
        const recheck = await deps.checkRemoteChanged();
        if (recheck.remoteChanged) {
          return {
            success: false,
            error: makeError('conflict', '重试时检测到远端文件已修改', false),
            retriesAttempted: attempt + 1,
          };
        }
      } catch {
        // 冲突检测失败——继续重试（best effort）
      }
    }
  }

  return {
    success: false,
    error: lastError,
    retriesAttempted: maxRetries,
  };
}