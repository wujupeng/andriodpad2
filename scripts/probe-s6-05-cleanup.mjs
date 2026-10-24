/** S6-05 收尾：R-1 泄露发现后的测试卡清理（App 进程存活，CDP 重连删除 S6-05-R1-Cred） */
import { execFileSync } from 'node:child_process';

const ADB = 'C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 120000 });
}
function profilesXml() {
  return String(adbShell('run-as com.pad2.filemanager cat shared_prefs/CapacitorStorage.xml 2>/dev/null'));
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
async function evalPage(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (exceptionDetails) throw new Error(`evaluate 异常: ${exceptionDetails.text}`);
  return result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(4000);
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
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1000);
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.includes('添加连接')); b?.click(); return 'OK'; })()`);
  await sleep(1400);
  // 菜单→删除
  const menu = await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('S6-05-R1-Cred')); const btn = rows[0]?.querySelector('button[aria-label^="更多操作"]'); if (!btn) return 'NF'; btn.click(); return 'OK'; })()`);
  console.log('menu=' + menu);
  await sleep(900);
  await evalPage(`(() => { const rows = [...document.querySelectorAll('[role="dialog"] div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('删除')); if (!rows.length) return 'NF'; rows[0].click(); return 'OK'; })()`);
  await sleep(1100);
  await evalPage(`(() => { const b = [...document.querySelectorAll('[role="alertdialog"] button')].find(x => x.textContent.includes('删除')); if (b) { b.click(); return 'OK'; } return 'NF'; })()`);
  await sleep(2200);
  const xml = profilesXml();
  console.log('S6-05-R1-Cred 已删除: ' + !xml.includes('S6-05-R1-Cred'));
  console.log('密文残留: ' + /passwordEncrypted/.test(xml));
  adbShell('svc power stayon false');
  ws.close();
}
main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });