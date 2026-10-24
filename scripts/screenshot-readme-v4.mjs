/** README 截图 v4——连接→工作台→点"进入浏览"→文件浏览页截图 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const ADB = 'C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/screenshots';
function adbShell(cmd) { return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 120000 }); }
let ws, msgId = 0; const pending = new Map();
function send(method, params = {}) { const id = ++msgId; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
async function evalPage(expression, awaitP = false) { const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: awaitP }); if (exceptionDetails) throw new Error(`evaluate 异常: ${exceptionDetails.text}`); return result.value; }
async function screenshot(name) { const { data } = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT_DIR, name), Buffer.from(data, 'base64')); console.log(`  [SHOT] ${name}`); }
async function connectWs() {
  let m = null;
  for (let i = 0; i < 15; i++) { const unix = adbShell("cat /proc/net/unix 2>/dev/null | grep webview_devtools_remote | head -1"); m = String(unix).match(/webview_devtools_remote_(\d+)/); if (m) break; await sleep(2000); }
  if (!m) throw new Error('DevTools socket 未出现');
  execFileSync(ADB, ['-s', DEVICE, 'forward', 'tcp:9222', `localabstract:webview_devtools_remote_${m[1]}`]);
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find((t) => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', (event) => { const msg = JSON.parse(event.data); if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result); } });
  await send('Page.enable'); await send('Runtime.enable');
}
async function clickEl(selector, text) { const c = await evalPage(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(selector)})]; const el = els.find((e) => (e.textContent || '').includes(${JSON.stringify(text)})); if (!el) return 'NOT_FOUND'; el.click(); return 'CLICKED'; })()`); if (c !== 'CLICKED') throw new Error(`点击失败 "${text}"`); }
async function setField(label, value) { const ok = await evalPage(`(() => { const labels = [...document.querySelectorAll('label')]; const label = labels.find((l) => (l.textContent || '').includes(${JSON.stringify(label)})); if (!label) return 'L'; const input = label.htmlFor ? document.getElementById(label.htmlFor) : null; if (!input) return 'I'; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); return 'SET'; })()`); if (ok !== 'SET') throw new Error(`字段失败 "${label}"`); }
async function clickSaveAndConnect(maxRetry = 3) { for (let i = 0; i < maxRetry; i++) { await evalPage(`(() => { const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent||'').includes('保存并连接')); if (btn) btn.click(); return 'OK'; })()`); await sleep(400); const v = JSON.parse(await evalPage(`(() => { const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent||'').includes('保存并连接')); const t = document.body.innerText; return JSON.stringify({ d: btn ? btn.disabled : null, c: t.includes('正在连接'), k: t.includes('已连接'), f: t.includes('连接失败：') }); })()`) || '{}'); if (v.d || v.c || v.k || v.f) return i + 1; } return 0; }
async function deleteCardByName(nameKey) { const menu = await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes(${JSON.stringify(nameKey)})); const btn = rows[0]?.querySelector('button[aria-label^="更多操作"]'); if (!btn) return 'NF'; btn.click(); return 'OK'; })()`); if (menu !== 'OK') return; await sleep(900); await evalPage(`(() => { const rows = [...document.querySelectorAll('[role="dialog"] div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('删除')); if (!rows.length) return 'NF'; rows[0].click(); return 'OK'; })()`); await sleep(1100); await clickEl('[role="alertdialog"] button', '删除'); await sleep(2200); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();

  // 连接
  console.log('== 连接 ==');
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  await setField('连接名称', 'README截图');
  await setField('服务器地址', '192.168.2.247');
  await setField('共享名', 'soft');
  await setField('用户名', 'guest');
  await setField('密码', '');
  const ck = await clickSaveAndConnect();
  if (ck === 0) throw new Error('连接未触发');
  for (let i = 0; i < 20; i++) { const c = await evalPage(`document.body.innerText.includes('已连接')`); if (c) break; await sleep(1000); }
  await sleep(2000);

  // 工作台→进入浏览
  console.log('== 工作台→进入浏览 ==');
  await clickEl('nav button', '工作台');
  await sleep(1500);
  // 点"进入浏览"按钮
  await clickEl('main button', '进入浏览');
  await sleep(3000);
  // 检查浏览页
  const check = await evalPage(`(() => {
    const t = document.body.innerText.substring(0, 300);
    const search = document.querySelector('input[type="search"], input[placeholder*="搜索"], input[placeholder*="search"]');
    const main = document.querySelector('main');
    const btns = main ? [...main.querySelectorAll('button')].map(b => ({al: b.getAttribute('aria-label'), cls: String(b.className||'').substring(0,30)})).filter(b => b.al) : [];
    // 文件行：class 含 row--pressable
    const rows = document.querySelectorAll('[class*="pressable"]');
    return JSON.stringify({ hasSearch: !!search, rowCount: rows.length, btns: btns.slice(0, 10), body: t.substring(0, 150) });
  })()`);
  console.log(`  浏览页: ${check}`);

  // 截图浏览页
  await screenshot('04-browse-list.png');

  // 搜索
  console.log('== 搜索 ==');
  const sOk = await evalPage(`(() => { const s = document.querySelector('input[type="search"], input[placeholder*="搜索"], input[placeholder*="search"]'); if (!s) return 'NF'; s.focus(); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(s, '新建'); s.dispatchEvent(new Event('input', { bubbles: true })); return 'SET'; })()`);
  console.log(`  搜索: ${sOk}`);
  await sleep(1500);
  await screenshot('05-search.png');
  await evalPage(`(() => { const s = document.querySelector('input[type="search"], input[placeholder*="搜索"]'); if (s) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(s, ''); s.dispatchEvent(new Event('input', { bubbles: true })); } return 'OK'; })()`);
  await sleep(1000);

  // 文件操作菜单
  console.log('== 菜单 ==');
  const mOk = await evalPage(`(() => { const main = document.querySelector('main'); if (!main) return 'NF_MAIN'; const btns = [...main.querySelectorAll('button')]; const more = btns.find(b => { const al = b.getAttribute('aria-label')||''; return al.includes('更多操作') || al.includes('更多'); }); if (more) { more.click(); return 'OK:' + more.getAttribute('aria-label'); } return 'NF:' + btns.length; })()`);
  console.log(`  菜单: ${mOk}`);
  await sleep(1200);
  await screenshot('07-file-action-sheet.png');

  // 删除确认
  console.log('== 删除 ==');
  await evalPage(`(() => { const items = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button, [role="menu"] div, [role="menu"] button')].filter(e => (e.textContent||'').includes('删除')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
  await sleep(1200);
  await screenshot('08-delete-confirm.png');
  await evalPage(`(() => { const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('取消')); if (btn) btn.click(); return 'OK'; })()`);
  await sleep(1000);
  await evalPage(`(() => { const d = document.querySelector('[role="dialog"]'); if (d) d.click(); return 'OK'; })()`);
  await sleep(1000);

  // 重命名
  console.log('== 重命名 ==');
  await evalPage(`(() => { const main = document.querySelector('main'); const btns = [...main.querySelectorAll('button')]; const more = btns.find(b => (b.getAttribute('aria-label')||'').includes('更多操作')); if (more) more.click(); return 'OK'; })()`);
  await sleep(1200);
  await evalPage(`(() => { const items = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button, [role="menu"] div, [role="menu"] button')].filter(e => (e.textContent||'').includes('重命名')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
  await sleep(1200);
  await screenshot('09-rename-dialog.png');
  await evalPage(`(() => { const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('取消')); if (btn) btn.click(); return 'OK'; })()`);
  await sleep(1000);

  // 冲突
  console.log('== 冲突 ==');
  await evalPage(`(() => { const main = document.querySelector('main'); const btns = [...main.querySelectorAll('button')]; const more = btns.find(b => (b.getAttribute('aria-label')||'').includes('更多操作')); if (more) more.click(); return 'OK'; })()`);
  await sleep(1200);
  await evalPage(`(() => { const items = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button, [role="menu"] div, [role="menu"] button')].filter(e => (e.textContent||'').includes('复制')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
  await sleep(2000);
  await screenshot('11-conflict-dialog.png');
  await evalPage(`(() => { const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('取消') || (b.textContent||'').includes('跳过')); if (btn) btn.click(); return 'OK'; })()`);
  await sleep(1000);

  // 清理
  console.log('== 清理 ==');
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.includes('连接')); if (b) b.click(); return 'OK'; })()`);
  await sleep(1500);
  try { await deleteCardByName('README截图'); console.log('  [CLEAN] 已删除'); } catch (e) { console.log('  [CLEAN] 跳过'); }
  adbShell('svc power stayon false');
  ws.close();
  console.log('\n===== v4 完成 =====');
}
main().catch(e => { console.error(`✗ ${e.message}`); try { adbShell('svc power stayon false'); } catch {} process.exit(1); });