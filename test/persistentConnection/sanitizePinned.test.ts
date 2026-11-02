/**
 * TASK-PC-05-01: sanitizeProfile pinned 白名单解析单元测试。
 * 覆盖 DFX-PC-04/07/11, REQ-CO-02/03。
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useSmbProfilesStore } from '../../src/state/smbProfilesStore';

const PROFILES_KEY = 'pad2.profiles.v1';
const STORAGE_KEY = 'CapacitorStorage.' + PROFILES_KEY;

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
});

afterEach(() => {
  delete (globalThis as any).window;
});

describe('TASK-PC-05-01 sanitizeProfile pinned 白名单解析', () => {
  test('① 旧数据缺失 pinned 字段加载后 pinned 视为 undefined（DFX-PC-11）', async () => {
    store[STORAGE_KEY] = JSON.stringify({
      version: 1,
      profiles: [
        { id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', autoConnect: true, createdAt: 1 },
      ],
    });
    await useSmbProfilesStore.getState().load();
    const profiles = useSmbProfilesStore.getState().profiles;
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].pinned, undefined);
  });

  test('② pinned=true 落位正确', async () => {
    store[STORAGE_KEY] = JSON.stringify({
      version: 1,
      profiles: [
        { id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', pinned: true, createdAt: 1 },
      ],
    });
    await useSmbProfilesStore.getState().load();
    assert.equal(useSmbProfilesStore.getState().profiles[0].pinned, true);
  });

  test('③ pinned 非布尔值降级为 undefined 不崩溃（DFX-PC-04）', async () => {
    const badValues = ['true', 1, null, 'false', 0];
    for (const bad of badValues) {
      store[STORAGE_KEY] = JSON.stringify({
        version: 1,
        profiles: [
          { id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', pinned: bad, createdAt: 1 },
        ],
      });
      useSmbProfilesStore.setState({ profiles: [] });
      await useSmbProfilesStore.getState().load();
      assert.equal(useSmbProfilesStore.getState().profiles[0].pinned, undefined);
    }
  });

  test('④ pinned 字段不携带敏感字段（DFX-PC-07）', async () => {
    store[STORAGE_KEY] = JSON.stringify({
      version: 1,
      profiles: [
        { id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', pinned: true, passwordEncrypted: 'abc.def.ghi', createdAt: 1 },
      ],
    });
    await useSmbProfilesStore.getState().load();
    const p = useSmbProfilesStore.getState().profiles[0];
    assert.equal(p.pinned, true);
    assert.equal(p.passwordEncrypted, 'abc.def.ghi');
  });

  test('⑤ 既有 autoConnect 解析逻辑回归不破坏', async () => {
    store[STORAGE_KEY] = JSON.stringify({
      version: 1,
      profiles: [
        { id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', autoConnect: true, pinned: true, createdAt: 1 },
        { id: 'p2', name: 'test2', host: 'h2', share: 's2', username: 'u2', autoConnect: 'yes', createdAt: 2 },
      ],
    });
    await useSmbProfilesStore.getState().load();
    const profiles = useSmbProfilesStore.getState().profiles;
    assert.equal(profiles[0].autoConnect, true);
    assert.equal(profiles[0].pinned, true);
    assert.equal(profiles[1].autoConnect, undefined);
  });
});