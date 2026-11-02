/**
 * TASK-PC-05-04: disconnectAndUnpin 编排函数单元测试。
 * 覆盖 REQ-PN-04, DFX-PC-03/04, REQ-CO-02。
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useSmbMultiConnStore, __setSmbPluginDepsForTest } from '../../src/state/smbMultiConnStore';
import { useSmbProfilesStore } from '../../src/state/smbProfilesStore';
import { disconnectAndUnpin } from '../../src/orchestration/boot/disconnectAndUnpin';

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
});

afterEach(() => {
  delete (globalThis as any).window;
  __setSmbPluginDepsForTest(null);
});

describe('TASK-PC-05-04 disconnectAndUnpin 编排函数', () => {
  test('① 调用后 handle 移除 + pinned 置 false（REQ-PN-04）', async () => {
    __setSmbPluginDepsForTest({
      connect: async () => {},
      disconnect: async () => {},
      isConnected: async () => ({ connected: true }),
    });
    useSmbProfilesStore.setState({
      profiles: [{ id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', pinned: true, createdAt: 1 }] as any,
    });
    await useSmbMultiConnStore.getState().connect('p1', { host: 'h', share: 's', username: 'u' });
    await disconnectAndUnpin('p1');
    assert.equal(useSmbMultiConnStore.getState().handles.has('p1'), false);
    assert.equal(useSmbProfilesStore.getState().profiles[0].pinned, false);
  });

  test('② 物理断开异常时 pinned 解除仍执行（DFX-PC-04）', async () => {
    __setSmbPluginDepsForTest({
      connect: async () => {},
      disconnect: async () => { throw new Error('network error'); },
      isConnected: async () => ({ connected: true }),
    });
    useSmbProfilesStore.setState({
      profiles: [{ id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', pinned: true, createdAt: 1 }] as any,
    });
    await useSmbMultiConnStore.getState().connect('p1', { host: 'h', share: 's', username: 'u' });
    await disconnectAndUnpin('p1');
    assert.equal(useSmbProfilesStore.getState().profiles[0].pinned, false);
  });

  test('③ autoConnect 字段零变更（REQ-CO-02）', async () => {
    __setSmbPluginDepsForTest({
      connect: async () => {},
      disconnect: async () => {},
      isConnected: async () => ({ connected: true }),
    });
    useSmbProfilesStore.setState({
      profiles: [{ id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', pinned: true, autoConnect: true, createdAt: 1 }] as any,
    });
    await useSmbMultiConnStore.getState().connect('p1', { host: 'h', share: 's', username: 'u' });
    await disconnectAndUnpin('p1');
    assert.equal(useSmbProfilesStore.getState().profiles[0].autoConnect, true);
  });

  test('④ 不存在的 profile 不抛错', async () => {
    await disconnectAndUnpin('nonexistent');
    assert.equal(useSmbProfilesStore.getState().profiles.length, 0);
  });
});