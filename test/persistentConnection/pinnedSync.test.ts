/**
 * TASK-PC-05-03: pinnedSync 订阅模块单元测试。
 * 覆盖 REQ-PN-01, DFX-PC-01/06, D-PC-06。
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useSmbMultiConnStore, __setSmbPluginDepsForTest } from '../../src/state/smbMultiConnStore';
import { useSmbProfilesStore } from '../../src/state/smbProfilesStore';
import { startPinnedSync } from '../../src/orchestration/boot/pinnedSync';

let store: Record<string, string>;

beforeEach(() => {
  store = {};
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { for (const k in store) delete store[k]; },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    },
  };
  useSmbProfilesStore.setState({ profiles: [] });
  useSmbMultiConnStore.setState({ handles: new Map(), hotProfileId: null });
  __setSmbPluginDepsForTest({
    connect: async () => {},
    disconnect: async () => {},
    isConnected: async () => ({ connected: true }),
  });
});

afterEach(() => {
  delete (globalThis as any).window;
  __setSmbPluginDepsForTest(null);
});

describe('TASK-PC-05-03 pinnedSync 订阅模块', () => {
  test('① 连接成功后对应 profile 被异步标记 pinned=true（REQ-PN-01）', async () => {
    useSmbProfilesStore.setState({
      profiles: [{ id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', createdAt: 1 }] as any,
    });
    const unsub = startPinnedSync();
    await useSmbMultiConnStore.getState().connect('p1', { host: 'h', share: 's', username: 'u' });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(useSmbProfilesStore.getState().profiles[0].pinned, true);
    unsub();
  });

  test('② pinned 已为 true 时不重复持久化写入（D-PC-06 幂等）', async () => {
    useSmbProfilesStore.setState({
      profiles: [{ id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', pinned: true, createdAt: 1 }] as any,
    });
    let writeCount = 0;
    const origSetItem = (globalThis as any).window.localStorage.setItem;
    (globalThis as any).window.localStorage.setItem = (k: string, v: string) => { writeCount++; store[k] = v; };
    const unsub = startPinnedSync();
    await useSmbMultiConnStore.getState().connect('p1', { host: 'h', share: 's', username: 'u' });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(writeCount, 0);
    unsub();
    (globalThis as any).window.localStorage.setItem = origSetItem;
  });

  test('③ profile 不存在时静默跳过不抛错', async () => {
    const unsub = startPinnedSync();
    await useSmbMultiConnStore.getState().connect('ghost', { host: 'h', share: 's', username: 'u' });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(useSmbProfilesStore.getState().profiles.length, 0);
    unsub();
  });

  test('④ unsubscribe 函数调用后停止订阅', async () => {
    useSmbProfilesStore.setState({
      profiles: [{ id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', createdAt: 1 }] as any,
    });
    const unsub = startPinnedSync();
    unsub();
    await useSmbMultiConnStore.getState().connect('p1', { host: 'h', share: 's', username: 'u' });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(useSmbProfilesStore.getState().profiles[0].pinned, undefined);
  });
});