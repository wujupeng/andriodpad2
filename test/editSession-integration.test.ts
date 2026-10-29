/**
 * 编辑会话写回链路集成测试（AU-006 TASK-08）。
 *
 * 验证调用链：executeWriteback(mockDeps) → mapWritebackExecutorResultToState → 状态映射。
 * 使用模拟 SMB 适配器（mock deps），不触碰真实服务器。
 *
 * 声明：模拟 SMB 适配器测试验证的是调用链编排逻辑（权限→冲突→写回→校验→重试→状态映射），
 * 不等同于真实 SMB 服务器写回验收。真实服务器验收须在 FRZ-EX 授权后另行执行。
 *
 * 追溯：design.md §2.5.2 三层防御、§2.6.2-A 状态机、PM TASK-08 要求 3/4
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { executeWriteback } from '../src/state/writebackExecutor.ts';
import type {
  WritebackDeps,
  WritebackResult,
  RemoteChangeResult,
  WritebackExecutorOptions,
  WritebackExecutorResult,
} from '../src/state/writebackExecutor.ts';
import { mapWritebackExecutorResultToState } from '../src/state/writebackResultMapper.ts';
import type { WritebackStateMapping } from '../src/state/writebackResultMapper.ts';
import { WRITE_ENABLED_SCOPE } from '../src/state/writePermission.ts';

const noopSleep = async (_ms: number): Promise<void> => {};
const permissiveCheck = (_path: string): { permitted: boolean } => ({ permitted: true });
const denyingCheck = (_path: string): { permitted: boolean; reason: string } => ({
  permitted: false,
  reason: '写回权限不足：只读模式',
});

const baseOptions: WritebackExecutorOptions = {
  remotePath: '/mnt/share/writable/file.txt',
  baselineSha256: 'abc123',
  baselineMtime: 1000,
  maxRetries: 3,
  retryDelayMs: 0,
};

function makeWritebackResult(overrides: Partial<WritebackResult> = {}): WritebackResult {
  return {
    writebackSuccess: true,
    localHash: 'sha256-local',
    verifyHash: 'sha256-local',
    remoteMtimeBefore: 1000,
    remoteMtimeAfter: 2000,
    ...overrides,
  };
}

function makeRemoteUnchanged(): RemoteChangeResult {
  return { remoteMtime: 1000, baselineMtime: 1000, remoteChanged: false };
}

function makeRemoteChanged(): RemoteChangeResult {
  return { remoteMtime: 1500, baselineMtime: 1000, remoteChanged: true };
}

interface MockSmbAdapter {
  writeback: () => Promise<WritebackResult>;
  checkRemoteChanged: () => Promise<RemoteChangeResult>;
  sleep: (ms: number) => Promise<void>;
  checkPermission: (remotePath: string) => { permitted: boolean; reason?: string };
  writebackCalls: number;
  checkRemoteCalls: number;
}

function makeMockAdapter(opts: {
  writebackFn?: () => Promise<WritebackResult>;
  checkRemoteFn?: () => Promise<RemoteChangeResult>;
  permission?: 'permit' | 'deny';
}): MockSmbAdapter {
  let writebackCalls = 0;
  let checkRemoteCalls = 0;
  return {
    writeback: async () => {
      writebackCalls += 1;
      return opts.writebackFn ? opts.writebackFn() : makeWritebackResult();
    },
    checkRemoteChanged: async () => {
      checkRemoteCalls += 1;
      return opts.checkRemoteFn ? opts.checkRemoteFn() : makeRemoteUnchanged();
    },
    sleep: noopSleep,
    checkPermission: opts.permission === 'deny' ? denyingCheck : permissiveCheck,
    get writebackCalls() { return writebackCalls; },
    get checkRemoteCalls() { return checkRemoteCalls; },
  } as MockSmbAdapter;
}

function toDeps(adapter: MockSmbAdapter): WritebackDeps {
  return {
    writeback: adapter.writeback,
    checkRemoteChanged: adapter.checkRemoteChanged,
    sleep: adapter.sleep,
    checkPermission: adapter.checkPermission,
  };
}

async function runWritebackFlow(
  options: WritebackExecutorOptions,
  adapter: MockSmbAdapter,
): Promise<{ execResult: WritebackExecutorResult; mapping: WritebackStateMapping }> {
  const execResult = await executeWriteback(options, toDeps(adapter));
  const mapping = mapWritebackExecutorResultToState(execResult, options.baselineMtime);
  return { execResult, mapping };
}

describe('TASK-08 集成测试 — 权限拒绝（enabled=false）', () => {
  test('WRITE_ENABLED_SCOPE.enabled=false → 全局只读', () => {
    assert.equal(WRITE_ENABLED_SCOPE.enabled, false);
  });

  test('权限拒绝 → session_terminated，不调用任何 SMB 方法', async () => {
    const adapter = makeMockAdapter({ permission: 'deny' });
    const { execResult, mapping } = await runWritebackFlow(baseOptions, adapter);
    assert.equal(execResult.success, false);
    assert.equal(execResult.error?.category, 'permission_denied');
    assert.equal(adapter.writebackCalls, 0);
    assert.equal(adapter.checkRemoteCalls, 0);
    assert.equal(mapping.state, 'session_terminated');
    assert.ok(mapping.detail?.includes('权限'));
  });

  test('权限拒绝 → retriesAttempted=0（不重试）', async () => {
    const adapter = makeMockAdapter({ permission: 'deny' });
    const { execResult } = await runWritebackFlow(baseOptions, adapter);
    assert.equal(execResult.retriesAttempted, 0);
  });
});

describe('TASK-08 集成测试 — 保存事件（正常写回）', () => {
  test('本地修改 → 冲突检测通过 → 写回成功 → writeback_success', async () => {
    const adapter = makeMockAdapter({});
    const { execResult, mapping } = await runWritebackFlow(baseOptions, adapter);
    assert.equal(execResult.success, true);
    assert.equal(execResult.retriesAttempted, 0);
    assert.equal(mapping.state, 'writeback_success');
    assert.equal(adapter.writebackCalls, 1);
    assert.equal(adapter.checkRemoteCalls, 1);
  });

  test('SHA-256 校验通过（localHash===verifyHash）→ writeback_success', async () => {
    const adapter = makeMockAdapter({
      writebackFn: async () => makeWritebackResult({
        localHash: 'abc',
        verifyHash: 'abc',
      }),
    });
    const { mapping } = await runWritebackFlow(baseOptions, adapter);
    assert.equal(mapping.state, 'writeback_success');
  });
});

describe('TASK-08 集成测试 — 重复事件（幂等性）', () => {
  test('连续 3 次保存事件 → 每次独立编排，结果一致', async () => {
    for (let i = 0; i < 3; i++) {
      const adapter = makeMockAdapter({});
      const { execResult, mapping } = await runWritebackFlow(baseOptions, adapter);
      assert.equal(execResult.success, true);
      assert.equal(mapping.state, 'writeback_success');
      assert.equal(adapter.writebackCalls, 1);
      assert.equal(adapter.checkRemoteCalls, 1);
    }
  });

  test('连续保存：第一次成功后第二次远端已变 → conflict', async () => {
    const adapter1 = makeMockAdapter({});
    const r1 = await runWritebackFlow(baseOptions, adapter1);
    assert.equal(r1.mapping.state, 'writeback_success');

    const adapter2 = makeMockAdapter({ checkRemoteFn: async () => makeRemoteChanged() });
    const r2 = await runWritebackFlow(baseOptions, adapter2);
    assert.equal(r2.mapping.state, 'conflict');
    assert.ok(r2.mapping.conflictInfo);
    assert.equal(adapter2.writebackCalls, 0);
  });

  test('连续保存：第一次失败后第二次成功 → 独立结果', async () => {
    const adapter1 = makeMockAdapter({
      writebackFn: async () => makeWritebackResult({ writebackSuccess: false, error: 'disk full' }),
    });
    const r1 = await runWritebackFlow(baseOptions, adapter1);
    assert.equal(r1.mapping.state, 'writeback_failed');

    const adapter2 = makeMockAdapter({});
    const r2 = await runWritebackFlow(baseOptions, adapter2);
    assert.equal(r2.mapping.state, 'writeback_success');
  });
});

describe('TASK-08 集成测试 — 并发冲突', () => {
  test('远端已修改 → conflict 态，不调用 writeback', async () => {
    const adapter = makeMockAdapter({ checkRemoteFn: async () => makeRemoteChanged() });
    const { execResult, mapping } = await runWritebackFlow(baseOptions, adapter);
    assert.equal(execResult.success, false);
    assert.equal(execResult.error?.category, 'conflict');
    assert.equal(adapter.writebackCalls, 0);
    assert.equal(adapter.checkRemoteCalls, 1);
    assert.equal(mapping.state, 'conflict');
    assert.ok(mapping.conflictInfo);
    assert.equal(mapping.conflictInfo.baselineMtime, 1000);
  });

  test('OVERWRITE_CONFIRMED 路径 → 真实远端复查 → 远端未变化时写回', async () => {
    const adapter = makeMockAdapter({
      checkRemoteFn: async () => makeRemoteUnchanged(),
    });
    const overwriteDeps: WritebackDeps = {
      writeback: adapter.writeback,
      checkRemoteChanged: adapter.checkRemoteChanged,
      sleep: noopSleep,
      checkPermission: permissiveCheck,
    };
    const execResult = await executeWriteback(baseOptions, overwriteDeps);
    const mapping = mapWritebackExecutorResultToState(execResult, baseOptions.baselineMtime);
    assert.equal(execResult.success, true);
    assert.equal(mapping.state, 'writeback_success');
    assert.equal(adapter.writebackCalls, 1);
    assert.equal(adapter.checkRemoteCalls, 1);
  });

  test('OVERWRITE_CONFIRMED 路径 → 真实远端复查 → 远端已变化时拒绝覆盖', async () => {
    const adapter = makeMockAdapter({
      checkRemoteFn: async () => makeRemoteChanged(),
    });
    const overwriteDeps: WritebackDeps = {
      writeback: adapter.writeback,
      checkRemoteChanged: adapter.checkRemoteChanged,
      sleep: noopSleep,
      checkPermission: permissiveCheck,
    };
    const execResult = await executeWriteback(baseOptions, overwriteDeps);
    const mapping = mapWritebackExecutorResultToState(execResult, baseOptions.baselineMtime);
    assert.equal(execResult.success, false);
    assert.equal(execResult.error?.category, 'conflict');
    assert.equal(adapter.writebackCalls, 0);
    assert.equal(adapter.checkRemoteCalls, 1);
    assert.equal(mapping.state, 'conflict');
  });
});

describe('TASK-08 集成测试 — 网络失败与重试', () => {
  test('首次网络失败 → 重试成功 → writeback_success', async () => {
    let call = 0;
    const adapter = makeMockAdapter({
      writebackFn: async () => {
        call += 1;
        if (call === 1) throw new Error('network unreachable');
        return makeWritebackResult();
      },
    });
    const { execResult, mapping } = await runWritebackFlow(baseOptions, adapter);
    assert.equal(execResult.success, true);
    assert.equal(execResult.retriesAttempted, 1);
    assert.equal(mapping.state, 'writeback_success');
    assert.equal(adapter.writebackCalls, 2);
  });

  test('网络失败 → 重试 3 次仍失败 → network_interrupted', async () => {
    const adapter = makeMockAdapter({
      writebackFn: async () => { throw new Error('network timeout'); },
    });
    const { execResult, mapping } = await runWritebackFlow(baseOptions, adapter);
    assert.equal(execResult.success, false);
    assert.equal(execResult.error?.category, 'network_error');
    assert.equal(execResult.retriesAttempted, 3);
    assert.equal(mapping.state, 'network_interrupted');
    assert.equal(mapping.lastError?.category, 'network_lost');
    assert.equal(adapter.writebackCalls, 4);
  });

  test('重试期间远端变更为冲突 → conflict（不继续重试）', async () => {
    let wbCall = 0;
    const adapter = makeMockAdapter({
      writebackFn: async () => {
        wbCall += 1;
        throw new Error('network disconnected');
      },
      checkRemoteFn: async () => {
        if (wbCall >= 1) return makeRemoteChanged();
        return makeRemoteUnchanged();
      },
    });
    const { execResult, mapping } = await runWritebackFlow(baseOptions, adapter);
    assert.equal(execResult.success, false);
    assert.equal(execResult.error?.category, 'conflict');
    assert.equal(mapping.state, 'conflict');
  });

  test('非网络错误不重试 → writeback_failed', async () => {
    const adapter = makeMockAdapter({
      writebackFn: async () => makeWritebackResult({ writebackSuccess: false, error: 'disk full' }),
    });
    const { execResult, mapping } = await runWritebackFlow(baseOptions, adapter);
    assert.equal(execResult.success, false);
    assert.equal(execResult.error?.category, 'write_failed');
    assert.equal(execResult.retriesAttempted, 0);
    assert.equal(mapping.state, 'writeback_failed');
    assert.equal(adapter.writebackCalls, 1);
  });
});

describe('TASK-08 集成测试 — SHA-256 校验失败', () => {
  test('localHash !== verifyHash → verify_failed → writeback_failed', async () => {
    const adapter = makeMockAdapter({
      writebackFn: async () => makeWritebackResult({
        writebackSuccess: true,
        localHash: 'aaa',
        verifyHash: 'bbb',
      }),
    });
    const { execResult, mapping } = await runWritebackFlow(baseOptions, adapter);
    assert.equal(execResult.success, false);
    assert.equal(execResult.error?.category, 'verify_failed');
    assert.equal(mapping.state, 'writeback_failed');
    assert.equal(mapping.lastError?.category, 'unknown');
  });
});

describe('TASK-08 集成测试 — mapWritebackExecutorResultToState 纯函数', () => {
  test('success=true → writeback_success', () => {
    const mapping = mapWritebackExecutorResultToState(
      { success: true, retriesAttempted: 0 },
      1000,
    );
    assert.equal(mapping.state, 'writeback_success');
    assert.equal(mapping.conflictInfo, undefined);
    assert.equal(mapping.lastError, undefined);
  });

  test('error=permission_denied → session_terminated', () => {
    const mapping = mapWritebackExecutorResultToState(
      { success: false, error: { category: 'permission_denied', message: 'denied', retryable: false }, retriesAttempted: 0 },
      1000,
    );
    assert.equal(mapping.state, 'session_terminated');
    assert.ok(mapping.detail?.includes('denied'));
  });

  test('error=conflict → conflict + conflictInfo', () => {
    const mapping = mapWritebackExecutorResultToState(
      { success: false, error: { category: 'conflict', message: 'remote changed', retryable: false }, retriesAttempted: 0 },
      1000,
    );
    assert.equal(mapping.state, 'conflict');
    assert.equal(mapping.conflictInfo?.baselineMtime, 1000);
  });

  test('error=network_error → network_interrupted + lastError', () => {
    const mapping = mapWritebackExecutorResultToState(
      { success: false, error: { category: 'network_error', message: 'timeout', retryable: true }, retriesAttempted: 3 },
      1000,
    );
    assert.equal(mapping.state, 'network_interrupted');
    assert.equal(mapping.lastError?.category, 'network_lost');
  });

  test('error=write_failed → writeback_failed + lastError', () => {
    const mapping = mapWritebackExecutorResultToState(
      { success: false, error: { category: 'write_failed', message: 'disk full', retryable: false }, retriesAttempted: 0 },
      1000,
    );
    assert.equal(mapping.state, 'writeback_failed');
    assert.equal(mapping.lastError?.category, 'unknown');
  });

  test('error=verify_failed → writeback_failed + lastError', () => {
    const mapping = mapWritebackExecutorResultToState(
      { success: false, error: { category: 'verify_failed', message: 'hash mismatch', retryable: false }, retriesAttempted: 0 },
      1000,
    );
    assert.equal(mapping.state, 'writeback_failed');
  });

  test('error=no_baseline → writeback_failed', () => {
    const mapping = mapWritebackExecutorResultToState(
      { success: false, error: { category: 'no_baseline', message: 'no baseline', retryable: false }, retriesAttempted: 0 },
      1000,
    );
    assert.equal(mapping.state, 'writeback_failed');
  });

  test('error=unknown → writeback_failed', () => {
    const mapping = mapWritebackExecutorResultToState(
      { success: false, error: { category: 'unknown', message: '???', retryable: false }, retriesAttempted: 0 },
      1000,
    );
    assert.equal(mapping.state, 'writeback_failed');
  });

  test('success=false 且无 error → writeback_failed（兜底）', () => {
    const mapping = mapWritebackExecutorResultToState(
      { success: false, retriesAttempted: 0 },
      1000,
    );
    assert.equal(mapping.state, 'writeback_failed');
  });
});

describe('TASK-08 集成测试 — enabled=false 全链路验证', () => {
  test('enabled=false → executeWriteback 使用默认 checkPermission → permission_denied', async () => {
    const deps: WritebackDeps = {
      writeback: async () => makeWritebackResult(),
      checkRemoteChanged: async () => makeRemoteUnchanged(),
      sleep: noopSleep,
    };
    const execResult = await executeWriteback(baseOptions, deps);
    assert.equal(execResult.success, false);
    assert.equal(execResult.error?.category, 'permission_denied');
  });

  test('enabled=false → 全链路最终状态为 session_terminated', async () => {
    const deps: WritebackDeps = {
      writeback: async () => makeWritebackResult(),
      checkRemoteChanged: async () => makeRemoteUnchanged(),
      sleep: noopSleep,
    };
    const execResult = await executeWriteback(baseOptions, deps);
    const mapping = mapWritebackExecutorResultToState(execResult, baseOptions.baselineMtime);
    assert.equal(mapping.state, 'session_terminated');
  });
});