import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  WRITE_ENABLED_SCOPE,
  WRITE_PERMISSION_MATRIX,
  normalizeAndValidatePath,
  isWriteEnabledForPath,
  isReadOnlyForPath,
  detectSymlink,
  accountHasWritePermission,
} from '../src/state/writePermission.ts';

describe('WRITE_ENABLED_SCOPE', () => {
  test('enabled 默认为 false（AU-005 只读兼容）', () => {
    assert.equal(WRITE_ENABLED_SCOPE.enabled, false);
  });

  test('account 为 pad2_app（≠ debian）', () => {
    assert.equal(WRITE_ENABLED_SCOPE.account, 'pad2_app');
  });

  test('writablePaths 含 /mnt/share/writable/', () => {
    assert.ok(WRITE_ENABLED_SCOPE.writablePaths.includes('/mnt/share/writable/'));
  });

  test('credentialStorage 为 keystore', () => {
    assert.equal(WRITE_ENABLED_SCOPE.credentialStorage, 'keystore');
  });

  test('rotationPeriodDays 为 90', () => {
    assert.equal(WRITE_ENABLED_SCOPE.rotationPeriodDays, 90);
  });
});

describe('WRITE_PERMISSION_MATRIX', () => {
  test('writeback 为 true', () => {
    assert.equal(WRITE_PERMISSION_MATRIX.writeback, true);
  });

  test('saveas 为 true', () => {
    assert.equal(WRITE_PERMISSION_MATRIX.saveas, true);
  });

  test('overwrite 为 explicit_confirm（须用户确认）', () => {
    assert.equal(WRITE_PERMISSION_MATRIX.overwrite, 'explicit_confirm');
  });

  test('tempFileRename 为 true', () => {
    assert.equal(WRITE_PERMISSION_MATRIX.tempFileRename, true);
  });

  test('conflictDetection 为 true', () => {
    assert.equal(WRITE_PERMISSION_MATRIX.conflictDetection, true);
  });
});

describe('normalizeAndValidatePath', () => {
  const writableRoots = ['/mnt/share/writable/'];

  test('受限目录内路径 → isWithinWritable=true', () => {
    const result = normalizeAndValidatePath('/mnt/share/writable/file.txt', writableRoots);
    assert.equal(result.isWithinWritable, true);
    assert.equal(result.violation, undefined);
  });

  test('受限目录根 → isWithinWritable=true', () => {
    const result = normalizeAndValidatePath('/mnt/share/writable/', writableRoots);
    assert.equal(result.isWithinWritable, true);
  });

  test('受限目录外路径 → isWithinWritable=false, violation=absolute_escape', () => {
    const result = normalizeAndValidatePath('/mnt/storage/file.txt', writableRoots);
    assert.equal(result.isWithinWritable, false);
    assert.equal(result.violation, 'absolute_escape');
  });

  test('目录穿越 ../ → isWithinWritable=false, violation=traversal', () => {
    const result = normalizeAndValidatePath('/mnt/share/writable/../other/file.txt', writableRoots);
    assert.equal(result.isWithinWritable, false);
    assert.equal(result.violation, 'traversal');
  });

  test('深层目录穿越 → 规范化后越界', () => {
    const result = normalizeAndValidatePath('/mnt/share/writable/sub/../../other/file.txt', writableRoots);
    assert.equal(result.isWithinWritable, false);
  });

  test('./ 规范化', () => {
    const result = normalizeAndValidatePath('/mnt/share/writable/./file.txt', writableRoots);
    assert.equal(result.normalized, '/mnt/share/writable/file.txt');
    assert.equal(result.isWithinWritable, true);
  });

  test('多斜杠规范化', () => {
    const result = normalizeAndValidatePath('/mnt/share/writable//file.txt', writableRoots);
    assert.equal(result.normalized, '/mnt/share/writable/file.txt');
    assert.equal(result.isWithinWritable, true);
  });

  test('空路径 → 规范化为 /', () => {
    const result = normalizeAndValidatePath('', writableRoots);
    assert.equal(result.normalized, '/');
    assert.equal(result.isWithinWritable, false);
  });
});

describe('isWriteEnabledForPath（默认拒绝）', () => {
  test('enabled=false → 任何路径都返回 false', () => {
    assert.equal(isWriteEnabledForPath('/mnt/share/writable/file.txt'), false);
    assert.equal(isWriteEnabledForPath('/mnt/storage/file.txt'), false);
    assert.equal(isWriteEnabledForPath('/any/path'), false);
  });

  test('空路径 → false', () => {
    assert.equal(isWriteEnabledForPath(''), false);
  });

  test('目录穿越路径 → false', () => {
    assert.equal(isWriteEnabledForPath('/mnt/share/writable/../other/file.txt'), false);
  });
});

describe('isReadOnlyForPath', () => {
  test('enabled=false → 任何路径都返回 true（只读）', () => {
    assert.equal(isReadOnlyForPath('/mnt/share/writable/file.txt'), true);
    assert.equal(isReadOnlyForPath('/any/path'), true);
  });
});

describe('accountHasWritePermission', () => {
  test('当前返回 false（pad2_app 账户未创建）', () => {
    assert.equal(accountHasWritePermission(), false);
  });
});

describe('detectSymlink', () => {
  test('返回 { isSymlink: false, reject: false }（占位实现）', async () => {
    const result = await detectSymlink('/mnt/share/writable/file.txt');
    assert.equal(result.isSymlink, false);
    assert.equal(result.reject, false);
  });
});