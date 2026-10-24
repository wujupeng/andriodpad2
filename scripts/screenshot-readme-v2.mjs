/**
 * README 截图脚本 v2——补截缺失的 5 个页面（搜索/菜单/删除/重命名/冲突）
 * 先连接 247 guest 进入浏览页，再根据实际 DOM 结构截图
 */
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

  // 连接 247 guest
  console.log('== 连接 247 guest ==');
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  await setField('连接名称', 'README截图');
  await setField('服务器地址', '192.168.2.247');
  await setField('共享名', 'soft');
  await setField('用户名', 'guest');
  await setField('密码', '');
  const ck = await clickSaveAndConnect();
  if (ck === 0) throw new Error('连接未触发');
  // 等待连接成功
  for (let i = 0; i < 20; i++) { const c = await evalPage(`document.body.innerText.includes('已连接')`); if (c) break; await sleep(1000); }
  await sleep(2000);

  // 进入 AutoFileBackup 目录
  console.log('== 进入浏览页 ==');
  // 连接成功后 App 自动进入浏览页——检查是否在浏览页
  const browseInfo = await evalPage(`(() => {
    const t = document.body.innerText.substring(0, 300);
    // 找文件行：检查多种可能的选择器
    const allDivs = [...document.querySelectorAll('div')];
    const fileRows = allDivs.filter(d => {
      const cls = String(d.className || '');
      // CSS Modules 类名含 row/item/file 但不含 nav/header
      return (cls.includes('row') || cls.includes('item') || cls.includes('file')) && !cls.includes('nav') && !cls.includes('header') && d.querySelector('button, [role="button"], span');
    });
    // 找搜索框
    const searchInputs = [...document.querySelectorAll('input')].filter(i => i.type === 'search' || (i.placeholder || '').includes('搜索') || (i.placeholder || '').includes('search'));
    // 找所有按钮的 aria-label
    const buttons = [...document.querySelectorAll('button')].map(b => ({ text: (b.textContent||'').trim().substring(0,15), ariaLabel: b.getAttribute('aria-label'), cls: String(b.className||'').substring(0,25) })).filter(b => b.ariaLabel || b.text);
    return JSON.stringify({ bodyText: t, fileRowCount: fileRows.length, fileRowClasses: fileRows.slice(0,3).map(d => String(d.className).substring(0,40)), searchInputs: searchInputs.map(i => ({type:i.type,placeholder:i.placeholder,cls:String(i.className).substring(0,30)})), buttons: buttons.slice(0,20) }, null, 2);
  })()`);
  console.log('浏览页 DOM:'); console.log(browseInfo);

  // 截图浏览页
  await screenshot('04-browse-list.png');

  // 搜索——找搜索框并输入
  console.log('== 搜索状态 ==');
  const searchOk = await evalPage(`(() => {
    const inputs = [...document.querySelectorAll('input')];
    const search = inputs.find(i => i.type === 'search' || (i.placeholder||'').includes('搜索') || (i.placeholder||'').includes('search') || (i.getAttribute('aria-label')||'').includes('搜索'));
    if (!search) return 'NF';
    search.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(search, '新建');
    search.dispatchEvent(new Event('input', { bubbles: true }));
    return 'SET';
  })()`);
  console.log(`  搜索框: ${searchOk}`);
  await sleep(1500);
  await screenshot('05-search.png');
  // 清搜索
  await evalPage(`(() => { const inputs = [...document.querySelectorAll('input')]; const search = inputs.find(i => i.type === 'search' || (i.placeholder||'').includes('搜索')); if (search) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(search, ''); search.dispatchEvent(new Event('input', { bubbles: true })); } return 'OK'; })()`);
  await sleep(1000);

  // 文件操作菜单——找文件行的更多操作按钮
  console.log('== 文件操作菜单 ==');
  // 先找文件行：用 DOM 结构定位（找含文件名的可点击行）
  const menuOk = await evalPage(`(() => {
    // 找所有含"更多操作"或"⋮"或 aria-label 含"更多"的按钮
    const btns = [...document.querySelectorAll('button')];
    const moreBtn = btns.find(b => {
      const al = b.getAttribute('aria-label') || '';
      return al.includes('更多') || al.includes('操作') || al.includes('more');
    });
    if (moreBtn) { moreBtn.click(); return 'OK'; }
    // fallback: 找文件行中的按钮
    const rows = [...document.querySelectorAll('div')].filter(d => {
      const cls = String(d.className||'');
      return (cls.includes('row') || cls.includes('file')) && !cls.includes('nav') && d.querySelector('button');
    });
    if (rows.length) {
      const btn = rows[0].querySelector('button');
      if (btn) { btn.click(); return 'OK_ROW'; }
    }
    return 'NF';
  })()`);
  console.log(`  菜单触发: ${menuOk}`);
  await sleep(1200);
  await screenshot('07-file-action-sheet.png');

  // 删除确认
  console.log('== 删除确认 ==');
  await evalPage(`(() => { const items = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button, [role="menu"] div, [role="menu"] button')].filter(e => (e.textContent||'').includes('删除')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
  await sleep(1200);
  await screenshot('08-delete-confirm.png');
  // 取消
  await evalPage(`(() => { const btn = [...document.querySelectorAll('[role="alertdialog"] button, button')].find(b => (b.textContent||'').includes('取消')); if (btn) { btn.click(); return 'OK'; } return 'NF'; })()`);
  await sleep(1000);
  // 关 BottomSheet
  await evalPage(`(() => { const scrim = document.querySelector('[role="dialog"]'); if (scrim) scrim.click(); return 'OK'; })()`);
  await sleep(1000);

  // 重命名对话框
  console.log('== 重命名对话框 ==');
  await evalPage(`(() => { const btns = [...document.querySelectorAll('button')]; const moreBtn = btns.find(b => { const al = b.getAttribute('aria-label')||''; return al.includes('更多') || al.includes('操作'); }); if (moreBtn) moreBtn.click(); return 'OK'; })()`);
  await sleep(1200);
  await evalPage(`(() => { const items = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button, [role="menu"] div, [role="menu"] button')].filter(e => (e.textContent||'').includes('重命名')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
  await sleep(1200);
  await screenshot('09-rename-dialog.png');
  await evalPage(`(() => { const btn = [...document.querySelectorAll('[role="alertdialog"] button, button')].find(b => (b.textContent||'').includes('取消')); if (btn) btn.click(); return 'OK'; })()`);
  await sleep(1000);

  // 冲突对话框（复制同名）
  console.log('== 冲突对话框 ==');
  await evalPage(`(() => { const btns = [...document.querySelectorAll('button')]; const moreBtn = btns.find(b => { const al = b.getAttribute('aria-label')||''; return al.includes('更多') || al.includes('操作'); }); if (moreBtn) moreBtn.click(); return 'OK'; })()`);
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
  console.log('\n===== 补截完成 =====');
}
main().catch(e => { console.error(`✗ ${e.message}`); try { adbShell('svc power stayon false'); } catch {} process.exit(1); });