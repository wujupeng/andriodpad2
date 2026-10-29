import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkEditWritePermission } from '../src/state/editWritePermission.ts';
import { WRITE_ENABLED_SCOPE } from '../src/state/writePermission.ts';

describe('checkEditWritePermission — 未打开基线', () => {
  test('remotePath=null → permitted=false, reason 含未打开文件基线', () => {
    const result = checkEditWritePermission(null);
    assert.equal(result.permitted, false);
    assert.ok(result.reason?.includes('未打开文件基线'));
  });

  test('remotePath=空字符串 → permitted=false', () => {
    const result = checkEditWritePermission('');
    assert.equal(result.permitted, false);
    assert.ok(result.reason?.includes('未打开文件基线'));
  });

  test('remotePath=null + candidatePath 提供 → 仍 denied（基线缺失优先）', () => {
    const result = checkEditWritePermission(null, '/mnt/share/writable/new.txt');
    assert.equal(result.permitted, false);
    assert.ok(result.reason?.includes('未打开文件基线'));
  });
});

describe('checkEditWritePermission — AU-005 只读兼容（enabled=false）', () => {
  test('可写目录内路径 → denied（全局开关关闭）', () => {
    const result = checkEditWritePermission('/mnt/share/writable/file.txt');
    assert.equal(result.permitted, false);
  });

  test('可写目录外路径 → denied', () => {
    const result = checkEditWritePermission('/mnt/storage/file.txt');
    assert.equal(result.permitted, false);
  });

  test('任意路径 → denied（等价 AU-005 全拦截）', () => {
    const result = checkEditWritePermission('/any/random/path.txt');
    assert.equal(result.permitted, false);
  });

  test('reason 为只读模式提示文案（READ_ONLY_NOTICES.writebackDisabledReason）', () => {
    const result = checkEditWritePermission('/mnt/share/writable/file.txt');
    assert.equal(result.permitted, false);
    assert.ok(result.reason?.includes('只读模式'));
  });
});

describe('checkEditWritePermission — 路径边界校验', () => {
  test('目录穿越 ../ → denied', () => {
    const result = checkEditWritePermission('/mnt/share/writable/../other/file.txt');
    assert.equal(result.permitted, false);
  });

  test('深层目录穿越 → denied', () => {
    const result = checkEditWritePermission('/mnt/share/writable/sub/../../other/file.txt');
    assert.equal(result.permitted, false);
  });

  test('绝对路径逃逸 /mnt/storage/ → denied', () => {
    const result = checkEditWritePermission('/mnt/storage/file.txt');
    assert.equal(result.permitted, false);
  });
});

describe('checkEditWritePermission — candidatePath（saveas 场景）', () => {
  test('candidatePath 在可写目录内 → denied（enabled=false）', () => {
    const result = checkEditWritePermission(
      '/mnt/share/writable/orig.txt',
      '/mnt/share/writable/new.txt',
    );
    assert.equal(result.permitted, false);
  });

  test('candidatePath 目录穿越 → denied', () => {
    const result = checkEditWritePermission(
      '/mnt/share/writable/orig.txt',
      '/mnt/share/writable/../escape.txt',
    );
    assert.equal(result.permitted, false);
  });

  test('candidatePath 绝对路径逃逸 → denied', () => {
    const result = checkEditWritePermission(
      '/mnt/share/writable/orig.txt',
      '/mnt/storage/escape.txt',
    );
    assert.equal(result.permitted, false);
  });

  test('candidatePath 为空字符串 → denied（规范化为 /，不在可写目录）', () => {
    const result = checkEditWritePermission(
      '/mnt/share/writable/orig.txt',
      '',
    );
    assert.equal(result.permitted, false);
  });
});

describe('checkEditWritePermission — 默认拒绝原则', () => {
  test('WRITE_ENABLED_SCOPE.enabled=false → 任何输入组合均 denied', () => {
    assert.equal(WRITE_ENABLED_SCOPE.enabled, false);
    const cases = [
      checkEditWritePermission('/mnt/share/writable/file.txt'),
      checkEditWritePermission('/mnt/storage/file.txt'),
      checkEditWritePermission('/any/path'),
      checkEditWritePermission('/mnt/share/writable/file.txt', '/mnt/share/writable/new.txt'),
      checkEditWritePermission('/mnt/share/writable/file.txt', '/mnt/storage/new.txt'),
    ];
    for (const c of cases) {
      assert.equal(c.permitted, false);
    }
  });

  test('所有 denied 结果均包含 reason 字段', () => {
    const cases = [
      checkEditWritePermission(null),
      checkEditWritePermission(''),
      checkEditWritePermission('/mnt/share/writable/file.txt'),
      checkEditWritePermission('/mnt/storage/file.txt'),
      checkEditWritePermission('/mnt/share/writable/../escape.txt'),
    ];
    for (const c of cases) {
      assert.equal(c.permitted, false);
      assert.ok(c.reason !== undefined && c.reason.length > 0);
    }
  });
});

describe('checkEditWritePermission — 状态恢复语义', () => {
  test('权限拒绝不修改外部状态（纯函数，无副作用）', () => {
    const result1 = checkEditWritePermission('/mnt/share/writable/file.txt');
    const result2 = checkEditWritePermission('/mnt/share/writable/file.txt');
    assert.deepEqual(result1, result2);
  });

  test('同一路径多次调用结果一致（幂等性）', () => {
    for (let i = 0; i < 5; i++) {
      const result = checkEditWritePermission('/mnt/share/writable/file.txt');
      assert.equal(result.permitted, false);
    }
  });

  test('DISCARD 场景不需要权限检查（调用方在 DISCARD 时跳过此函数）', () => {
    // 文档性测试：DISCARD 不调用 checkEditWritePermission，直接 transition to session_terminated
    // 此测试验证函数对非 DISCARD 路径的正确拒绝行为
    const result = checkEditWritePermission('/mnt/share/writable/file.txt');
    assert.equal(result.permitted, false);
  });
});