/** README 截图 v5——补截 07/08/09/11：多选模式操作栏+长按 FileActionSheet */
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
  await clickEl('nav button', '工作台');
  await sleep(1500);
  await clickEl('main button', '进入浏览');
  await sleep(3000);

  // 进入 AutoFileBackup 子目录（有预置原件——文件少更干净）
  console.log('== 进入 AutoFileBackup ==');
  const entered = await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter(d => (d.textContent||'').trim().startsWith('AutoFileBackup')); if (rows.length) { rows[0].click(); return 'OK'; } return 'NF'; })()`);
  console.log(`  进入子目录: ${entered}`);
  await sleep(2000);

  // 获取第一个文件行的坐标（用于长按）
  const fileRowInfo = await evalPage(`(() => {
    // 找文件行：main 内的含文件名的可点击行
    const main = document.querySelector('main');
    if (!main) return JSON.stringify({err: 'NF_MAIN'});
    // 找所有 div 中含文本的行（排除导航/标题）
    const rows = [...main.querySelectorAll('div')].filter(d => {
      const t = (d.textContent||'').trim();
      const cls = String(d.className||'');
      // 文件行特征：class 含 row 且有子元素（图标/文本）
      return cls.includes('row') && !cls.includes('__') && t.length > 0 && t.length < 50 && d.querySelector('span, svg, img');
    });
    if (!rows.length) return JSON.stringify({err: 'NF_ROWS', mainText: main.innerText.substring(0, 200)});
    const r = rows[0];
    const rect = r.getBoundingClientRect();
    return JSON.stringify({text: (r.textContent||'').trim().substring(0, 30), cls: String(r.className).substring(0, 40), x: Math.round(rect.x + rect.width/2), y: Math.round(rect.y + rect.height/2), count: rows.length});
  })()`);
  console.log(`  文件行: ${fileRowInfo}`);
  const rowInfo = JSON.parse(fileRowInfo);

  if (rowInfo.x && rowInfo.y) {
    // 长按文件行触发 FileActionSheet（adb swipe 原地长按 1000ms）
    console.log(`== 长按文件行 (${rowInfo.x}, ${rowInfo.y}) 触发 FileActionSheet ==`);
    adbShell(`input swipe ${rowInfo.x} ${rowInfo.y} ${rowInfo.x} ${rowInfo.y} 1000`);
    await sleep(2000);
    // 检查 FileActionSheet 是否出现
    const fasCheck = await evalPage(`(() => { const t = document.body.innerText; const has = t.includes('复制') || t.includes('删除') || t.includes('重命名') || t.includes('打开'); const dialogs = document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"]'); return JSON.stringify({hasAction: has, dialogCount: dialogs.length, body: t.substring(0, 200)}); })()`);
    console.log(`  FileActionSheet: ${fasCheck}`);
    await screenshot('07-file-action-sheet.png');

    // 点删除→删除确认
    console.log('== 删除确认 ==');
    await evalPage(`(() => { const items = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button, [role="menu"] div, [role="menu"] button, [role="listbox"] div, [role="listbox"] button')].filter(e => (e.textContent||'').trim().includes('删除')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
    await sleep(1200);
    await screenshot('08-delete-confirm.png');
    // 取消
    await evalPage(`(() => { const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('取消')); if (btn) btn.click(); return 'OK'; })()`);
    await sleep(1000);

    // 再长按→重命名
    console.log('== 重命名 ==');
    adbShell(`input swipe ${rowInfo.x} ${rowInfo.y} ${rowInfo.x} ${rowInfo.y} 1000`);
    await sleep(2000);
    await evalPage(`(() => { const items = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button, [role="menu"] div, [role="menu"] button, [role="listbox"] div, [role="listbox"] button')].filter(e => (e.textContent||'').trim().includes('重命名')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
    await sleep(1200);
    await screenshot('09-rename-dialog.png');
    await evalPage(`(() => { const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('取消')); if (btn) btn.click(); return 'OK'; })()`);
    await sleep(1000);

    // 再长按→复制→冲突
    console.log('== 冲突 ==');
    adbShell(`input swipe ${rowInfo.x} ${rowInfo.y} ${rowInfo.x} ${rowInfo.y} 1000`);
    await sleep(2000);
    await evalPage(`(() => { const items = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button, [role="menu"] div, [role="menu"] button, [role="listbox"] div, [role="listbox"] button')].filter(e => (e.textContent||'').trim().includes('复制')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
    await sleep(2000);
    await screenshot('11-conflict-dialog.png');
    await evalPage(`(() => { const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('取消') || (b.textContent||'').includes('跳过')); if (btn) btn.click(); return 'OK'; })()`);
    await sleep(1000);
  } else {
    console.log('  文件行未找到——跳过操作截图');
  }

  // 清理
  console.log('== 清理 ==');
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.includes('连接')); if (b) b.click(); return 'OK'; })()`);
  await sleep(1500);
  try { await deleteCardByName('README截图'); console.log('  [CLEAN] 已删除'); } catch (e) { console.log('  [CLEAN] 跳过'); }
  adbShell('svc power stayon false');
  ws.close();
  console.log('\n===== v5 完成 =====');
}
main().catch(e => { console.error(`✗ ${e.message}`); try { adbShell('svc power stayon false'); } catch {} process.exit(1); });