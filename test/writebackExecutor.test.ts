import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { executeWriteback } from '../src/state/writebackExecutor.ts';
import type {
  WritebackDeps,
  WritebackResult,
  RemoteChangeResult,
  WritebackExecutorOptions,
} from '../src/state/writebackExecutor.ts';

const noopSleep = async (_ms: number): Promise<void> => {};
const permissiveCheck = (_path: string): { permitted: boolean } => ({ permitted: true });

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

function makeDeps(
  writebackFn: () => Promise<WritebackResult>,
  checkRemoteFn: () => Promise<RemoteChangeResult> = async () => makeRemoteUnchanged(),
  withPermission = true,
): WritebackDeps & { writebackCalls: number; checkRemoteCalls: number } {
  let writebackCalls = 0;
  let checkRemoteCalls = 0;
  return {
    writeback: async () => { writebackCalls += 1; return writebackFn(); },
    checkRemoteChanged: async () => { checkRemoteCalls += 1; return checkRemoteFn(); },
    sleep: noopSleep,
    checkPermission: withPermission ? permissiveCheck : undefined,
    get writebackCalls() { return writebackCalls; },
    get checkRemoteCalls() { return checkRemoteCalls; },
  } as WritebackDeps & { writebackCalls: number; checkRemoteCalls: number };
}

describe('executeWriteback — 权限拒绝', () => {
  test('enabled=false → permission_denied，不调用任何 deps', async () => {
    const deps = makeDeps(async () => makeWritebackResult(), async () => makeRemoteUnchanged(), false);
    const result = await executeWriteback(baseOptions, deps);
    assert.equal(result.success, false);
    assert.equal(result.error?.category, 'permission_denied');
    assert.equal(result.retriesAttempted, 0);
    assert.equal((deps as any).writebackCalls, 0);
    assert.equal((deps as any).checkRemoteCalls, 0);
  });

  test('空 remotePath → no_baseline', async () => {
    const deps = makeDeps(async () => makeWritebackResult(), async () => makeRemoteUnchanged(), false);
    const result = await executeWriteback(
      { ...baseOptions, remotePath: '' },
      deps,
    );
    assert.equal(result.success, false);
    assert.equal(result.error?.category, 'no_baseline');
    assert.equal((deps as any).writebackCalls, 0);
  });

  test('路径穿越 → permission_denied', async () => {
    const deps = makeDeps(async () => makeWritebackResult(), async () => makeRemoteUnchanged(), false);
    const result = await executeWriteback(
      { ...baseOptions, remotePath: '/mnt/share/writable/../escape.txt' },
      deps,
    );
    assert.equal(result.success, false);
    assert.equal(result.error?.category, 'permission_denied');
  });
});

describe('executeWriteback — 冲突检测', () => {
  test('远端已修改 → conflict，不调用 writeback', async () => {
    const deps = makeDeps(
      async () => makeWritebackResult(),
      async () => makeRemoteChanged(),
    );
    const result = await executeWriteback(baseOptions, deps);
    assert.equal(result.success, false);
    assert.equal(result.error?.category, 'conflict');
    assert.equal(result.retriesAttempted, 0);
    assert.equal((deps as any).writebackCalls, 0);
  });

  test('冲突检测网络失败 → network_error, retryable', async () => {
    const deps = makeDeps(
      async () => makeWritebackResult(),
      async () => { throw new Error('ETIMEDOUT: connection timeout'); },
    );
    const result = await executeWriteback(baseOptions, deps);
    assert.equal(result.success, false);
    assert.equal(result.error?.category, 'network_error');
    assert.equal(result.error?.retryable, true);
  });

  test('冲突检测未知错误 → unknown, not retryable', async () => {
    const deps = makeDeps(
      async () => makeWritebackResult(),
      async () => { throw new Error('something weird'); },
    );
    const result = await executeWriteback(baseOptions, deps);
    assert.equal(result.success, false);
    assert.equal(result.error?.category, 'unknown');
    assert.equal(result.error?.retryable, false);
  });
});

describe('executeWriteback — 写回成功', () => {
  test('writebackSuccess=true + hash 匹配 → success', async () => {
    const deps = makeDeps(async () => makeWritebackResult());
    const result = await executeWriteback(baseOptions, deps);
    assert.equal(result.success, true);
    assert.equal(result.localHash, 'sha256-local');
    assert.equal(result.verifyHash, 'sha256-local');
    assert.equal(result.retriesAttempted, 0);
    assert.equal(result.error, undefined);
  });

  test('writebackSuccess=true + hash 不匹配 → verify_failed', async () => {
    const deps = makeDeps(async () => makeWritebackResult({
      localHash: 'hash-a',
      verifyHash: 'hash-b',
    }));
    const result = await executeWriteback(baseOptions, deps);
    assert.equal(result.success, false);
    assert.equal(result.error?.category, 'verify_failed');
    assert.equal(result.error?.retryable, false);
    assert.equal(result.localHash, 'hash-a');
    assert.equal(result.verifyHash, 'hash-b');
  });
});

describe('executeWriteback — 写回失败（非网络）', () => {
  test('writebackSuccess=false + 普通错误 → write_failed, 不重试', async () => {
    const deps = makeDeps(async () => makeWritebackResult({
      writebackSuccess: false,
      error: 'disk full',
    }));
    const result = await executeWriteback(baseOptions, deps);
    assert.equal(result.success, false);
    assert.equal(result.error?.category, 'write_failed');
    assert.equal(result.error?.retryable, false);
    assert.equal(result.retriesAttempted, 0);
    assert.equal((deps as any).writebackCalls, 1);
  });

  test('writeback 抛出异常（非网络）→ unknown, 不重试', async () => {
    const deps = makeDeps(async () => { throw new Error('permission denied'); });
    const result = await executeWriteback(baseOptions, deps);
    assert.equal(result.success, false);
    assert.equal(result.error?.category, 'unknown');
    assert.equal(result.retriesAttempted, 0);
    assert.equal((deps as any).writebackCalls, 1);
  });
});

describe('executeWriteback — 网络错误重试', () => {
  test('网络错误 → 重试 maxRetries 次后失败', async () => {
    const deps = makeDeps(async () => makeWritebackResult({
      writebackSuccess: false,
      error: 'ETIMEDOUT: timeout',
    }));
    const result = await executeWriteback(
      { ...baseOptions, maxRetries: 2 },
      deps,
    );
    assert.equal(result.success, false);
    assert.equal(result.error?.category, 'network_error');
    assert.equal(result.retriesAttempted, 2);
    assert.equal((deps as any).writebackCalls, 3);
  });

  test('网络错误后成功 → success after retry', async () => {
    let callCount = 0;
    const deps = makeDeps(async () => {
      callCount += 1;
      if (callCount < 2) {
        return makeWritebackResult({ writebackSuccess: false, error: 'ENETUNREACH' });
      }
      return makeWritebackResult();
    });
    const result = await executeWriteback(baseOptions, deps);
    assert.equal(result.success, true);
    assert.equal(result.retriesAttempted, 1);
    assert.equal((deps as any).writebackCalls, 2);
  });

  test('writeback 网络异常 → 重试', async () => {
    let callCount = 0;
    const deps = makeDeps(async () => {
      callCount += 1;
      if (callCount < 3) throw new Error('socket hang up');
      return makeWritebackResult();
    });
    const result = await executeWriteback(baseOptions, deps);
    assert.equal(result.success, true);
    assert.equal(result.retriesAttempted, 2);
  });

  test('maxRetries=0 → 不重试', async () => {
    const deps = makeDeps(async () => makeWritebackResult({
      writebackSuccess: false,
      error: 'ETIMEDOUT',
    }));
    const result = await executeWriteback(
      { ...baseOptions, maxRetries: 0 },
      deps,
    );
    assert.equal(result.success, false);
    assert.equal(result.retriesAttempted, 0);
    assert.equal((deps as any).writebackCalls, 1);
  });
});

describe('executeWriteback — 重试时冲突检测', () => {
  test('重试时远端已修改 → conflict', async () => {
    let wbCount = 0;
    let crCount = 0;
    const deps = {
      writeback: async (): Promise<WritebackResult> => {
        wbCount += 1;
        return makeWritebackResult({ writebackSuccess: false, error: 'ETIMEDOUT' });
      },
      checkRemoteChanged: async (): Promise<RemoteChangeResult> => {
        crCount += 1;
        if (crCount <= 1) return makeRemoteUnchanged();
        return makeRemoteChanged();
      },
      sleep: noopSleep,
      checkPermission: permissiveCheck,
    };
    const result = await executeWriteback(
      { ...baseOptions, maxRetries: 3 },
      deps,
    );
    assert.equal(result.success, false);
    assert.equal(result.error?.category, 'conflict');
    assert.ok(result.retriesAttempted >= 1);
    assert.ok(crCount >= 2);
  });
});

describe('executeWriteback — 错误分类完整性', () => {
  test('所有失败结果包含 error 对象', async () => {
    const scenarios = [
      makeDeps(async () => makeWritebackResult(), async () => makeRemoteChanged()),
      makeDeps(async () => makeWritebackResult({ writebackSuccess: false, error: 'fail' })),
      makeDeps(async () => makeWritebackResult({ localHash: 'a', verifyHash: 'b' })),
      makeDeps(async () => { throw new Error('crash'); }),
    ];
    for (const deps of scenarios) {
      const result = await executeWriteback(baseOptions, deps);
      if (!result.success) {
        assert.ok(result.error !== undefined);
        assert.ok(result.error!.category.length > 0);
        assert.ok(result.error!.message.length > 0);
        assert.equal(typeof result.error!.retryable, 'boolean');
      }
    }
  });

  test('成功结果不含 error', async () => {
    const deps = makeDeps(async () => makeWritebackResult());
    const result = await executeWriteback(baseOptions, deps);
    assert.equal(result.success, true);
    assert.equal(result.error, undefined);
  });
});