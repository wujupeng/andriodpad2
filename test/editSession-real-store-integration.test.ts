/**
 * TASK-10-R1 真实 store action 集成测试。
 *
 * 直接调用真实 useEditSessionStore 的 applyForegroundCheckResult / resolveConflict action，
 * 通过 __setSmbMethodDepsForTest 注入可控 SMB mock，通过 __setPermissionCheckForTest 注入可控权限判定。
 * 断言真实状态机迁移与执行器调用关系。
 *
 * 声明：模拟 SMB 适配器测试验证的是"真实 store action → 执行器调用关系"，
 * 不等同于真实 SMB 服务器写回验收。真实服务器验收须在 FRZ-EX 授权后另行执行。
 *
 * 追溯：TASK-10-R1 问题 1（PM 复核：测试未覆盖真实 store）
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  useEditSessionStore,
  __setSmbMethodDepsForTest,
  __setPermissionCheckForTest,
} from '../src/state/editSessionStore.ts';
import type {
  WritebackResult,
  RemoteChangeResult,
} from '../src/state/writebackExecutor.ts';
import { WRITE_ENABLED_SCOPE } from '../src/state/writePermission.ts';

interface SmbMock {
  writebackCalls: number;
  checkRemoteCalls: number;
  writeback: () => Promise<WritebackResult>;
  checkRemoteChanged: () => Promise<RemoteChangeResult>;
  sleep?: (ms: number) => Promise<void>;
  checkPermission?: (remotePath: string) => { permitted: boolean; reason?: string };
}

function makeSmbMock(opts: {
  writebackSuccess?: boolean;
  remoteChanged?: boolean;
  permitted?: boolean;
} = {}): SmbMock {
  let writebackCalls = 0;
  let checkRemoteCalls = 0;
  const permitted = opts.permitted ?? true;
  return {
    get writebackCalls() { return writebackCalls; },
    get checkRemoteCalls() { return checkRemoteCalls; },
    writeback: async () => {
      writebackCalls += 1;
      return {
        writebackSuccess: opts.writebackSuccess ?? true,
        localHash: 'sha256-local',
        verifyHash: 'sha256-local',
        remoteMtimeBefore: 1000,
        remoteMtimeAfter: 2000,
      };
    },
    checkRemoteChanged: async () => {
      checkRemoteCalls += 1;
      return {
        remoteMtime: opts.remoteChanged ? 1500 : 1000,
        baselineMtime: 1000,
        remoteChanged: opts.remoteChanged ?? false,
      };
    },
    sleep: async (_ms: number) => {},
    checkPermission: (_path: string) => ({ permitted, reason: permitted ? undefined : 'denied' }),
  } as SmbMock;
}

const permissiveCheck = (_path: string | null, _candidate?: string): { permitted: boolean } => ({ permitted: true });
const denyingCheck = (_path: string | null, _candidate?: string): { permitted: boolean; reason: string } => ({
  permitted: false,
  reason: '写回权限不足：只读模式',
});

const testBaseline = {
  remotePath: '/mnt/share/writable/file.txt',
  fileName: 'file.txt',
  baselineMtime: 1000,
  baselineSha256: 'abc123',
  localCachePath: '/local/file.txt',
  sourceProfileId: 'test-profile',
};

function setupStore(state: 'opened' | 'conflict' = 'opened'): void {
  useEditSessionStore.setState({
    state,
    baseline: testBaseline,
    timeline: [],
    conflictInfo: state === 'conflict' ? { remoteMtime: 1500, baselineMtime: 1000 } : null,
    lastError: null,
    pendingSaveAs: null,
    writebackProgress: null,
  });
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

function waitForState(targetState: string, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (useEditSessionStore.getState().state === targetState) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 10);
    };
    check();
  });
}

describe('TASK-10-R1 真实 store 集成测试 — applyForegroundCheckResult', () => {
  afterEach(() => {
    __setSmbMethodDepsForTest(null);
    __setPermissionCheckForTest(null);
    WRITE_ENABLED_SCOPE.enabled = false;
    useEditSessionStore.setState({
      state: 'idle',
      baseline: null,
      timeline: [],
      conflictInfo: null,
      lastError: null,
      pendingSaveAs: null,
      writebackProgress: null,
    });
  });

  test('AC-1.1+1.2: 权限许可 + changed=true → 执行器调用 1 次 → opened', async () => {
    const mock = makeSmbMock({ writebackSuccess: true, remoteChanged: false });
    __setSmbMethodDepsForTest(mock);
    __setPermissionCheckForTest(permissiveCheck);
    WRITE_ENABLED_SCOPE.enabled = true;
    setupStore('opened');

    useEditSessionStore.getState().applyForegroundCheckResult({
      changed: true,
      saveAsDiscovered: false,
    } as any);

    const reached = await waitForState('opened');
    assert.equal(reached, true, '最终态应为 opened');
    assert.equal(mock.writebackCalls, 1, 'writeback 调用恰好 1 次');
    assert.ok(mock.checkRemoteCalls >= 1, 'checkRemoteChanged 至少 1 次');
    const states = useEditSessionStore.getState().timeline.map((t) => t.state);
    assert.ok(states.includes('saving'), '经过 saving 态');
    assert.ok(states.includes('writeback_pending'), '经过 writeback_pending 态');
    assert.ok(states.includes('writeback_success'), '经过 writeback_success 态');
  });

  test('AC-1.3: 权限拒绝 + changed=true → 执行器调用 0 次 → editing', () => {
    const mock = makeSmbMock();
    __setSmbMethodDepsForTest(mock);
    __setPermissionCheckForTest(denyingCheck);
    WRITE_ENABLED_SCOPE.enabled = false;
    setupStore('opened');

    useEditSessionStore.getState().applyForegroundCheckResult({
      changed: true,
      saveAsDiscovered: false,
    } as any);

    assert.equal(mock.writebackCalls, 0, '权限拒绝时 writeback 不调用');
    assert.equal(mock.checkRemoteCalls, 0, '权限拒绝时 checkRemoteChanged 不调用');
    assert.equal(useEditSessionStore.getState().state, 'editing', '状态应为 editing');
  });

  test('AC-1.4: saving 态重复调用被状态机守卫拦截', async () => {
    let resolveWriteback: () => void = () => {};
    const writebackPromise = new Promise<void>((r) => { resolveWriteback = r; });
    let writebackCalls = 0;
    let checkRemoteCalls = 0;
    __setSmbMethodDepsForTest({
      writeback: async () => {
        writebackCalls += 1;
        await writebackPromise;
        return { writebackSuccess: true, localHash: 'sha', verifyHash: 'sha', remoteMtimeBefore: 1000, remoteMtimeAfter: 2000 };
      },
      checkRemoteChanged: async () => {
        checkRemoteCalls += 1;
        return { remoteMtime: 1000, baselineMtime: 1000, remoteChanged: false };
      },
      sleep: async () => {},
      checkPermission: () => ({ permitted: true }),
    });
    __setPermissionCheckForTest(permissiveCheck);
    WRITE_ENABLED_SCOPE.enabled = true;
    setupStore('opened');

    useEditSessionStore.getState().applyForegroundCheckResult({
      changed: true,
      saveAsDiscovered: false,
    } as any);

    await flushMicrotasks();
    assert.equal(useEditSessionStore.getState().state, 'writeback_pending', '应处于 writeback_pending');

    useEditSessionStore.getState().applyForegroundCheckResult({
      changed: true,
      saveAsDiscovered: false,
    } as any);

    await flushMicrotasks();
    assert.equal(writebackCalls, 1, '重复调用不增加 writeback 次数');

    resolveWriteback();
    await waitForState('opened');
  });

  test('AC-1.5: 集成测试不发起真实 SMB 请求（依赖注入隔离）', async () => {
    const mock = makeSmbMock({ writebackSuccess: true, remoteChanged: false });
    __setSmbMethodDepsForTest(mock);
    __setPermissionCheckForTest(permissiveCheck);
    WRITE_ENABLED_SCOPE.enabled = true;
    setupStore('opened');

    useEditSessionStore.getState().applyForegroundCheckResult({
      changed: true,
      saveAsDiscovered: false,
    } as any);

    await waitForState('opened');
    assert.ok(mock.writebackCalls >= 1, 'mock 被调用');
    assert.ok(mock.checkRemoteCalls >= 1, 'mock 被调用');
  });

  test('changed=false → 不触发写回', () => {
    const mock = makeSmbMock();
    __setSmbMethodDepsForTest(mock);
    __setPermissionCheckForTest(permissiveCheck);
    WRITE_ENABLED_SCOPE.enabled = true;
    setupStore('opened');

    useEditSessionStore.getState().applyForegroundCheckResult({
      changed: false,
      saveAsDiscovered: false,
    } as any);

    assert.equal(mock.writebackCalls, 0, 'changed=false 时不调用 writeback');
    assert.equal(useEditSessionStore.getState().state, 'opened', '状态保持 opened');
  });
});

describe('TASK-10-R1 真实 store 集成测试 — resolveConflict OVERWRITE_CONFIRMED', () => {
  afterEach(() => {
    __setSmbMethodDepsForTest(null);
    __setPermissionCheckForTest(null);
    WRITE_ENABLED_SCOPE.enabled = false;
    useEditSessionStore.setState({
      state: 'idle',
      baseline: null,
      timeline: [],
      conflictInfo: null,
      lastError: null,
      pendingSaveAs: null,
      writebackProgress: null,
    });
  });

  test('AC-3.2: 远端已变化 → 不覆盖 → conflict', async () => {
    const mock = makeSmbMock({ remoteChanged: true });
    __setSmbMethodDepsForTest(mock);
    __setPermissionCheckForTest(permissiveCheck);
    WRITE_ENABLED_SCOPE.enabled = true;
    setupStore('conflict');

    await useEditSessionStore.getState().resolveConflict('OVERWRITE_CONFIRMED');

    await flushMicrotasks();
    assert.equal(mock.writebackCalls, 0, '远端已变化时不调用 writeback');
    assert.ok(mock.checkRemoteCalls >= 1, '真实远端复查被调用');
    assert.equal(
      useEditSessionStore.getState().state,
      'conflict',
      '状态应为 conflict',
    );
  });

  test('AC-3.3: 远端未变化 → 覆盖 → writeback_success → opened', async () => {
    const mock = makeSmbMock({ writebackSuccess: true, remoteChanged: false });
    __setSmbMethodDepsForTest(mock);
    __setPermissionCheckForTest(permissiveCheck);
    WRITE_ENABLED_SCOPE.enabled = true;
    setupStore('conflict');

    await useEditSessionStore.getState().resolveConflict('OVERWRITE_CONFIRMED');

    const reached = await waitForState('opened');
    assert.equal(reached, true, '最终态应为 opened');
    assert.equal(mock.writebackCalls, 1, '远端未变化时 writeback 调用 1 次');
    assert.ok(mock.checkRemoteCalls >= 1, '真实远端复查被调用');
  });

  test('权限拒绝 → session_terminated', async () => {
    const mock = makeSmbMock();
    __setSmbMethodDepsForTest(mock);
    __setPermissionCheckForTest(denyingCheck);
    WRITE_ENABLED_SCOPE.enabled = false;
    setupStore('conflict');

    await useEditSessionStore.getState().resolveConflict('OVERWRITE_CONFIRMED');

    assert.equal(mock.writebackCalls, 0, '权限拒绝时不调用 writeback');
    assert.equal(
      useEditSessionStore.getState().state,
      'session_terminated',
      '状态应为 session_terminated',
    );
  });
});