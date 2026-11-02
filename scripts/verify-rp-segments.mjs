/**
 * TASK-RP-04-C 验证脚本：buildSegments rootPath 扩展单元测试
 * 追溯：REQ-RP-05（根段显示）、REQ-RP-06（向上越界禁止）、REQ-RP-07（未配置时面包屑不变）
 * 运行：npx tsx scripts/verify-rp-segments.mjs
 * 输出：scripts/rp-segments-result.json
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 内联 buildSegments（与 BrowsePage/index.tsx 同源，避免 React 副作用）
function buildSegments(currentPath, rootName, rootPath) {
  const segments = [{ name: rootName, path: rootPath || '' }];
  if (rootPath) {
    if (currentPath === rootPath || currentPath.startsWith(rootPath + '\\')) {
      const remainder = currentPath === rootPath ? '' : currentPath.slice(rootPath.length + 1);
      const parts = remainder.split('\\').filter(Boolean);
      let acc = rootPath;
      for (const part of parts) {
        acc = `${acc}\\${part}`;
        segments.push({ name: part, path: acc });
      }
    }
    return segments;
  }
  if (currentPath && currentPath !== '/') {
    const parts = currentPath.split('\\').filter(Boolean);
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}\\${part}` : part;
      segments.push({ name: part, path: acc });
    }
  }
  return segments;
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function main() {
  // rootPath 未传（现状，REQ-RP-07）
  const r1 = buildSegments('\\sub', 'soft');
  record(
    'rootPath 未传 → 现状逻辑（根段 path="" + 全量拆分）',
    deepEq(r1, [{ name: 'soft', path: '' }, { name: 'sub', path: 'sub' }]),
    JSON.stringify(r1),
  );

  // currentPath === rootPath → 仅根段（REQ-RP-06）
  const r2 = buildSegments('AutoFileBackup', 'AutoFileBackup', 'AutoFileBackup');
  record(
    'currentPath===rootPath → 仅根段',
    deepEq(r2, [{ name: 'AutoFileBackup', path: 'AutoFileBackup' }]),
    JSON.stringify(r2),
  );

  // currentPath 在 rootPath 内 → 剥离前缀后拆分（REQ-RP-05）
  const r3 = buildSegments('AutoFileBackup\\sub', 'AutoFileBackup', 'AutoFileBackup');
  record(
    'currentPath 在 rootPath 内 → 根段 + sub 子段',
    deepEq(r3, [
      { name: 'AutoFileBackup', path: 'AutoFileBackup' },
      { name: 'sub', path: 'AutoFileBackup\\sub' },
    ]),
    JSON.stringify(r3),
  );

  // currentPath 越出 rootPath → 仅根段（防御层 2，REQ-RP-06）
  const r4 = buildSegments('OtherDir', 'AutoFileBackup', 'AutoFileBackup');
  record(
    'currentPath 越出 rootPath → 仅根段（防御层 2）',
    deepEq(r4, [{ name: 'AutoFileBackup', path: 'AutoFileBackup' }]),
    JSON.stringify(r4),
  );

  // 多级 rootPath（REQ-RP-12）
  const r5 = buildSegments('AutoFileBackup\\2026\\sub', '工作目录', 'AutoFileBackup\\2026');
  record(
    '多级 rootPath → 根段 + sub 子段',
    deepEq(r5, [
      { name: '工作目录', path: 'AutoFileBackup\\2026' },
      { name: 'sub', path: 'AutoFileBackup\\2026\\sub' },
    ]),
    JSON.stringify(r5),
  );

  // 未配置 rootPath 且 currentPath='/' → 仅根段（现状）
  const r6 = buildSegments('/', 'soft');
  record(
    '未配置 rootPath 且 currentPath="/" → 仅根段 path=""',
    deepEq(r6, [{ name: 'soft', path: '' }]),
    JSON.stringify(r6),
  );

  // 多级子段
  const r7 = buildSegments('AutoFileBackup\\a\\b\\c', 'root', 'AutoFileBackup');
  record(
    '多级子段：rootPath 下 a\\b\\c',
    deepEq(r7, [
      { name: 'root', path: 'AutoFileBackup' },
      { name: 'a', path: 'AutoFileBackup\\a' },
      { name: 'b', path: 'AutoFileBackup\\a\\b' },
      { name: 'c', path: 'AutoFileBackup\\a\\b\\c' },
    ]),
    JSON.stringify(r7),
  );

  // rootPath 未传 + 多级 currentPath
  const r8 = buildSegments('a\\b\\c', 'soft');
  record(
    'rootPath 未传 + 多级 currentPath → 全量拆分',
    deepEq(r8, [
      { name: 'soft', path: '' },
      { name: 'a', path: 'a' },
      { name: 'b', path: 'a\\b' },
      { name: 'c', path: 'a\\b\\c' },
    ]),
    JSON.stringify(r8),
  );

  const failed = results.filter((r) => !r.pass);
  const summary = {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    ts: new Date().toISOString(),
  };

  writeFileSync(
    join(__dirname, 'rp-segments-result.json'),
    JSON.stringify({ summary, results }, null, 2),
  );

  console.log(
    failed.length === 0
      ? `\n✓ TASK-RP-04 buildSegments 验证通过（${results.length}/${results.length}）`
      : `\n✗ 验证失败（${failed.length}/${results.length} 失败）`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main();