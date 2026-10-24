/**
 * TASK-S6-04-RC-VERIFY 补验：真断网恢复及重试（svc wifi disable/enable）
 * 场景：wifi 断 → 表单 guest 提交 → 网络类失败如实呈现 → wifi 恢复 → 重试 → 已连接
 * 判据：客户端状态采样 + 服务器端 ls 复核（连接事实）
 */
import { execFileSync } from 'node:child_process';

const ADB = 'C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';

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
  if (!m) throw new Error('DevTools socket 未出现');
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
function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();

  console.log('== OFF-1 断网下提交（guest 表单） ==');
  adbShell('svc wifi disable');
  await sleep(5000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  await setField('连接名称', 'S6-01-WinSrv');
  await setField('服务器地址', '192.168.2.247');
  await setField('共享名', 'soft');
  await setField('用户名', 'guest');
  await setField('密码', '');
  const t0 = Date.now();
  await clickEl('main button', '保存并连接');
  // 采样至失败终态（≤40s）
  let final = null; let finalText = '';
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const st = await evalPage(`(() => { const t = document.body.innerText; return JSON.stringify({ connecting: t.includes('正在连接'), connected: t.includes('已连接'), fail: (t.match(/连接失败：[^\\n]{0,40}/) || [null])[0] }); })()`);
    const v = JSON.parse(st);
    if (v.connected) { final = 'connected'; break; }
    if (v.fail) { final = 'fail'; finalText = v.fail; break; }
    await sleep(500);
  }
  assert(final === 'fail', `OFF-1.1 断网提交如实失败（${finalText}，${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  assert(!/用户名或密码/.test(finalText), 'OFF-1.2 网络类文案（非凭据类误判）');

  const retryOk = await evalPage(`(() => { const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent||'').includes('保存并连接')); return btn ? !btn.disabled : false; })()`);
  assert(retryOk, 'OFF-1.3 按钮恢复可重试');

  console.log('== OFF-2 网络恢复 → 重试 → 已连接 ==');
  adbShell('svc wifi enable');
  await sleep(20000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await clickEl('main button', '保存并连接');
  let final2 = null;
  const deadline2 = Date.now() + 35000;
  while (Date.now() < deadline2) {
    const st = await evalPage(`(() => { const t = document.body.innerText; return JSON.stringify({ connected: t.includes('已连接'), fail: t.includes('连接失败：') }); })()`);
    const v = JSON.parse(st);
    if (v.connected) { final2 = 'connected'; break; }
    if (v.fail && Date.now() - deadline2 > -5000) { final2 = 'fail'; break; }
    await sleep(500);
  }
  assert(final2 === 'connected', `OFF-2.1 恢复后重试连接成功（${final2}）`);
  // 服务器端复核：会话真实可用
  const lst = await evalPage(`(async () => { const BS = String.fromCharCode(92); try { const r = await window.Capacitor.Plugins.SmbPlugin.listDirectory({ path: 'AutoFileBackup' + BS + 'PAD2-S6-01' }); return 'OK:' + (r.files || []).length; } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 60); } })()`, true);
  assert(String(lst).startsWith('OK'), `OFF-2.2 会话真实可用（服务器目录 ${lst}）`);
  console.log('\n===== S6-04-RC 断网恢复补验通过 =====');
  adbShell('svc power stayon false');
  ws.close();
}
main().catch((e) => { console.error(`✗ ${e.message}`); try { adbShell('svc wifi enable'); adbShell('svc power stayon false'); } catch {} process.exit(1); });