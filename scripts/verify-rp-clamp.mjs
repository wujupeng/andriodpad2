/**
 * TASK-RP-03-F 验证脚本：clampToLogicalRoot 纯函数单元测试
 * 追溯：CON-RP-03（浏览逻辑根不可越界）、REQ-RP-06（向上越界禁止）
 * 运行：npx tsx scripts/verify-rp-clamp.mjs
 * 输出：scripts/rp-clamp-result.json
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clampToLogicalRoot } from '../src/state/browseContextStore.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function main() {
  // 无 rootPath → 原样返回
  record(
    '无 rootPath（undefined）→ 原样返回 path',
    clampToLogicalRoot('AnyDir', undefined) === 'AnyDir',
    clampToLogicalRoot('AnyDir', undefined),
  );

  record(
    '无 rootPath（空串）→ 原样返回 path',
    clampToLogicalRoot('AnyDir', '') === 'AnyDir',
    clampToLogicalRoot('AnyDir', ''),
  );

  // path 在 rootPath 内 → 原样
  record(
    'path 在 rootPath 内（子路径）→ 原样返回',
    clampToLogicalRoot('AutoFileBackup\\sub', 'AutoFileBackup') === 'AutoFileBackup\\sub',
    clampToLogicalRoot('AutoFileBackup\\sub', 'AutoFileBackup'),
  );

  record(
    'path === rootPath → 原样返回',
    clampToLogicalRoot('AutoFileBackup', 'AutoFileBackup') === 'AutoFileBackup',
    clampToLogicalRoot('AutoFileBackup', 'AutoFileBackup'),
  );

  // path 越出 rootPath → 钳制到 rootPath
  record(
    'path 越出 rootPath（OtherDir）→ 钳制到 rootPath',
    clampToLogicalRoot('OtherDir', 'AutoFileBackup') === 'AutoFileBackup',
    clampToLogicalRoot('OtherDir', 'AutoFileBackup'),
  );

  record(
    'path 为 share 根 "/" 且 rootPath 非空 → 钳制到 rootPath',
    clampToLogicalRoot('/', 'AutoFileBackup') === 'AutoFileBackup',
    clampToLogicalRoot('/', 'AutoFileBackup'),
  );

  // 多级 rootPath
  record(
    '多级 rootPath：path 在内 → 原样',
    clampToLogicalRoot('AutoFileBackup\\2026\\sub', 'AutoFileBackup\\2026') === 'AutoFileBackup\\2026\\sub',
    clampToLogicalRoot('AutoFileBackup\\2026\\sub', 'AutoFileBackup\\2026'),
  );

  record(
    '多级 rootPath：path 越出 → 钳制',
    clampToLogicalRoot('AutoFileBackup\\other', 'AutoFileBackup\\2026') === 'AutoFileBackup\\2026',
    clampToLogicalRoot('AutoFileBackup\\other', 'AutoFileBackup\\2026'),
  );

  // 边界：path 以 rootPath 名前缀但不以 \\ 分隔（如 rootPath="Auto", path="AutoFileBackup"）
  record(
    'path 以 rootPath 名前缀但非 \\ 分隔 → 钳制（不误判为在内）',
    clampToLogicalRoot('AutoFileBackup', 'Auto') === 'Auto',
    clampToLogicalRoot('AutoFileBackup', 'Auto'),
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
    join(__dirname, 'rp-clamp-result.json'),
    JSON.stringify({ summary, results }, null, 2),
  );

  console.log(
    failed.length === 0
      ? `\n✓ TASK-RP-03 clampToLogicalRoot 验证通过（${results.length}/${results.length}）`
      : `\n✗ 验证失败（${failed.length}/${results.length} 失败）`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main();