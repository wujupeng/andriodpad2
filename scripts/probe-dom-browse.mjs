/** 快速诊断：浏览页文件行的实际 DOM 结构（修正截图脚本选择器） */
import { execFileSync } from 'node:child_process';
const ADB = 'C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
function adbShell(cmd) { return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 120000 }); }
let ws, msgId = 0; const pending = new Map();
function send(method, params = {}) { const id = ++msgId; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalPage(expression, awaitP = false) { const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: awaitP }); if (exceptionDetails) throw new Error(`evaluate 异常: ${exceptionDetails.text}`); return result.value; }
async function connectWs() {
  let m = null;
  for (let i = 0; i < 15; i++) { const unix = adbShell("cat /proc/net/unix 2>/dev/null | grep webview_devtools_remote | head -1"); m = String(unix).match(/webview_devtools_remote_(\d+)/); if (m) break; await new Promise(r => setTimeout(r, 2000)); }
  if (!m) throw new Error('DevTools socket 未出现');
  execFileSync(ADB, ['-s', DEVICE, 'forward', 'tcp:9222', `localabstract:webview_devtools_remote_${m[1]}`]);
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result); } });
  await send('Runtime.enable');
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function main() {
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(6000);
  await connectWs();
  // 检查当前页面+文件行 DOM
  const info = await evalPage(`(() => {
    const t = document.body.innerText.substring(0, 200);
    // 找文件行：尝试多种选择器
    const selectors = ['[data-file-row]', '[data-testid]', '.fileRow', '.file-row', '[role="row"]', 'li', '[class*="row"]', '[class*="file"]', '[class*="item"]'];
    const found = {};
    for (const s of selectors) { const els = document.querySelectorAll(s); if (els.length) found[s] = els.length; }
    // 找搜索框
    const searchInputs = document.querySelectorAll('input[type="search"], input[placeholder*="搜索"], input[placeholder*="search"], input[aria-label*="搜索"]');
    const searchInfo = [...searchInputs].map(i => ({ type: i.type, placeholder: i.placeholder, ariaLabel: i.getAttribute('aria-label'), class: i.className }));
    // 找按钮（菜单/更多操作）
    const buttons = [...document.querySelectorAll('button')].map(b => ({ text: (b.textContent||'').trim().substring(0, 20), ariaLabel: b.getAttribute('aria-label'), class: b.className.substring(0, 30) })).filter(b => b.text || b.ariaLabel);
    return JSON.stringify({ bodyText: t, foundSelectors: found, searchInputs: searchInfo, buttons: buttons.slice(0, 15) }, null, 2);
  })()`);
  console.log(info);
  ws.close();
}
main().catch(e => { console.error('✗ ' + e.message); process.exit(1); });