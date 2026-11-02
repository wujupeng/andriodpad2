/**
 * TASK-RP-01-B 验证脚本：normalizeRootPath 纯函数单元测试
 * 追溯：REQ-RP-10（输入规范化）、REQ-RP-11（越界片段拒绝）、REQ-RP-12（多级路径允许）
 * 运行：npx tsx scripts/verify-rp-normalize.mjs
 * 输出：scripts/rp-normalize-result.json
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeRootPath } from '../src/utils/rootPathNormalize.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function main() {
  // 合法单级
  record(
    '合法单级：AutoFileBackup',
    deepEq(normalizeRootPath('AutoFileBackup'), { ok: true, value: 'AutoFileBackup' }),
    JSON.stringify(normalizeRootPath('AutoFileBackup')),
  );

  // 合法多级（/ 分隔）
  const r2 = normalizeRootPath('AutoFileBackup/2026');
  record(
    '合法多级（/ 分隔）：AutoFileBackup/2026 → AutoFileBackup\\2026',
    deepEq(r2, { ok: true, value: 'AutoFileBackup\\2026' }),
    JSON.stringify(r2),
  );

  // 合法多级（\ 分隔）
  const r3 = normalizeRootPath('a\\b\\c');
  record(
    '合法多级（\\ 分隔）：a\\b\\c → a\\b\\c',
    deepEq(r3, { ok: true, value: 'a\\b\\c' }),
    JSON.stringify(r3),
  );

  // 首尾分隔符与空白
  const r4 = normalizeRootPath(' /AutoFileBackup/ ');
  record(
    '首尾空白+斜杠： /AutoFileBackup/  → AutoFileBackup',
    deepEq(r4, { ok: true, value: 'AutoFileBackup' }),
    JSON.stringify(r4),
  );

  const r5 = normalizeRootPath('\\Auto\\');
  record(
    '首尾反斜杠：\\Auto\\ → Auto',
    deepEq(r5, { ok: true, value: 'Auto' }),
    JSON.stringify(r5),
  );

  // 空串类
  const emptyCases = ['  ', '/', '\\', ''];
  for (const c of emptyCases) {
    const r = normalizeRootPath(c);
    record(
      `空串类：${JSON.stringify(c)} → { ok: false, reason: 'empty' }`,
      deepEq(r, { ok: false, reason: 'empty' }),
      JSON.stringify(r),
    );
  }

  // 父级引用
  const r6 = normalizeRootPath('../other');
  record(
    '父级引用：../other → parent_ref',
    deepEq(r6, { ok: false, reason: 'parent_ref' }),
    JSON.stringify(r6),
  );

  const r7 = normalizeRootPath('a/../b');
  record(
    '父级引用（中间段）：a/../b → parent_ref',
    deepEq(r7, { ok: false, reason: 'parent_ref' }),
    JSON.stringify(r7),
  );

  // 非法类型
  const invalidCases = [
    [123, 'number'],
    [null, 'null'],
    [undefined, 'undefined'],
    [{}, 'object'],
  ];
  for (const [val, label] of invalidCases) {
    const r = normalizeRootPath(val);
    record(
      `非法类型：${label} → invalid_type`,
      deepEq(r, { ok: false, reason: 'invalid_type' }),
      JSON.stringify(r),
    );
  }

  // 混合分隔符（R-RP-04 缓解）
  const r8 = normalizeRootPath('a/b\\c');
  record(
    '混合分隔符：a/b\\c → a\\b\\c',
    deepEq(r8, { ok: true, value: 'a\\b\\c' }),
    JSON.stringify(r8),
  );

  // 仅分隔符多级
  const r9 = normalizeRootPath('///');
  record(
    '仅前导斜杠：/// → empty',
    deepEq(r9, { ok: false, reason: 'empty' }),
    JSON.stringify(r9),
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
    join(__dirname, 'rp-normalize-result.json'),
    JSON.stringify({ summary, results }, null, 2),
  );

  console.log(
    failed.length === 0
      ? `\n✓ TASK-RP-01 normalizeRootPath 验证通过（${results.length}/${results.length}）`
      : `\n✗ 验证失败（${failed.length}/${results.length} 失败）`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main();