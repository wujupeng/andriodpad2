/**
 * TASK-S6-05-FIX T6 专项复验：凭据零泄露（C05 正确采样模式）
 * 模式：logcat -c 清空 → 凭据动作 → 立即扫描（S6-05 确立的唯一可靠采样——修复前此模式命中明文）
 * 场景：①pad2gate3 真实凭据表单连接（修复前泄露的同款动作）②guest 空密码连接 ③完整测试窗口扫描
 * 断言：全 logcat（V/D/I/W/E 全级）零 password echo+零明文+桥日志条目数登记
 * 附：release 构建下 CDP 通道核验（webContentsDebuggingEnabled:true 生效）
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s6';
const PW = process.env.SMB_PW || 'Gate3-Test-2026';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 120000 });
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
async function connectWs() {
  let m = null;
  for (let i = 0; i < 15; i++) {
    const unix = adbShell("cat /proc/net/unix 2>/dev/null | grep webview_devtools_remote | head -1");
    m = String(unix).match(/webview_devtools_remote_(\d+)/);
    if (m) break;
    await sleep(2000);
  }
  if (!m) throw new Error('DevTools socket 未出现（webContentsDebuggingEnabled 未生效？）');
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
  await send('Runtime.enable');
}
async function clickEl(selector, text) {
  const c = await evalPage(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(selector)})]; const el = els.find((e) => (e.textContent || '').includes(${JSON.stringify(text)})); if (!el) return 'NOT_FOUND'; el.click(); return 'CLICKED'; })()`);
  if (c !== 'CLICKED') throw new Error(`点击失败 "${text}"`);
}
async function setField(label, value) {
  const ok = await evalPage(`(() => { const labels = [...document.querySelectorAll('label')]; const label = labels.find((l) => (l.textContent || '').includes(${JSON.stringify(label)})); if (!label) return 'L'; const input = label.htmlFor ? document.getElementById(label.htmlFor) : null; if (!input) return 'I'; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); return 'SET'; })()`);
  if (ok !== 'SET') throw new Error(`字段失败 "${label}"`);
}
async function clickSaveAndConnect(maxRetry = 3) {
  for (let i = 0; i < maxRetry; i++) {
    await evalPage(`(() => { const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent||'').includes('保存并连接')); if (btn) btn.click(); return 'OK'; })()`);
    await sleep(400);
    const v = JSON.parse(await evalPage(`(() => { const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent||'').includes('保存并连接')); const t = document.body.innerText; return JSON.stringify({ d: btn ? btn.disabled : null, c: t.includes('正在连接'), k: t.includes('已连接'), f: t.includes('连接失败：') }); })()`) || '{}');
    if (v.d || v.c || v.k || v.f) return i + 1;
  }
  return 0;
}
/** logcat 全文扫描（pid 过滤） */
function scanLog() {
  const pid = adbShell('pidof com.pad2.filemanager').trim();
  const log = String(adbShell(`logcat -d --pid=${pid} 2>/dev/null`));
  return {
    total: log.length,
    bridgeLines: (log.match(/V Capacitor/g) || []).length,
    pwEcho: (log.match(/"password"/g) || []).length,
    methodData: (log.match(/methodData/g) || []).length,
    plaintext: log.includes(PW) ? 1 : 0,
    plaintextPartial: log.includes('Gate3') ? 1 : 0,
  };
}
function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};

async function main() {
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');

  console.log('== S0. release 构建 CDP 通道核验 ==');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();
  console.log('  PASS S0.1 release 构建下 CDP 可用（webContentsDebuggingEnabled:true 生效）');
  results.cdpOnRelease = true;

  console.log('== S1. 真实凭据连接（修复前泄露同款动作）→ logcat 零泄露 ==');
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  await setField('连接名称', 'S6-05-Cred');
  await setField('服务器地址', '192.168.2.3');
  await setField('共享名', 'share');
  await setField('用户名', 'pad2gate3');
  await setField('密码', PW);
  adbShell('logcat -c');
  const ck = await clickSaveAndConnect();
  if (ck === 0) throw new Error('S1 提交未触发');
  // 采样至终态
  let final = null;
  const dl = Date.now() + 30000;
  while (Date.now() < dl) {
    const v = JSON.parse(await evalPage(`(() => { const t = document.body.innerText; return JSON.stringify({ k: t.includes('已连接'), f: t.includes('连接失败：') }); })()`) || '{}');
    if (v.k) { final = 'connected'; break; }
    if (v.f) { final = 'fail'; break; }
    await sleep(400);
  }
  assert(final === 'connected', `S1.1 真实凭据连接成功（${final}——动作有效才有扫描意义）`);
  // 立即扫描（正确采样）
  const s1 = scanLog();
  assert(s1.methodData === 0, `S1.2 logcat 零 methodData echo（桥日志关闭——实际 ${s1.methodData}，修复前命中）`);
  assert(s1.pwEcho === 0, `S1.3 logcat 零 "password" 字段出现（实际 ${s1.pwEcho}）`);
  assert(s1.plaintext === 0, 'S1.4 logcat 零明文密码（全级扫描）');
  assert(s1.plaintextPartial === 0, 'S1.5 logcat 零部分匹配（前缀泄露检查）');
  results.S1 = s1;

  console.log('== S2. 完整测试窗口扫描（浏览+多操作后全量） ==');
  // 浏览目录（触发更多插件调用：listDirectory 等）
  await evalPage(`(async () => { const BS = String.fromCharCode(92); try { await window.Capacitor.Plugins.SmbPlugin.listDirectory({ path: '' }); return 'OK'; } catch (e) { return 'ERR'; } })()`, true);
  await sleep(1500);
  const s2 = scanLog();
  assert(s2.methodData === 0, `S2.1 完整窗口零 methodData echo（${s2.bridgeLines} 条 V Capacitor 桥日志——全部关闭态核验）`);
  assert(s2.plaintext === 0 && s2.plaintextPartial === 0, 'S2.2 完整窗口零明文/零部分匹配');
  results.S2 = s2;

  console.log('== S3. guest 空密码连接（247）零泄露复核 ==');
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1000);
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  await setField('连接名称', 'S6-05-Guest');
  await setField('服务器地址', '192.168.2.247');
  await setField('共享名', 'soft');
  await setField('用户名', 'guest');
  await setField('密码', '');
  adbShell('logcat -c');
  const ck2 = await clickSaveAndConnect();
  if (ck2 === 0) throw new Error('S3 提交未触发');
  let final2 = null;
  const dl2 = Date.now() + 30000;
  while (Date.now() < dl2) {
    const v = JSON.parse(await evalPage(`(() => { const t = document.body.innerText; return JSON.stringify({ k: t.includes('已连接'), f: t.includes('连接失败：') }); })()`) || '{}');
    if (v.k) { final2 = 'connected'; break; }
    if (v.f) { final2 = 'fail'; break; }
    await sleep(400);
  }
  assert(final2 === 'connected', `S3.1 guest 空密码连接成功（${final2}——fix01 修复在 release 构建下保持）`);
  const s3 = scanLog();
  assert(s3.methodData === 0 && s3.pwEcho === 0, `S3.2 guest 连接零 echo（methodData=${s3.methodData} password=${s3.pwEcho}）`);
  results.S3 = s3;

  console.log('== S4. 测试卡清理 ==');
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1000);
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  for (const n of ['S6-05-Cred', 'S6-05-Guest']) {
    try {
      const menu = await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('${n}')); const btn = rows[0]?.querySelector('button[aria-label^="更多操作"]'); if (!btn) return 'NF'; btn.click(); return 'OK'; })()`);
      if (menu !== 'OK') continue;
      await sleep(900);
      await evalPage(`(() => { const rows = [...document.querySelectorAll('[role="dialog"] div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('删除')); if (!rows.length) return 'NF'; rows[0].click(); return 'OK'; })()`);
      await sleep(1100);
      await clickEl('[role="alertdialog"] button', '删除');
      await sleep(2200);
      console.log(`  [CLEAN] 已删除 ${n}`);
    } catch (e) { console.log(`  [CLEAN] ${n} 跳过：${e.message.substring(0, 40)}`); }
  }

  results.allPass = true;
  results.apk = 'd6d75d2028bae7600ecf388ea8602c0001d9d36108e93d14617a71d823f099e8';
  writeFileSync(join(OUT_DIR, 's605-fix-c05-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\n===== TASK-S6-05-FIX T6 专项复验全部通过（零泄露） =====');
  adbShell('svc power stayon false');
  ws.close();
}
main().catch((e) => {
  results.allPass = false;
  results.error = e.message;
  try { writeFileSync(join(OUT_DIR, 's605-fix-c05-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2)); } catch {}
  console.error(`✗ ${e.message}`);
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});