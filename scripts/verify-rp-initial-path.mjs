/**
 * TASK-RP-03-F 验证脚本：resolveInitialPath 纯函数单元测试
 * 追溯：REQ-RP-03（初始路径）
 * 运行：npx tsx scripts/verify-rp-initial-path.mjs
 * 输出：scripts/rp-initial-path-result.json
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveInitialPath } from '../src/state/browseContextStore.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function main() {
  record(
    'rootPath 非空 → 返回 rootPath',
    resolveInitialPath('AutoFileBackup') === 'AutoFileBackup',
    resolveInitialPath('AutoFileBackup'),
  );

  record(
    'rootPath=undefined → 返回 "/"',
    resolveInitialPath(undefined) === '/',
    resolveInitialPath(undefined),
  );

  record(
    'rootPath=空串 → 返回 "/"',
    resolveInitialPath('') === '/',
    resolveInitialPath(''),
  );

  record(
    'rootPath 多级 → 返回多级路径',
    resolveInitialPath('AutoFileBackup\\2026') === 'AutoFileBackup\\2026',
    resolveInitialPath('AutoFileBackup\\2026'),
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
    join(__dirname, 'rp-initial-path-result.json'),
    JSON.stringify({ summary, results }, null, 2),
  );

  console.log(
    failed.length === 0
      ? `\n✓ TASK-RP-03 resolveInitialPath 验证通过（${results.length}/${results.length}）`
      : `\n✗ 验证失败（${failed.length}/${results.length} 失败）`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main();