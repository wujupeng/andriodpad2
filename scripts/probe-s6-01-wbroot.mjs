/** S6-01 根因探针：App 现有会话重触发 writeback + 全量 logcat 采集 */
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

async function main() {
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await new Promise((r) => setTimeout(r, 3000));
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
  await send('Runtime.enable');

  adbShell('logcat -c');
  console.log('== 触发 writeback（App 现有会话） ==');
  const wb = await evalPage(`(async () => { const BS = String.fromCharCode(92); try { const r = await window.Capacitor.Plugins.SmbPlugin.writeback(); return JSON.stringify(r); } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 150); } })()`, true);
  console.log('[WB] ' + String(wb).substring(0, 160));
  await new Promise((r) => setTimeout(r, 2000));
  const pid = adbShell('pidof com.pad2.filemanager').trim();
  console.log('== 全量日志（pid ' + pid + '） ==');
  const log = adbShell(`logcat -d --pid=${pid} 2>/dev/null | head -80`);
  console.log(log);
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });