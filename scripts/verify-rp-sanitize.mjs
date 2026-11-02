/**
 * TASK-RP-02-D 验证脚本：sanitizeProfile rootPath 白名单分支单元测试
 * 追溯：REQ-RP-01（字段可选性）、REQ-RP-14（持久化清洗）、REQ-RP-15（旧数据零迁移）、REQ-RP-18（非法值容错）
 * 运行：npx tsx scripts/verify-rp-sanitize.mjs
 * 输出：scripts/rp-sanitize-result.json
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 内联 sanitizeProfile 逻辑（与 src/state/smbProfilesStore.ts 同源，避免 zustand/Preferences 副作用）
import { normalizeRootPath } from '../src/utils/rootPathNormalize.ts';

function sanitizeProfile(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw;
  if (
    typeof p.id !== 'string' ||
    typeof p.name !== 'string' ||
    typeof p.host !== 'string' ||
    typeof p.share !== 'string' ||
    typeof p.username !== 'string' ||
    typeof p.createdAt !== 'number'
  ) {
    return null;
  }
  const profile = {
    id: p.id,
    name: p.name,
    host: p.host,
    share: p.share,
    username: p.username,
    createdAt: p.createdAt,
  };
  if (typeof p.domain === 'string' && p.domain) profile.domain = p.domain;
  if (p.passwordEmpty === true) profile.passwordEmpty = true;
  if (p.autoConnect === true) profile.autoConnect = true;
  if (p.pinned === true) profile.pinned = true;
  if (typeof p.rootPath === 'string' && p.rootPath) {
    const rpResult = normalizeRootPath(p.rootPath);
    if (rpResult.ok === true && rpResult.value) {
      profile.rootPath = rpResult.value;
    }
  }
  if (typeof p.lastConnectedAt === 'number') profile.lastConnectedAt = p.lastConnectedAt;
  return profile;
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const baseProfile = {
  id: 'p1',
  name: 'test',
  host: '192.168.2.247',
  share: 'soft',
  username: 'guest',
  createdAt: 1700000000000,
};

function main() {
  // 旧数据无 rootPath 字段 → undefined（REQ-RP-15）
  const r1 = sanitizeProfile({ ...baseProfile });
  record(
    '旧数据无 rootPath 字段 → rootPath=undefined（REQ-RP-15）',
    r1 !== null && r1.rootPath === undefined,
    JSON.stringify(r1.rootPath),
  );

  // 非法类型：数字 → 丢弃（REQ-RP-14/18）
  const r2 = sanitizeProfile({ ...baseProfile, rootPath: 123 });
  record(
    '非法类型 rootPath=123 → rootPath=undefined',
    r2 !== null && r2.rootPath === undefined && r2.id === 'p1',
    JSON.stringify(r2.rootPath),
  );

  // 非法类型：null → 丢弃
  const r3 = sanitizeProfile({ ...baseProfile, rootPath: null });
  record(
    '非法类型 rootPath=null → rootPath=undefined',
    r3 !== null && r3.rootPath === undefined,
    JSON.stringify(r3.rootPath),
  );

  // 含 .. 越界 → 丢弃（REQ-RP-18）
  const r4 = sanitizeProfile({ ...baseProfile, rootPath: '../x' });
  record(
    '含 .. 越界 rootPath="../x" → rootPath=undefined（REQ-RP-18）',
    r4 !== null && r4.rootPath === undefined,
    JSON.stringify(r4.rootPath),
  );

  // 含首尾分隔符 → 规范化落位（REQ-RP-10）
  const r5 = sanitizeProfile({ ...baseProfile, rootPath: '/Auto/' });
  record(
    '含首尾分隔符 rootPath="/Auto/" → rootPath="Auto"（REQ-RP-10）',
    r5 !== null && r5.rootPath === 'Auto',
    JSON.stringify(r5.rootPath),
  );

  // 合法多级 → 落位（REQ-RP-12）
  const r6 = sanitizeProfile({ ...baseProfile, rootPath: 'AutoFileBackup/2026' });
  record(
    '合法多级 rootPath="AutoFileBackup/2026" → rootPath="AutoFileBackup\\2026"（REQ-RP-12）',
    r6 !== null && r6.rootPath === 'AutoFileBackup\\2026',
    JSON.stringify(r6.rootPath),
  );

  // 空串 → undefined（REQ-RP-01）
  const r7 = sanitizeProfile({ ...baseProfile, rootPath: '' });
  record(
    '空串 rootPath="" → rootPath=undefined（REQ-RP-01）',
    r7 !== null && r7.rootPath === undefined,
    JSON.stringify(r7.rootPath),
  );

  // 空白串 → undefined
  const r8 = sanitizeProfile({ ...baseProfile, rootPath: '   ' });
  record(
    '空白串 rootPath="   " → rootPath=undefined',
    r8 !== null && r8.rootPath === undefined,
    JSON.stringify(r8.rootPath),
  );

  // 必填字段缺失仍整体丢弃
  const r9 = sanitizeProfile({ rootPath: 'Auto' });
  record(
    '必填字段缺失（仅 rootPath）→ 返回 null（整体丢弃）',
    r9 === null,
    JSON.stringify(r9),
  );

  // 其余字段不受影响
  const r10 = sanitizeProfile({ ...baseProfile, rootPath: 'Auto', domain: 'WORKGROUP', autoConnect: true });
  record(
    'rootPath 合法 + 其余字段共存 → 全部落位',
    r10 !== null && r10.rootPath === 'Auto' && r10.domain === 'WORKGROUP' && r10.autoConnect === true,
    JSON.stringify({ rootPath: r10?.rootPath, domain: r10?.domain, autoConnect: r10?.autoConnect }),
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
    join(__dirname, 'rp-sanitize-result.json'),
    JSON.stringify({ summary, results }, null, 2),
  );

  console.log(
    failed.length === 0
      ? `\n✓ TASK-RP-02 sanitizeProfile rootPath 验证通过（${results.length}/${results.length}）`
      : `\n✗ 验证失败（${failed.length}/${results.length} 失败）`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main();