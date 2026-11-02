/**
 * TASK-RP-06-F 验证脚本：isSameProfileIdentity 回归测试
 * 追溯：CON-RP-01（rootPath 不参与身份判定）、REQ-RP-17（未配置行为等价）
 * 运行：npx tsx scripts/verify-rp-identity.mjs
 * 输出：scripts/rp-identity-result.json
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSameProfileIdentity } from '../src/state/smbProfilesStore.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function main() {
  // CON-RP-01：rootPath 不参与身份判定
  const a = { host: '192.168.2.247', share: 'soft', username: 'guest' };
  const b = { host: '192.168.2.247', share: 'soft', username: 'guest', rootPath: 'AutoFileBackup' };

  record(
    'CON-RP-01：仅 rootPath 不同 → 视为同身份',
    isSameProfileIdentity(a, b) === true,
    String(isSameProfileIdentity(a, b)),
  );

  const c = { host: '192.168.2.247', share: 'soft', username: 'guest', rootPath: 'A' };
  const d = { host: '192.168.2.247', share: 'soft', username: 'guest', rootPath: 'B' };

  record(
    'CON-RP-01：两配置均含不同 rootPath → 仍视为同身份',
    isSameProfileIdentity(c, d) === true,
    String(isSameProfileIdentity(c, d)),
  );

  // 身份四元组不同 → 不同身份
  const e = { host: '192.168.2.247', share: 'soft', username: 'guest' };
  const f = { host: '192.168.2.247', share: 'soft', username: 'admin' };

  record(
    '用户名不同 → 不同身份',
    isSameProfileIdentity(e, f) === false,
    String(isSameProfileIdentity(e, f)),
  );

  // host 大小写不敏感
  const g = { host: '192.168.2.247', share: 'soft', username: 'guest' };
  const h = { host: '192.168.2.247', share: 'Soft', username: 'guest' };

  record(
    'share 大小写不敏感 → 同身份',
    isSameProfileIdentity(g, h) === true,
    String(isSameProfileIdentity(g, h)),
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
    join(__dirname, 'rp-identity-result.json'),
    JSON.stringify({ summary, results }, null, 2),
  );

  console.log(
    failed.length === 0
      ? `\n✓ TASK-RP-06-F isSameProfileIdentity 回归验证通过（${results.length}/${results.length}）`
      : `\n✗ 验证失败（${failed.length}/${results.length} 失败）`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main();