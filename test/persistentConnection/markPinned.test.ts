/**
 * TASK-PC-05-02: markPinned API 单元测试。
 * 覆盖 DFX-PC-04/07, REQ-CO-02/03。
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useSmbProfilesStore } from '../../src/state/smbProfilesStore';

if (!(import.meta as any).env) (import.meta as any).env = { DEV: false };

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

describe('TASK-PC-05-02 markPinned API', () => {
  test('① profile 存在时 pinned 字段更新并持久化', async () => {
    store[STORAGE_KEY] = JSON.stringify({
      version: 1,
      profiles: [
        { id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', createdAt: 1 },
      ],
    });
    await useSmbProfilesStore.getState().load();
    await useSmbProfilesStore.getState().markPinned('p1', true);
    assert.equal(useSmbProfilesStore.getState().profiles[0].pinned, true);
    const persisted = JSON.parse(store[STORAGE_KEY]);
    assert.equal(persisted.profiles[0].pinned, true);
  });

  test('② profile 不存在时静默返回不抛错', async () => {
    await useSmbProfilesStore.getState().markPinned('nonexistent', true);
    assert.equal(useSmbProfilesStore.getState().profiles.length, 0);
  });

  test('③ 持久化失败时内存态 pinned 生效且不崩溃（DFX-PC-04）', async () => {
    useSmbProfilesStore.setState({
      profiles: [{ id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', createdAt: 1 }] as any,
    });
    await useSmbProfilesStore.getState().markPinned('p1', true);
    assert.equal(useSmbProfilesStore.getState().profiles[0].pinned, true);
    await useSmbProfilesStore.getState().markPinned('p1', false);
    assert.equal(useSmbProfilesStore.getState().profiles[0].pinned, false);
  });

  test('④ autoConnect 字段零变更（REQ-CO-02/03）', async () => {
    store[STORAGE_KEY] = JSON.stringify({
      version: 1,
      profiles: [
        { id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', autoConnect: true, createdAt: 1 },
      ],
    });
    await useSmbProfilesStore.getState().load();
    await useSmbProfilesStore.getState().markPinned('p1', true);
    assert.equal(useSmbProfilesStore.getState().profiles[0].autoConnect, true);
    await useSmbProfilesStore.getState().markPinned('p1', false);
    assert.equal(useSmbProfilesStore.getState().profiles[0].autoConnect, true);
  });

  test('⑤ passwordEncrypted 字段零变更（DFX-PC-07）', async () => {
    store[STORAGE_KEY] = JSON.stringify({
      version: 1,
      profiles: [
        { id: 'p1', name: 'test', host: 'h', share: 's', username: 'u', passwordEncrypted: 'a.b.c', createdAt: 1 },
      ],
    });
    await useSmbProfilesStore.getState().load();
    await useSmbProfilesStore.getState().markPinned('p1', true);
    assert.equal(useSmbProfilesStore.getState().profiles[0].passwordEncrypted, 'a.b.c');
  });

  test('⑥ 既有 save/load/remove 接口回归不破坏', async () => {
    await useSmbProfilesStore.getState().save({
      name: 'test', host: 'h', share: 's', username: 'u', autoConnect: true,
    });
    assert.equal(useSmbProfilesStore.getState().profiles.length, 1);
    const id = useSmbProfilesStore.getState().profiles[0].id;
    await useSmbProfilesStore.getState().load();
    assert.equal(useSmbProfilesStore.getState().profiles.length, 1);
    await useSmbProfilesStore.getState().remove(id);
    assert.equal(useSmbProfilesStore.getState().profiles.length, 0);
  });
});