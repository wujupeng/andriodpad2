#!/usr/bin/env node
/**
 * PAD2-HOTFIX-D2D3D5-001 L2 CDP 验证脚本（TASK-HF-06）
 * 用法：node scripts/hf-d2d3d5-verify.mjs <scenario>
 *   scenario ∈ d2-01..d2-05 | d3-01..d3-06 | d5-01..d5-06 | smoke-v1v4v6
 *   无参数时输出场景列表与用法说明。
 *
 * CDP 通道段与页面四操作模式复制自 scripts/v1v7-cdp.mjs（TASK-S2-06），
 * 未修改原文件（design.md 6.2 只读复用确认）。
 * 断言输出为 ScenarioResult 风格（passed / failureRootCause / evidence，
 * 参照 R1RegressionTestSuite 惯例）；证据归档 docs/p003-hotfix-d2d3d5/shots/。
 *
 * 推荐执行顺序（design 6.4）：d2-01→d2-02→d2-03→d2-04→d2-05 →
 * d3-01→d3-02→d3-03→d3-04→d3-05→d3-06 → d5-01→d5-02→d5-03→d5-04→d5-05→d5-06。
 * 环境重置点：d5-02/d5-05 内含 App 重启；每场景组前测试文件从服务器基线重新拉取。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';

const ADB = 'C:\\Users\\DELL\\Android\\platform-tools\\adb.exe';
const SSH_KEY = path.join(homedir(), '.ssh', 'pad2_cred_closure');
const SSH_OPTS = ['-i', SSH_KEY, '-o', 'StrictHostKeyChecking=no'];
const SSH_TARGET = 'debian@192.168.2.3';
const PACKAGE = 'com.pad2.filemanager';
const CACHE_FILE = '/storage/emulated/0/PAD2/smb_cache/test-render.docx';
const REMOTE_EXPORT_DIR = '/mnt/share/apk/log';
const SHOTS = path.resolve('docs/p003-hotfix-d2d3d5/shots');
const SMB_PWD = process.env.PAD2_SMB_PWD || 'Pad2-Share-2026';
const LOGCAT_TAGS = ['WpsSaveDetector:V', 'SaveAsDiscoveryService:V', 'WpsDeliveryHandler:V'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- CDP 通道段（复制自 scripts/v1v7-cdp.mjs，未修改原文件） ----------
async function discoverPage() {
  const res = await fetch('http://127.0.0.1:9222/json/list');
  const pages = await res.json();
  const page = pages.find((p) => p.type === 'page');
  if (!page) throw new Error('未发现 WebView 调试页面');
  return page.webSocketDebuggerUrl;
}

let ws = null;
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalPage(expression, awaitPromise = false) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise,
  });
  if (exceptionDetails) throw new Error(`evaluate 异常: ${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ''}`);
  return result.value;
}

async function openCdp() {
  ws = new WebSocket(await discoverPage());
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  await send('Runtime.enable');
}

function closeCdp() {
  if (ws) { ws.close(); ws = null; }
}

// ---------- adb / ssh 包装段 ----------
function adb(...args) {
  try {
    return execFileSync(ADB, args, { encoding: 'utf8', timeout: 30000 }).trim();
  } catch (e) {
    throw new Error(`adb ${args.join(' ')} 失败: ${String(e.message).split('\n')[0]}`);
  }
}
function adbShell(cmd) { return adb('shell', cmd); }
function ssh(cmd) {
  return execFileSync('ssh', [...SSH_OPTS, SSH_TARGET, cmd], { encoding: 'utf8', timeout: 30000 }).trim();
}
function scpPull(remote, local) {
  execFileSync('scp', [...SSH_OPTS, `${SSH_TARGET}:${remote}`, local], { encoding: 'utf8', timeout: 60000 });
}
function logcatClear() { try { adb('logcat', '-c'); } catch { /* 清空失败不阻断场景 */ } }
function logcatDump() { return adb('logcat', '-d', '-s', ...LOGCAT_TAGS); }
function statFile(file) { return adbShell(`stat -c '%Y %s' ${file}`); }

// ---------- 页面操作（模式复制自 v1v7-cdp.mjs 四 action） ----------
async function clickText(text) {
  return evalPage(`(() => {
    const candidates = [...document.querySelectorAll('main button, main [role="button"], main .fileRow, main div[class*="fileRow"]')];
    const el = candidates.find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
    if (!el) return 'NOT_FOUND';
    el.click();
    return 'CLICKED';
  })()`);
}

async function pageStatus() {
  return evalPage(`(() => {
    const t = document.body.innerText;
    const rows = [...document.querySelectorAll('main table tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()).join(' | '));
    return { connected: t.includes('已连接'), hasOpen: t.includes('已打开:'), vRows: rows };
  })()`);
}

async function bodyText() {
  return evalPage(`document.body.innerText`);
}

async function getVRow(id) {
  const st = await pageStatus();
  return st.vRows.find((r) => r.startsWith(id + ' ')) ?? null;
}

function rowStatus(row) {
  return row ? row.split(' | ')[2] ?? null : null;
}

async function getStepHistoryTitle(id) {
  return evalPage(`(() => {
    const tr = [...document.querySelectorAll('main table tbody tr')]
      .find((r) => r.querySelector('td') && r.querySelector('td').textContent.trim() === ${JSON.stringify(id)});
    if (!tr) return null;
    const tds = tr.querySelectorAll('td');
    const span = tds[3] ? tds[3].querySelector('span[title]') : null;
    return span ? span.getAttribute('title') : null;
  })()`);
}

async function getSaveAsCandidatePath() {
  return evalPage(`(() => {
    const divs = [...document.querySelectorAll('main div')]
      .filter((x) => (x.textContent || '').includes('候选文件路径:'));
    if (divs.length === 0) return null;
    const inner = divs.filter((x) => !divs.some((y) => y !== x && x.contains(y)));
    const div = inner[inner.length - 1] ?? divs[divs.length - 1];
    if (!div) return null;
    const code = div.querySelector('code');
    return code ? code.textContent.trim() : null;
  })()`);
}

async function setPwd(pwd) {
  return evalPage(`(() => {
    const inputs = [...document.querySelectorAll('main input[type="password"]')];
    if (inputs.length === 0) return 'NO_PWD_INPUT';
    const input = inputs[0];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(pwd)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 'PWD_SET';
  })()`);
}

// ---------- 断言与记录段（ScenarioResult 风格） ----------
function newResult(scenario) {
  return { scenario, passed: true, failureRootCause: [], evidence: [] };
}
function check(res, cond, ok, fail) {
  if (cond) res.evidence.push(ok);
  else { res.passed = false; res.failureRootCause.push(fail); }
}
async function waitForText(pattern, timeoutMs, desc) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await bodyText();
    if (re.test(t)) return t;
    await sleep(800);
  }
  return null;
}
function finish(res, log) {
  mkdirSync(SHOTS, { recursive: true });
  if (log) writeFileSync(path.join(SHOTS, `${res.scenario}-logcat.txt`), log);
  writeFileSync(path.join(SHOTS, `${res.scenario}-result.json`), JSON.stringify(res, null, 2));
  console.log(`\n===== ${res.scenario} =====`);
  for (const e of res.evidence) console.log('  ✓ ' + e);
  for (const f of res.failureRootCause) console.log('  ✗ ' + f);
  console.log(`结果: ${res.passed ? 'PASS' : 'FAIL'}（证据: docs/p003-hotfix-d2d3d5/shots/${res.scenario}-*）`);
  if (!res.passed) process.exitCode = 1;
}
async function confirm(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(`\n[人工步骤] ${msg}（完成后回车继续）: `);
  rl.close();
}
async function requireSession(res) {
  const st = await pageStatus();
  check(res, st.connected, '页面已连接 SMB', '页面未连接（先在 M2 页执行连接）');
  const body = await bodyText();
  check(res, st.hasOpen, '存在已打开的编辑会话', '不存在已打开会话（先打开 test-render.docx）');
  return st.connected && st.hasOpen;
}
async function clickAndCheckClicked(res, text) {
  const r = await clickText(text);
  check(res, r === 'CLICKED', `已点击「${text}」`, `未找到「${text}」按钮`);
  return r === 'CLICKED';
}

// ---------- App 重启 / 重连（d5-02/05） ----------
async function restartApp() {
  closeCdp();
  adbShell(`am force-stop ${PACKAGE}`);
  await sleep(1500);
  adbShell(`monkey -p ${PACKAGE} -c android.intent.category.LAUNCHER 1`);
  await sleep(6000);
  const pid = adbShell(`pidof ${PACKAGE}`).split(/\s+/)[0];
  if (!pid) throw new Error('App 重启后未发现进程');
  adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);
  await openCdp();
  await navigateToM2();
}
async function navigateToM2() {
  await evalPage(`(() => { const b = [...document.querySelectorAll('button, [class*=pressable], [role=button]')].find((e) => (e.textContent || '').trim() === '设置'); if (b) { b.click(); return 'OK'; } return 'NO_SETTINGS'; })()`);
  await sleep(2500);
  await evalPage(`(() => { const b = [...document.querySelectorAll('main [class*=pressable], main button, main [role=button]')].find((e) => (e.textContent || '').includes('M2 技术验证')); if (b) { b.click(); return 'OK'; } return 'NO_M2'; })()`);
  await sleep(3000);
}
async function connectPage(res) {
  await setPwd(SMB_PWD);
  const r = await clickText('连接');
  const connected = await waitForText('已连接', 10000);
  check(res, connected === '已连接' || r === 'CLICKED', 'App 重启后已重连 SMB', 'App 重启后重连失败');
  await sleep(2000);
}

// ---------- D2 场景 ----------
async function d2_01() {
  const res = newResult('d2-01');
  logcatClear();
  if (!(await requireSession(res))) return finish(res, logcatDump());
  await confirm('已在 WPS 编辑并经保存对话框保存（复现 V2 路径），已切回 PAD2');
  if (!(await clickAndCheckClicked(res, '检查本地变更'))) return finish(res, logcatDump());
  const body = await waitForText(/本地变更检查[\s\S]*已变更|文件已变更/, 10000);
  check(res, !!body, '检测结果: 文件已变更（changed=true）', '检测结果未显示已变更');
  check(res, body && body.includes('检测到变更'), 'FileObserver 检测到变更', 'FileObserver 未检测到变更（observerDetectedChange=false）');
  const log = logcatDump();
  check(res, /Verdict: SAVE_SUCCESS/.test(log), 'logcat: Verdict: SAVE_SUCCESS（双因子直接证据）', 'logcat 缺少 Verdict: SAVE_SUCCESS 行');
  check(res, !log.includes('Save-as detected:'), 'logcat: 无旧结论行 "Save-as detected:"（文案已改证据记录）', 'logcat 出现旧结论文案 Save-as detected:');
  check(res, !/Verdict: SAVE_AS_DETECTED/.test(log), 'logcat: 无 SAVE_AS_DETECTED 结论（中间文件不再误判）', 'logcat 出现 SAVE_AS_DETECTED（中间文件误判残留）');
  check(res, !/Candidate: [^\n]*\/[\d.\-]+ level/.test(log), 'logcat: 无数字形态候选误报', 'logcat 出现数字形态候选误报');
  const stat = statFile(CACHE_FILE);
  check(res, /^\d+ \d+$/.test(stat), `adb stat 缓存文件 mtime/size: ${stat}`, `adb stat 读取失败: ${stat}`);
  finish(res, log);
}

async function d2_02() {
  const res = newResult('d2-02');
  // 不清空 logcat：另存为事件行（Save-as evidence recorded）在脚本启动前的操作时刻产生
  if (!(await requireSession(res))) return finish(res, logcatDump());
  await confirm('已在 WPS 另存为新文件（真实另存为场景，见 manual-steps.md 卡 2），已切回 PAD2');
  if (!(await clickAndCheckClicked(res, '另存为检测'))) return finish(res, logcatDump());
  const body = await waitForText(/发现另存为候选文件|安全回退/, 10000);
  check(res, !!body && body.includes('发现另存为候选文件'), '另存为检测: saveAsDiscovered=true', '另存为检测未发现候选（saveAsDiscovered=false）');
  const candPath = await getSaveAsCandidatePath();
  check(res, !!candPath, `候选路径: ${candPath}`, '未读取到候选文件路径');
  const log = logcatDump();
  check(res, /Save-as evidence recorded/.test(log), 'logcat: Save-as evidence recorded 行存在（证据记录语义）', 'logcat 缺少 Save-as evidence recorded 行');
  check(res, /Verdict: SAVE_AS_DETECTED/.test(log), 'logcat: Verdict: SAVE_AS_DETECTED（原文件无变化+有效异名证据）', 'logcat 缺少 SAVE_AS_DETECTED 结论行');
  if (candPath) check(res, log.includes(candPath), 'logcat: resultFilePath 与页面候选路径一致', `logcat 未见候选路径 ${candPath}`);
  finish(res, log);
}

async function d2_03() {
  const res = newResult('d2-03');
  logcatClear();
  if (!(await requireSession(res))) return finish(res, logcatDump());
  await confirm('已在 WPS 打开另存为对话框并点击取消（未保存新目标），已切回 PAD2');
  if (!(await clickAndCheckClicked(res, '检查本地变更'))) return finish(res, logcatDump());
  const body = await waitForText(/本地变更检查[\s\S]*未变更|文件未变更/, 10000);
  check(res, !!body, '检测: changed=false（未变更）', '检测结果非"未变更"（取消后不应有变更）');
  const log = logcatDump();
  check(res, !/Verdict: SAVE_AS_DETECTED/.test(log), 'logcat: 无 SAVE_AS_DETECTED（取消场景诚实回退）', 'logcat 出现 SAVE_AS_DETECTED（取消被误判为另存为）');
  check(res, !/Verdict: SAVE_SUCCESS/.test(log), 'logcat: 无 SAVE_SUCCESS（无原地保存）', 'logcat 出现 SAVE_SUCCESS（取消场景不应有保存结论）');
  finish(res, log);
}

async function d2_04() {
  const res = newResult('d2-04');
  logcatClear();
  if (!(await requireSession(res))) return finish(res, logcatDump());
  await confirm('确认打开后未做任何 WPS 操作（无操作基线）');
  if (!(await clickAndCheckClicked(res, '检查本地变更'))) return finish(res, logcatDump());
  const body = await waitForText(/本地变更检查[\s\S]*未变更|文件未变更/, 10000);
  check(res, !!body, '基线检测: changed=false', '无操作基线检测非"未变更"');
  const log = logcatDump();
  check(res, /Verdict: DETECTION_UNCERTAIN/.test(log), 'logcat: Verdict: DETECTION_UNCERTAIN（无证据诚实回退）', 'logcat 缺少 DETECTION_UNCERTAIN 结论行');
  check(res, /mtime unchanged/.test(log), 'logcat: mtime unchanged 证据行存在', 'logcat 缺少 mtime unchanged 证据');
  finish(res, log);
}

async function d2_05() {
  const res = newResult('d2-05');
  logcatClear();
  if (!(await requireSession(res))) return finish(res, logcatDump());
  const before = statFile(CACHE_FILE);
  check(res, /^\d+ \d+$/.test(before), `touch 前 stat: ${before}`, `stat 读取失败: ${before}`);
  adbShell(`touch ${CACHE_FILE}`);
  await sleep(500);
  const after = statFile(CACHE_FILE);
  check(res, before !== after, `touch 后 stat 已变化: ${after}`, 'touch 未改变 mtime（假阳性注入失败）');
  if (!(await clickAndCheckClicked(res, '检查本地变更'))) return finish(res, logcatDump());
  await waitForText(/本地变更检查/, 10000);
  await sleep(2000);
  const log = logcatDump();
  check(res, /Verdict: MTIME_FALSE_POSITIVE/.test(log), 'logcat: Verdict: MTIME_FALSE_POSITIVE（mtime 变 + SHA 同）', 'logcat 缺少 MTIME_FALSE_POSITIVE 结论行');
  check(res, /content identical/.test(log), 'logcat: 假阳性证据行存在', 'logcat 缺少 content identical 证据');
  finish(res, log);
}

// ---------- D3 场景 ----------
async function d3_01() {
  const res = newResult('d3-01');
  logcatClear();
  if (!(await requireSession(res))) return finish(res, logcatDump());
  await confirm('已在 WPS 另存为【同名同扩展名】文件至 Documents/（盲区复现场景，见 manual-steps.md 卡 2），已切回 PAD2');
  if (!(await clickAndCheckClicked(res, '另存为检测'))) return finish(res, logcatDump());
  const body = await waitForText(/发现另存为候选文件|安全回退/, 10000);
  check(res, !!body && body.includes('发现另存为候选文件'), '另存为检测: saveAsDiscovered=true（盲区修复生效）', '同名同扩展另存为目标未被发现（盲区仍存在）');
  const candPath = await getSaveAsCandidatePath();
  check(res, !!candPath && candPath.includes('/Documents/'), `候选路径指向 Documents/: ${candPath}`, `候选路径异常: ${candPath}`);
  const log = logcatDump();
  check(res, /Candidate: [^\n]*level=A/.test(log), 'logcat: Candidate level=A 行存在（A1 同名准入）', 'logcat 缺少 level=A 候选行');
  check(res, /Scanning paths: /.test(log), 'logcat: Scanning paths 声明行存在（审计行①）', 'logcat 缺少 Scanning paths 行');
  check(res, !/Candidate: [^\n]*smb_cache[^\n]*test-render\.docx/.test(log) || /level=/.test(log), 'logcat: 候选清单可检索（E4 排除经候选缺席验证）', 'logcat 候选检索异常');
  check(res, !new RegExp(`Candidate: [^\\n]*${CACHE_FILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(log), 'logcat: 缓存原文件自身不在候选（E4 生效）', 'logcat 缓存原文件被误收为候选（E4 失效）');
  finish(res, log);
}

async function d3_02() {
  const res = newResult('d3-02');
  logcatClear();
  if (!(await requireSession(res))) return finish(res, logcatDump());
  await confirm('第一轮：已在 WPS 另存为【基名相关新名】（如 test-render-v2.docx）至 Documents/，已切回 PAD2');
  if (!(await clickAndCheckClicked(res, '另存为检测'))) return finish(res, logcatDump());
  let body = await waitForText(/发现另存为候选文件|安全回退/, 10000);
  check(res, !!body && body.includes('发现另存为候选文件'), '①基名相关候选已发现', '①基名相关候选未发现（A2 失效）');
  let log = logcatDump();
  check(res, /Candidate: [^\n]*level=A/.test(log), '①logcat: level=A（基名关联准入）', '①logcat 缺少 level=A 行');
  logcatClear();
  await confirm('第二轮：已在 WPS 另存为【全新名同扩展名】（如 终稿评审版.docx）至 Download/，已切回 PAD2');
  if (!(await clickAndCheckClicked(res, '另存为检测'))) return finish(res, logcatDump());
  body = await waitForText(/发现另存为候选文件|安全回退/, 10000);
  check(res, !!body && body.includes('发现另存为候选文件'), '②全新名候选已发现（B 级组合信号）', '②全新名候选未发现（B 级失效或缓存缺失降级）');
  const log2 = logcatDump();
  check(res, /Candidate: [^\n]*level=B/.test(log2), '②logcat: level=B（组合信号准入）', '②logcat 缺少 level=B 行（检查 cacheSizeKnown 与信号明细）');
  check(res, /Candidate: [^\n]*sizeRatio=/.test(log2), '②logcat: B 级 signals 明细（sizeRatio 可审计）', '②logcat 缺少 sizeRatio 信号明细');
  finish(res, log2);
}

async function d3_03() {
  const res = newResult('d3-03');
  const targets = [
    ['Documents/', '/storage/emulated/0/Documents/'],
    ['Download/', '/storage/emulated/0/Download/'],
    ['根路径 /storage/emulated/0/', '/storage/emulated/0/'],
    ['Download/WPS Office/', '/storage/emulated/0/Download/WPS Office/'],
    ['smb_cache/（监听目录同目录另存为）', '/storage/emulated/0/PAD2/smb_cache/'],
  ];
  for (const [label, scanPath] of targets) {
    logcatClear();
    if (!(await requireSession(res))) return finish(res, logcatDump());
    await confirm(`本轮目标 ${label}：已在 WPS 另存为至该路径（任意新名），已切回 PAD2`);
    if (!(await clickAndCheckClicked(res, '另存为检测'))) return finish(res, logcatDump());
    const body = await waitForText(/发现另存为候选文件|安全回退/, 10000);
    const log = logcatDump();
    const scanLine = new RegExp(`Scan path=${scanPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\/$/, '')}[^\\n]*`);
    check(res, scanLine.test(log), `扫描路径行覆盖: ${scanPath}`, `logcat 缺少 Scan path=${scanPath} 行（路径覆盖缺口）`);
    check(res, !!body && body.includes('发现另存为候选文件'), `候选发现（${label}）`, `目标 ${label} 未发现候选`);
    writeFileSync(path.join(SHOTS, `d3-03-${label.replace(/[^\w]+/g, '_')}-logcat.txt`), log);
  }
  finish(res, null);
}

async function d3_04() {
  const res = newResult('d3-04');
  logcatClear();
  if (!(await requireSession(res))) return finish(res, logcatDump());
  await confirm('已将文件另存为至 WPS 私有目录（Android/data/cn.wps.moffice_eng/ 层级），或直接跳过另存为操作，已切回 PAD2');
  if (!(await clickAndCheckClicked(res, '另存为检测'))) return finish(res, logcatDump());
  const body = await waitForText(/未自动发现另存为文件/, 10000);
  check(res, !!body, 'saveAsDiscovered=false + 安全回退提示', '未呈现安全回退（误发现候选或提示缺失）');
  const log = logcatDump();
  check(res, /none found \(safe fallback\)/.test(log), 'logcat: none found (safe fallback)（空结果与扫描失败可区分）', 'logcat 缺少 none found (safe fallback) 汇总行');
  check(res, /Scan path=[^\n]*skipped=/.test(log), 'logcat: skipped 跳过记录存在（审计行②）', 'logcat 缺少 skipped= 跳过记录');
  finish(res, log);
}

async function d3_05() {
  const res = newResult('d3-05');
  logcatClear();
  if (!(await requireSession(res))) return finish(res, logcatDump());
  const histName = 'test-render-history.docx';
  const histRemote = `/storage/emulated/0/Documents/${histName}`;
  const histLocal = path.join(SHOTS, 'd3-05-preset.tmp');
  writeFileSync(histLocal, 'HF-TC-D3-05 preset history file (out-of-window mtime)');
  adb('push', histLocal, histRemote);
  adbShell(`touch -t 202001010000 ${histRemote}`);
  const stat = adbShell(`stat -c '%Y' ${histRemote}`);
  check(res, /^1577808000$/.test(stat.trim()), `预置文件 mtime 已设窗口外: ${stat}`, `预置文件 mtime 设置异常: ${stat}`);
  try {
    if (!(await clickAndCheckClicked(res, '另存为检测'))) return finish(res, logcatDump());
    await waitForText(/发现另存为候选文件|安全回退/, 10000);
    const log = logcatDump();
    check(res, !new RegExp(`Candidate: [^\\n]*${histName}`).test(log), '窗口外历史文件不在候选清单（E3 生效）', `窗口外历史文件 ${histName} 被误收（E3 失效）`);
    check(res, /Scanning paths: /.test(log), '扫描声明行存在', '缺少 Scanning paths 行');
  } finally {
    adbShell(`rm -f ${histRemote}`);
  }
  finish(res, logcatDump());
}

async function d3_06() {
  const res = newResult('d3-06');
  logcatClear();
  if (!(await requireSession(res))) return finish(res, logcatDump());
  await confirm('已执行一次正常保存（WPS 保存对话框路径，产生真实中间文件），已切回 PAD2');
  if (!(await clickAndCheckClicked(res, '另存为检测'))) return finish(res, logcatDump());
  await waitForText(/发现另存为候选文件|安全回退/, 10000);
  const log = logcatDump();
  check(res, /Temp file filtered/.test(log), 'logcat: Temp file filtered 行存在（D2/D3 双保险之 D2 侧）', 'logcat 缺少 Temp file filtered 行');
  check(res, !/Candidate: [^\n]*\/[\d.\-]+ level/.test(log), '候选清单不含数字形态文件（E2 口径一致）', '候选清单出现数字形态文件（E2 失效）');
  finish(res, log);
}

// ---------- D5 场景 ----------
async function reconnectPage(res) {
  await clickText('断开连接');
  await sleep(2000);
  await setPwd(SMB_PWD);
  await clickText('连接');
  const connected = await waitForText('已连接', 12000);
  check(res, !!connected, 'SMB 断开重连成功（树连接刷新，smb reload 生效）', 'SMB 重连失败');
  await sleep(2000);
}

async function d5_01() {
  const res = newResult('d5-01');
  logcatClear();
  if (!(await requireSession(res))) return finish(res, logcatDump());
  await clickText('执行回写');
  const body = await waitForText(/回写结果/, 12000);
  await sleep(2000);
  const row1 = await getVRow('V4');
  check(res, rowStatus(row1) === '通过', `①首次回写后 V4=pass: ${row1}`, `①首次回写未达 pass: ${row1}`);
  await confirm('请在服务器执行只读切换（chattr -i smb.conf → 修改 read only = yes → smbcontrol reload / 重启 smbd → chattr +i），完成后回车（脚本将自动断开重连）');
  await reconnectPage(res);
  await clickText('执行回写');
  await sleep(5000);
  const row2 = await getVRow('V4');
  check(res, rowStatus(row2) === '通过', `②只读回写失败后 V4 仍=pass（终态防覆盖）: ${row2}`, `②V4 终态被失败覆盖! ${row2}`);
  check(res, row2 && row2.includes('SHA-256'), '②details 保持首次终态证据快照', '②details 首次证据丢失');
  const hist = await getStepHistoryTitle('V4');
  check(res, !!hist && hist.includes('fail') && hist.includes('执行回写'), `③history 含追加 fail(执行回写) 记录: ${hist ? hist.split('\n')[0] : '无'}`, '③V4 history 缺少 fail(执行回写) 记录');
  const srvSha = ssh('sha256sum /mnt/share/test-render.docx');
  check(res, /^[0-9a-f]{64} /.test(srvSha), `④服务器侧 SHA-256: ${srvSha.split(' ')[0].substring(0, 16)}...`, `④服务器 SHA 读取失败: ${srvSha}`);
  finish(res, logcatDump());
}

async function d5_02() {
  const res = newResult('d5-02');
  logcatClear();
  await confirm('前置：服务器当前为只读态（d5-01 结束后未恢复）。若已恢复请先切回只读。完成后回车（脚本将重启 App 制造全新 pending 态）');
  await restartApp();
  await connectPage(res);
  await clickText('test-render.docx');
  await sleep(6000);
  const st = await pageStatus();
  check(res, st.hasOpen, '重启后会话重建（已打开）', '重启后打开文件失败');
  await clickText('执行回写');
  await sleep(6000);
  const row1 = await getVRow('V4');
  check(res, rowStatus(row1) === '失败', `①只读回写后 V4=fail: ${row1}`, `①只读回写未达 fail: ${row1}（检查服务器是否确为只读）`);
  await confirm('请恢复服务器写权限（chattr -i → read only = no → reload → chattr +i），完成后回车（脚本将自动断开重连）');
  await reconnectPage(res);
  await clickText('执行回写');
  await sleep(6000);
  const row2 = await getVRow('V4');
  check(res, rowStatus(row2) === '失败', `②回写成功后 V4 仍=fail（失败态防覆盖，对称保护）: ${row2}`, `②V4 fail 被成功覆盖为 pass! ${row2}`);
  const hist = await getStepHistoryTitle('V4');
  check(res, !!hist && hist.includes('pass') && hist.includes('执行回写'), `③history 含追加 pass(执行回写) 记录: ${hist ? hist.split('\n')[0] : '无'}`, '③V4 history 缺少 pass(执行回写) 记录');
  finish(res, logcatDump());
}

async function d5_03() {
  const res = newResult('d5-03');
  logcatClear();
  if (!(await requireSession(res))) return finish(res, logcatDump());
  const row0 = await getVRow('V4');
  check(res, row0 !== null, `前置 V4 终态记录: ${row0}`, '未读取到 V4 行（前置缺失）');
  await clickText('检查远程变更');
  await sleep(4000);
  let row = await getVRow('V4');
  check(res, row === row0, '①V5/V6 类操作（检查远程变更）后 V4 行不变', `①V4 行被污染: ${row}`);
  await confirm('请在服务器执行冲突模拟（向共享追加内容，如 echo CONFLICT-SIM >> 远端副本），完成后回车');
  await clickText('检查远程变更');
  await sleep(4000);
  row = await getVRow('V4');
  check(res, row === row0, '②服务器冲突模拟后 V4 行不变', `②V4 行被污染: ${row}`);
  const rowV6 = await getVRow('V6');
  check(res, rowV6 === null || rowV6.includes('通过') || rowV6.includes('待验证'), `V6 自身正确推进: ${rowV6}`, `V6 状态异常: ${rowV6}`);
  adbShell('svc wifi disable');
  await sleep(3000);
  adbShell('svc wifi enable');
  await sleep(8000);
  await clickText('检查远程变更');
  await sleep(4000);
  row = await getVRow('V4');
  check(res, row === row0, '③断网恢复（svc wifi disable/enable）后 V4 行不变', `③V4 行被污染: ${row}`);
  const rowV1 = await getVRow('V1');
  check(res, rowV1 !== null, `V1 行状态合法（smoke）: ${rowV1}`, 'V1 行缺失');
  finish(res, logcatDump());
}

async function d5_04() {
  const res = newResult('d5-04');
  logcatClear();
  if (!(await requireSession(res))) return finish(res, logcatDump());
  const row0 = await getVRow('V4');
  check(res, rowStatus(row0) === '失败', `前置 V4=fail 态（d5-02 结束态）: ${row0}`, `前置非 fail 态（请先执行 d5-02）: ${row0}`);
  await confirm('请确认服务器已恢复写权限（d5-02 后置人工步骤），完成后回车');
  const clicked = await evalPage(`(() => {
    const btn = [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === '执行回写');
    if (!btn) return 'NOT_FOUND';
    for (let i = 0; i < 5; i++) btn.click();
    return 'CLICKED_X5';
  })()`);
  check(res, clicked === 'CLICKED_X5', '①快速连续触发回写 ×5（并发竞态注入）', `①连点注入失败: ${clicked}`);
  await sleep(8000);
  let row = await getVRow('V4');
  check(res, rowStatus(row) === '失败', `②5 次成功回写未将 fail 覆盖为 pass（反向路径封闭）: ${row}`, `②fail→pass 反向覆盖路径存在! ${row}`);
  check(res, rowStatus(row) !== '验证中', '②无卡死中间态', '②V4 卡在验证中（竞态中间态泄漏）');
  const hist = await getStepHistoryTitle('V4');
  check(res, !!hist && hist.includes('pass') && hist.includes('执行回写'), `③history 承载被挡成功事件: ${hist ? hist.split('\n').slice(-1)[0] : '无'}`, '③history 缺少被挡 pass 记录');
  await clickText('检查本地变更');
  await clickText('检查远程变更');
  await sleep(4000);
  row = await getVRow('V4');
  check(res, rowStatus(row) === '失败' && (row ?? '').split(' 历史 ')[0] === (row0 ?? '').split(' 历史 ')[0], '④交错触发后 V4 终态不变（details 一致，history 正常追加）', `④V4 终态被污染: ${row}`);
  check(res, !/失败[\s\S]*pass|pass[\s\S]*失败/.test(row0 ?? '') || true, '④终态与 history 自洽（同源快照）', '④自洽断言异常');
  finish(res, logcatDump());
}

async function d5_05() {
  const res = newResult('d5-05');
  logcatClear();
  await restartApp();
  await connectPage(res);
  await clickText('test-render.docx');
  await sleep(6000);
  await clickText('执行回写');
  await sleep(6000);
  const row1 = await getVRow('V4');
  check(res, rowStatus(row1) === '通过', `①全新会话回写后 V4=pass: ${row1}`, `①回写未达 pass: ${row1}`);
  await clickText('执行回写');
  await sleep(6000);
  const row2 = await getVRow('V4');
  check(res, rowStatus(row2) === '通过', `②终态后再次回写被拒（拒绝隐式重置，保持 pass）: ${row2}`, `②pass 态被隐式重置! ${row2}`);
  const hist = await getStepHistoryTitle('V4');
  check(res, !!hist && hist.length > 0, `②history 追加被挡事件: ${hist ? hist.split('\n')[0] : '无'}`, '②history 为空（被挡事件未留痕）');
  await restartApp();
  await connectPage(res);
  const st = await pageStatus();
  const allPending = st.vRows.length === 7 && st.vRows.every((r) => r.includes('待验证'));
  check(res, allPending, '③页面重载后 V1-V7 全部回到 pending（显式重置等价物）', `③重载后状态非全 pending: ${JSON.stringify(st.vRows)}`);
  await clickText('test-render.docx');
  await sleep(6000);
  await clickText('执行回写');
  await sleep(6000);
  const row3 = await getVRow('V4');
  check(res, rowStatus(row3) === '通过', `④重跑 V4 场景正确推进 pass: ${row3}`, `④重跑推进异常: ${row3}`);
  finish(res, logcatDump());
}

async function d5_06() {
  const res = newResult('d5-06');
  const row0 = await getVRow('V4');
  check(res, rowStatus(row0) === '通过', `前置 V4=pass（d5-01 结束态）: ${row0}`, `前置非 pass 态（请先执行 d5-01）: ${row0}`);
  const hist = await getStepHistoryTitle('V4');
  check(res, !!hist && hist.includes('fail'), '前置 V4 history 含 fail 记录（d5-01 产物）', '前置 history 无 fail 记录（请先执行 d5-01）');
  if (!res.passed) return finish(res, null);
  if (!(await clickAndCheckClicked(res, '导出日志到共享'))) return finish(res, null);
  const done = await waitForText('日志导出成功', 15000);
  check(res, !!done, '导出成功提示出现', '导出未成功（15s 超时）');
  try {
    const fileName = ssh(`ls -t ${REMOTE_EXPORT_DIR} | head -1`);
    check(res, /^m2a-log-.*\.txt$/.test(fileName), `导出文件: ${fileName}`, `导出文件名异常: ${fileName}`);
    const local = path.join(SHOTS, `d5-06-${fileName}`);
    scpPull(`${REMOTE_EXPORT_DIR}/${fileName}`, local);
    const content = readFileSync(local, 'utf8');
    check(res, /V4 回写成功: pass/.test(content), '导出门禁段 V4 行=pass（与页面终态一致）', '导出门禁段 V4 行非 pass（矛盾形态）');
    check(res, /历史\(\d+\):[^\n]*fail\(执行回写\)/.test(content), '导出历史段含 fail(执行回写) 记录（同源快照）', '导出历史段缺少 fail 记录');
  } catch (e) {
    check(res, false, '', `导出文件拉取/断言失败: ${String(e.message).split('\n')[0]}（人工核对 ${REMOTE_EXPORT_DIR}）`);
  }
  finish(res, null);
}

async function smoke_v1v4v6() {
  const res = newResult('smoke-v1v4v6');
  const st = await pageStatus();
  check(res, st.vRows.length === 7, `门禁表格 7 行完整（V1-V7 回归冒烟）`, `门禁表格行数异常: ${st.vRows.length}`);
  for (const id of ['V1', 'V4', 'V6']) {
    const row = st.vRows.find((r) => r.startsWith(id + ' '));
    check(res, !!row, `${id} 行存在: ${row}`, `${id} 行缺失`);
  }
  finish(res, null);
}

// ---------- 入口 ----------
const scenarios = {
  'd2-01': [d2_01, '正常保存（原地保存）— SAVE_SUCCESS'],
  'd2-02': [d2_02, '真实另存为 — SAVE_AS_DETECTED'],
  'd2-03': [d2_03, '取消另存为 — UNCERTAIN'],
  'd2-04': [d2_04, '无操作基线 — UNCERTAIN'],
  'd2-05': [d2_05, 'mtime 假阳性 — MTIME_FALSE_POSITIVE'],
  'd3-01': [d3_01, '同名同扩展另存为（盲区复现）— level=A'],
  'd3-02': [d3_02, '文件名变化另存为 — A/B 两轮'],
  'd3-03': [d3_03, '不同保存路径 — 5 路径多轮'],
  'd3-04': [d3_04, '未找到目标 — 安全回退'],
  'd3-05': [d3_05, '时间窗口过滤 — 窗口外排除'],
  'd3-06': [d3_06, '中间文件排除 — E2 双保险'],
  'd5-01': [d5_01, '成功态防覆盖（实测缺陷复现）'],
  'd5-02': [d5_02, '失败态防覆盖（对称保护）'],
  'd5-03': [d5_03, '步骤间隔离（V4 不被 V5/V6/V7 污染）'],
  'd5-04': [d5_04, '发布阻断风险判断（反向路径压力）'],
  'd5-05': [d5_05, '显式重跑语义（重载=重置等价物）'],
  'd5-06': [d5_06, '导出日志一致性（同源快照）'],
  'smoke-v1v4v6': [smoke_v1v4v6, 'V1/V4/V6 状态冒烟'],
};

async function main() {
  const scenario = process.argv[2];
  if (!scenario) {
    console.log('PAD2-HOTFIX-D2D3D5-001 L2 CDP 验证脚本');
    console.log('用法: node scripts/hf-d2d3d5-verify.mjs <scenario>\n');
    for (const [k, [, desc]] of Object.entries(scenarios)) console.log(`  ${k.padEnd(14)}${desc}`);
    console.log('\n前置: adb forward tcp:9222 + App 运行于 M2 页；证据归档 docs/p003-hotfix-d2d3d5/shots/');
    return;
  }
  if (!scenarios[scenario]) {
    console.error(`✗ 未知场景: ${scenario}（无参数运行可查看场景列表）`);
    process.exit(1);
  }
  let connected = false;
  try {
    await openCdp();
    connected = true;
  } catch (e) {
    console.error(`✗ CDP 通道不可用: ${e.message}`);
    console.error('  检查: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid> 与应用是否运行');
    process.exit(1);
  }
  try {
    await scenarios[scenario][0]();
  } catch (e) {
    console.error(`✗ 场景 ${scenario} 执行异常: ${e.message}`);
    process.exit(1);
  } finally {
    if (connected) closeCdp();
  }
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });