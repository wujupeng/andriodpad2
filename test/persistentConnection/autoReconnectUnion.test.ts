/**
 * TASK-PC-05-05: orchestrateAutoReconnect 并集筛选单元测试。
 * 覆盖 REQ-CO-01/04, DFX-PC-12。
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useSmbProfilesStore } from '../../src/state/smbProfilesStore';
import { useSmbMultiConnStore, __setSmbPluginDepsForTest } from '../../src/state/smbMultiConnStore';

let store: Record<string, string>;
let connectCalls: string[];

beforeEach(() => {
  store = {};
  connectCalls = [];
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
    connect: async (opts: any) => { connectCalls.push(opts.host); },
    disconnect: async () => {},
    isConnected: async () => ({ connected: true }),
  });
});

afterEach(() => {
  delete (globalThis as any).window;
  __setSmbPluginDepsForTest(null);
});

describe('TASK-PC-05-05 orchestrateAutoReconnect 并集筛选', () => {
  test('① pinned=true 且 autoConnect=false 的 profile 冷启动自动重连（REQ-CO-01）', async () => {
    store['CapacitorStorage.pad2.profiles.v1'] = JSON.stringify({
      version: 1,
      profiles: [
        { id: 'p1', name: 'test', host: 'h1', share: 's', username: 'u', pinned: true, passwordEmpty: true, createdAt: 1 },
      ],
    });
    await useSmbProfilesStore.getState().load();
    const profiles = useSmbProfilesStore.getState().profiles;
    const candidates = profiles.filter((p) => p.pinned === true || p.autoConnect === true);
    assert.equal(candidates.length, 1);
    for (const p of candidates) {
      await useSmbMultiConnStore.getState().connect(p.id, { host: p.host, share: p.share, username: p.username, password: '' });
    }
    assert.equal(connectCalls.length, 1);
    assert.equal(connectCalls[0], 'h1');
  });

  test('② pinned=false 且 autoConnect=true 的 profile 冷启动自动重连（DFX-PC-12）', async () => {
    store['CapacitorStorage.pad2.profiles.v1'] = JSON.stringify({
      version: 1,
      profiles: [
        { id: 'p1', name: 'test', host: 'h2', share: 's', username: 'u', autoConnect: true, passwordEmpty: true, createdAt: 1 },
      ],
    });
    await useSmbProfilesStore.getState().load();
    const profiles = useSmbProfilesStore.getState().profiles;
    const candidates = profiles.filter((p) => p.pinned === true || p.autoConnect === true);
    assert.equal(candidates.length, 1);
    for (const p of candidates) {
      await useSmbMultiConnStore.getState().connect(p.id, { host: p.host, share: p.share, username: p.username, password: '' });
    }
    assert.equal(connectCalls.length, 1);
  });

  test('③ pinned=true 且 autoConnect=true 的 profile 只 connect 一次（幂等 REQ-CO-04）', async () => {
    store['CapacitorStorage.pad2.profiles.v1'] = JSON.stringify({
      version: 1,
      profiles: [
        { id: 'p1', name: 'test', host: 'h3', share: 's', username: 'u', pinned: true, autoConnect: true, passwordEmpty: true, createdAt: 1 },
      ],
    });
    await useSmbProfilesStore.getState().load();
    const profiles = useSmbProfilesStore.getState().profiles;
    const candidates = profiles.filter((p) => p.pinned === true || p.autoConnect === true);
    assert.equal(candidates.length, 1);
    for (const p of candidates) {
      await useSmbMultiConnStore.getState().connect(p.id, { host: p.host, share: p.share, username: p.username, password: '' });
    }
    assert.equal(connectCalls.length, 1);
  });

  test('④ pinned=false 且 autoConnect=false 的 profile 冷启动不重连', async () => {
    store['CapacitorStorage.pad2.profiles.v1'] = JSON.stringify({
      version: 1,
      profiles: [
        { id: 'p1', name: 'test', host: 'h4', share: 's', username: 'u', passwordEmpty: true, createdAt: 1 },
      ],
    });
    await useSmbProfilesStore.getState().load();
    const profiles = useSmbProfilesStore.getState().profiles;
    const candidates = profiles.filter((p) => p.pinned === true || p.autoConnect === true);
    assert.equal(candidates.length, 0);
    assert.equal(connectCalls.length, 0);
  });

  test('⑤ 凭据三态处理逻辑零变更复用', async () => {
    store['CapacitorStorage.pad2.profiles.v1'] = JSON.stringify({
      version: 1,
      profiles: [
        { id: 'p1', name: 'remembered', host: 'h1', share: 's', username: 'u', pinned: true, passwordEncrypted: 'a.b.c', createdAt: 1 },
        { id: 'p2', name: 'empty', host: 'h2', share: 's', username: 'u', pinned: true, passwordEmpty: true, createdAt: 2 },
        { id: 'p3', name: 'unset', host: 'h3', share: 's', username: 'u', pinned: true, createdAt: 3 },
      ],
    });
    await useSmbProfilesStore.getState().load();
    const profiles = useSmbProfilesStore.getState().profiles;
    const candidates = profiles.filter((p) => p.pinned === true || p.autoConnect === true);
    assert.equal(candidates.length, 3);
    const semantics = candidates.map((p) => {
      if (p.passwordEncrypted) return 'remembered';
      if (p.passwordEmpty === true) return 'empty_credential';
      return 'unset';
    });
    assert.deepEqual(semantics, ['remembered', 'empty_credential', 'unset']);
  });
});