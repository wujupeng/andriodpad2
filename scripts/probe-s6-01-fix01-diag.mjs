/** S1① 失败快速诊断：点击后读页面全文与按钮状态 */
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  const unix = adbShell("cat /proc/net/unix 2>/dev/null | grep webview_devtools_remote | head -1");
  const m = String(unix).match(/webview_devtools_remote_(\d+)/);
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

  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.includes('添加连接')); if (b) b.click(); return 'OK'; })()`);
  await sleep(1600);
  const setField = async (label, value) => {
    const ok = await evalPage(`(() => { const labels = [...document.querySelectorAll('label')]; const label = labels.find((l) => (l.textContent || '').includes('${label}')); if (!label) return 'L'; const input = label.htmlFor ? document.getElementById(label.htmlFor) : null; if (!input) return 'I'; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); return 'SET'; })()`);
    console.log(`  [FIELD] ${label}=${ok}`);
  };
  await setField('连接名称', 'S6-01-Diag');
  await setField('服务器地址', '192.168.2.247');
  await setField('共享名', 'soft');
  await setField('用户名', 'guest');
  await setField('密码', '');
  const preState = await evalPage(`(() => { const btns = [...document.querySelectorAll('main button')].map(b => ({ t: (b.textContent || '').trim(), d: b.disabled })); return JSON.stringify(btns); })()`);
  console.log(`  [PRE] 按钮: ${preState}`);
  const clickRes = await evalPage(`(() => { const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent || '').includes('保存并连接')); if (!btn) return 'NOT_FOUND'; btn.click(); return 'CLICKED'; })()`);
  console.log(`  [CLICK] ${clickRes}`);
  for (const wait of [500, 1500, 3000, 6000, 12000, 20000]) {
    await sleep(wait === 500 ? 500 : wait - ([500, 1500, 3000, 6000, 12000].slice(0, [500, 1500, 3000, 6000, 12000, 20000].indexOf(wait)).reduce((a, b) => a + b, 0)));
    const st = await evalPage(`(() => { const t = document.body.innerText; const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent || '').includes('保存并连接')); return JSON.stringify({ disabled: btn ? btn.disabled : null, connecting: t.includes('正在连接'), connected: t.includes('已连接'), fail: (t.match(/连接失败：[^\\n]{0,50}/) || [null])[0], err: (t.match(/请填写[^\\n]{0,20}/g) || []).join('|') }); })()`);
    console.log(`  [+${wait}] ${st}`);
    if (JSON.parse(st).connected || JSON.parse(st).fail) break;
  }
  const full = await evalPage(`document.body.innerText.substring(0, 800)`);
  console.log('  [BODY] ' + String(full).replace(/\n/g, ' | ').substring(0, 500));
  ws.close();
}
main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });