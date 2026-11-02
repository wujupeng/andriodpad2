/**
 * sortRecentFiles 纯函数单元测试（TASK-TEST-01）。
 * 覆盖 REQ-RF-01（四字段×升降序）、REQ-RF-08（不改原 entries LRU 顺序）。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sortRecentFiles } from '../src/utils/recentFileSort.ts';
import type { RecentFileEntry } from '../src/state/recentFilesStore.ts';
import type { RecentSortPrefs } from '../src/state/recentSortPrefsStore.ts';

function makeEntry(
  name: string,
  fileType: RecentFileEntry['fileType'],
  source: string,
  accessedAt: number,
  path?: string,
): RecentFileEntry {
  return { path: path ?? `/${source}/${name}`, name, fileType, source, accessedAt };
}

const SAMPLE: RecentFileEntry[] = [
  makeEntry('zebra.pdf', 'doc', 'shareA', 3000),
  makeEntry('apple.docx', 'doc', 'shareB', 1000),
  makeEntry('banana.xlsx', 'sheet', 'shareA', 2000),
  makeEntry('cherry.pptx', 'slides', 'shareB', 4000),
];

describe('sortRecentFiles — REQ-RF-01 四字段×升降序', () => {
  test('accessedAt 降序（默认，等价 LRU）', () => {
    const sort: RecentSortPrefs = { field: 'accessedAt', ascending: false };
    const result = sortRecentFiles(SAMPLE, sort);
    assert.deepEqual(
      result.map((e) => e.name),
      ['cherry.pptx', 'zebra.pdf', 'banana.xlsx', 'apple.docx'],
    );
  });

  test('accessedAt 升序', () => {
    const sort: RecentSortPrefs = { field: 'accessedAt', ascending: true };
    const result = sortRecentFiles(SAMPLE, sort);
    assert.deepEqual(
      result.map((e) => e.name),
      ['apple.docx', 'banana.xlsx', 'zebra.pdf', 'cherry.pptx'],
    );
  });

  test('name 降序', () => {
    const sort: RecentSortPrefs = { field: 'name', ascending: false };
    const result = sortRecentFiles(SAMPLE, sort);
    assert.deepEqual(
      result.map((e) => e.name),
      ['zebra.pdf', 'cherry.pptx', 'banana.xlsx', 'apple.docx'],
    );
  });

  test('name 升序', () => {
    const sort: RecentSortPrefs = { field: 'name', ascending: true };
    const result = sortRecentFiles(SAMPLE, sort);
    assert.deepEqual(
      result.map((e) => e.name),
      ['apple.docx', 'banana.xlsx', 'cherry.pptx', 'zebra.pdf'],
    );
  });

  test('fileType 降序', () => {
    const sort: RecentSortPrefs = { field: 'fileType', ascending: false };
    const result = sortRecentFiles(SAMPLE, sort);
    assert.deepEqual(
      result.map((e) => e.fileType),
      ['slides', 'sheet', 'doc', 'doc'],
    );
  });

  test('fileType 升序', () => {
    const sort: RecentSortPrefs = { field: 'fileType', ascending: true };
    const result = sortRecentFiles(SAMPLE, sort);
    assert.deepEqual(
      result.map((e) => e.fileType),
      ['doc', 'doc', 'sheet', 'slides'],
    );
  });

  test('source 降序', () => {
    const sort: RecentSortPrefs = { field: 'source', ascending: false };
    const result = sortRecentFiles(SAMPLE, sort);
    assert.deepEqual(
      result.map((e) => e.source),
      ['shareB', 'shareB', 'shareA', 'shareA'],
    );
  });

  test('source 升序', () => {
    const sort: RecentSortPrefs = { field: 'source', ascending: true };
    const result = sortRecentFiles(SAMPLE, sort);
    assert.deepEqual(
      result.map((e) => e.source),
      ['shareA', 'shareA', 'shareB', 'shareB'],
    );
  });
});

describe('sortRecentFiles — REQ-RF-08 不改原 entries LRU 顺序', () => {
  test('排序后原数组顺序不变', () => {
    const original = [...SAMPLE];
    const sort: RecentSortPrefs = { field: 'name', ascending: true };
    sortRecentFiles(SAMPLE, sort);
    assert.deepEqual(
      SAMPLE.map((e) => e.name),
      original.map((e) => e.name),
    );
  });

  test('排序返回新数组（不同引用）', () => {
    const sort: RecentSortPrefs = { field: 'name', ascending: true };
    const result = sortRecentFiles(SAMPLE, sort);
    assert.notEqual(result, SAMPLE);
  });
});

describe('sortRecentFiles — 边界', () => {
  test('空数组返回空数组', () => {
    const sort: RecentSortPrefs = { field: 'accessedAt', ascending: false };
    const result = sortRecentFiles([], sort);
    assert.equal(result.length, 0);
  });

  test('单元素返回单元素', () => {
    const single = [makeEntry('only.txt', 'unknown', 'share', 100)];
    const sort: RecentSortPrefs = { field: 'name', ascending: false };
    const result = sortRecentFiles(single, sort);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'only.txt');
  });
});