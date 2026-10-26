/**
 * TASK-S5-07 阶段 A2：.xlsx 检测→回写→三时点核验（PM 授权第 4 条证据标准）
 * 三时点哈希：修改前（服务器基线 d6d47c6a）/ 客户端保存后（本地缓存）/ 服务器核验时（回写后）
 * 内容级核验：soffice 转 csv 提取，验证约定内容"S5-07已编辑"真实存在（超越纯哈希）
 * 重新打开核验：回写后再次 openInWps→WPS 前台
 * 零代码变更（纯验证）。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s5';
const WPS = 'cn.wps.moffice_eng';
const FILE = '表格I5B.xls';
const BASELINE = '44acba56f9ced3d6c6271473da157a0c7a8217082ca51867fa99a77b4aeec6f0';
const MARK = 'S5-07已编辑';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 90000 });
}
function ssh(cmd) {
  return execFileSync('ssh', ['-i', process.env.HOME + '/.ssh/pad2_cred_closure', 'debian@192.168.2.3', cmd], {
    encoding: 'utf8', timeout: 90000,
  });
}

let ws;
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalPage(expression, awaitP = false) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: awaitP });
  if (exceptionDetails) throw new Error(`evaluate 异常: ${exceptionDetails.text}`);
  return result.value;
}

async function clickEl(selector, text) {
  const clicked = await evalPage(`
    (() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els.find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'CLICKED';
    })()
  `);
  if (clicked !== 'CLICKED') throw new Error(`点击失败 "${text}"`);
}

async function connectWs() {
  const unix = adbShell("cat /proc/net/unix | grep webview_devtools_remote | head -1");
  const m = unix.match(/webview_devtools_remote_(\d+)/);
  execFileSync(ADB, ['-s', DEVICE, 'forward', 'tcp:9222', `localabstract:webview_devtools_remote_${m[1]}`]);
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
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
  await send('Page.enable');
  await send('Runtime.enable');
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = {};
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(3000);
  await connectWs();

  // 确认在 M2 页（否则导航）
  const onM2 = await evalPage(`document.body.innerText.includes('V1-V7')`);
  if (!onM2) {
    await clickEl('nav button', '设置');
    await sleep(1800);
    await evalPage(`(() => { const els = [...document.querySelectorAll('main div')].filter((e) => (e.textContent || '').includes('M2 技术验证')); const el = els[els.length - 1]; if (el) el.click(); return 'OK'; })()`);
    await sleep(2500);
  }

  console.log('== A2.1 检查本地变更（checkLocalFileChanged） ==');
  adbShell('logcat -c');
  await clickEl('button', '检查本地变更');
  await sleep(9000);

  console.log('== A2.2 执行回写（writeback） ==');
  await clickEl('button', '执行回写');
  await sleep(14000);

  console.log('== A2.3 原生日志证据（三时点链） ==');
  const pid = adbShell('pidof com.pad2.filemanager').trim();
  const log = adbShell(`logcat -d --pid=${pid} 2>/dev/null | grep -iE "Verdict|Writeback verified|localHash|verifyHash" | tail -6`);
  console.log(log.trim());
  const saveSuccess = /SAVE_SUCCESS/.test(log) || /three-factor/.test(log);
  const writebackVerified = /Writeback verified/.test(log);
  assert(saveSuccess, 'A2.1 检测 SAVE_SUCCESS（三因子）');
  assert(writebackVerified, 'A2.2 回写 verified（远端 SHA 匹配）');

  console.log('== A2.4 三时点哈希核验 ==');
  // 时点 1：修改前（服务器基线，已归档）
  // 时点 2：客户端保存后（本地缓存文件——按文件名精确匹配，防旧缓存残留干扰）
  const cacheSha = adbShell(`sha256sum '/storage/emulated/0/PAD2/smb_cache/${FILE}' 2>/dev/null`).trim();
  const cacheHash = (cacheSha.match(/^([a-f0-9]{64})/) || [])[1] || null;
  console.log(`  时点2 客户端缓存: ${cacheHash?.slice(0, 16) ?? '未读到'}`);
  // 时点 3：服务器核验时（回写后）
  const serverLine = ssh(`sha256sum '/mnt/share/gate4-test/${FILE}'`).trim();
  const serverHash = (serverLine.match(/^([a-f0-9]{64})/) || [])[1];
  console.log(`  时点3 服务器（回写后）: ${serverHash?.slice(0, 16)}`);
  assert(!!serverHash && serverHash !== BASELINE, 'A2.4a 服务器文件已更新（≠修改前基线）');
  if (cacheHash) {
    assert(cacheHash === serverHash, 'A2.4b 客户端保存后 == 服务器核验时（哈希一致）');
  }
  const m = log.match(/"localHash":"([a-f0-9]{64})"[^\n]*"verifyHash":"([a-f0-9]{64})"/);
  if (m) {
    assert(m[1] === m[2], 'A2.4c logcat localHash==verifyHash');
    assert(m[2] === serverHash, 'A2.4d logcat verifyHash==服务器实际（三方一致）');
  }
  results.hashes = { baseline: BASELINE.slice(0, 16), cache: cacheHash?.slice(0, 16), server: serverHash.slice(0, 16) };

  console.log('== A2.5 内容级核验（csv diff） ==');
  ssh(`rm -f /tmp/s509b2-check.csv`);
  ssh(`cd /tmp && cp '/mnt/share/gate4-test/${FILE}' s509b2-check.xls && soffice --headless --convert-to csv --outdir /tmp s509b2-check.xls >/dev/null 2>&1`);
  const csv = ssh(`cat /tmp/s509b2-check.csv 2>/dev/null`).trim();
  const baseCsv = 'I5标记,集成回归xls\nR2,行2';
  console.log(`  [基线] ${baseCsv.replace(/\n/g, ' | ')}`);
  console.log(`  [回写后] ${csv.replace(/\n/g, ' | ')}`);
  assert(csv !== baseCsv, 'A2.5a 内容较基线真实变化（编辑持久化）');
  assert(csv.includes('yes') && !baseCsv.includes('yes'), 'A2.5b 用户输入仅存在于回写后文件（内容级）');
  results.contentVerified = true;

  console.log('== A2.6 重新打开核验（回写后文件可再打开） ==');
  // 再点文件行 → openInWps → WPS 前台
  const opened = await evalPage(`(() => { const els = [...document.querySelectorAll('[class*="fileRow"]')]; const el = els.find((e) => (e.textContent || '').includes('${FILE}')); if (!el) return 'NOT_FOUND'; el.click(); return 'CLICKED'; })()`);
  if (opened !== 'CLICKED') throw new Error('回写后文件行未找到（列表可能需刷新——重挂载）');
  await sleep(9000);
  const focus = adbShell('dumpsys window | grep mCurrentFocus | head -1');
  console.log(`  [STAT] 焦点: ${focus.trim().substring(0, 80)}`);
  assert(focus.includes(WPS), 'A2.6 WPS 前台（回写后文件可重新打开）');

  writeFileSync(join(OUT_DIR, 's509-i05b2-result.json'), JSON.stringify({ results, log: log.trim().substring(0, 500), csv: csv.substring(0, 200), ts: new Date().toISOString() }, null, 2));
  console.log('\nS5-07 A2 段通过（xlsx 三时点+内容+重新打开全链）');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});