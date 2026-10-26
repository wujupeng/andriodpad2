/** S6-01 WS-01 定性：UI 表单路径连接 247 guest（干净冷启动+30s 等待+多状态采样） */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s6';

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
async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT_DIR, name), Buffer.from(data, 'base64'));
  console.log(`  [SHOT] ${name}`);
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
async function setField(label, value) {
  const ok = await evalPage(`
    (() => {
      const labels = [...document.querySelectorAll('label')];
      const label = labels.find((l) => (l.textContent || '').includes(${JSON.stringify(label)}));
      if (!label) return 'L';
      const input = label.htmlFor ? document.getElementById(label.htmlFor) : null;
      if (!input) return 'I';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'SET';
    })()
  `);
  if (ok !== 'SET') throw new Error(`字段失败 "${label}"`);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();

  console.log('== WS-01 UI 表单路径（干净状态） ==');
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  await setField('连接名称', 'S6-01-WinSrv-B');
  await setField('服务器地址', '192.168.2.247');
  await setField('共享名', 'soft');
  await setField('用户名', 'guest');
  await setField('密码', '');
  await clickEl('main button', '保存并连接');
  // 30s 窗口多点采样
  for (const wait of [5000, 10000, 20000, 30000]) {
    await sleep(wait === 5000 ? 5000 : wait - (wait === 10000 ? 5000 : wait === 20000 ? 10000 : 10000));
    const st = await evalPage(`(() => { const t = document.body.innerText; return JSON.stringify({ connected: t.includes('已连接'), connecting: t.includes('正在连接'), fail: (t.match(/连接失败：[^\\n]{0,40}/) || [null])[0], url: location.hash || location.pathname }); })()`);
    console.log(`  [+${wait / 1000}s] ${st}`);
    if (JSON.parse(st).connected) break;
  }
  await screenshot('s601-ws01-ui-final.png');
  // profiles 落盘核验
  const profiles = adbShell('run-as com.pad2.filemanager cat shared_prefs/CapacitorStorage.xml 2>/dev/null').trim();
  const has247 = /192\.168\.2\.247/.test(profiles);
  console.log(`  [PROFILES] 247 卡已保存=${has247}`);
  writeFileSync(join(OUT_DIR, 's601-ws01-ui-result.json'), JSON.stringify({ ts: new Date().toISOString() }, null, 2));
  adbShell('svc power stayon false');
  ws.close();
}
main().catch((e) => { console.error('✗ ' + e.message); try { adbShell('svc power stayon false'); } catch {} process.exit(1); });