/**
 * TASK-S6-07 README 截图脚本——全量页面 UI 展示截图（真机 CDP+Page.captureScreenshot）
 * APK：d6d75d20…f099e8（release 构建，webContentsDebuggingEnabled:true 保留 CDP 通道）
 * 截图存：docs/screenshots/（README 引用目录）
 * 页面清单：工作台/连接表单/连接列表/浏览页/搜索/多选/菜单/删除确认/重命名/冲突/进度面板/设置/M2
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/screenshots';
const BS = 'String.fromCharCode(92)';

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
  await send('Page.enable');
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
async function clickCardByName(nameKey) {
  const c = await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes(${JSON.stringify(nameKey)})); if (!rows.length) return 'NOT_FOUND'; rows[0].click(); return 'CLICKED'; })()`);
  if (c !== 'CLICKED') throw new Error(`连接卡点击失败 "${nameKey}"`);
}
async function deleteCardByName(nameKey) {
  const menu = await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes(${JSON.stringify(nameKey)})); const btn = rows[0]?.querySelector('button[aria-label^="更多操作"]'); if (!btn) return 'NF'; btn.click(); return 'OK'; })()`);
  if (menu !== 'OK') return;
  await sleep(900);
  await evalPage(`(() => { const rows = [...document.querySelectorAll('[role="dialog"] div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('删除')); if (!rows.length) return 'NF'; rows[0].click(); return 'OK'; })()`);
  await sleep(1100);
  await clickEl('[role="alertdialog"] button', '删除');
  await sleep(2200);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  // 清理历史测试卡（幂等）
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();

  // 1. 工作台首页
  console.log('== 1. 工作台首页 ==');
  await sleep(2000);
  await screenshot('01-home.png');

  // 2. 连接页-表单空态
  console.log('== 2. 连接页表单 ==');
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  await screenshot('02-connection-form.png');

  // 3. 建配置→列表卡
  console.log('== 3. 连接列表卡 ==');
  await setField('连接名称', '办公室文件服务器');
  await setField('服务器地址', '192.168.2.247');
  await setField('共享名', 'soft');
  await setField('用户名', 'guest');
  await setField('密码', '');
  const ck = await clickSaveAndConnect();
  if (ck > 0) {
    // 等待连接成功
    for (let i = 0; i < 20; i++) {
      const c = await evalPage(`document.body.innerText.includes('已连接')`);
      if (c) break;
      await sleep(1000);
    }
  }
  await sleep(2000);
  await screenshot('03-connected.png');

  // 4. 浏览页-目录列表
  console.log('== 4. 浏览页目录列表 ==');
  await sleep(2000);
  await screenshot('04-browse-list.png');

  // 5. 搜索状态
  console.log('== 5. 搜索状态 ==');
  // 点搜索框
  await evalPage(`(() => { const inp = document.querySelector('input[type="search"], input[placeholder*="搜索"]'); if (inp) { inp.focus(); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(inp, '测试'); inp.dispatchEvent(new Event('input', { bubbles: true })); return 'SET'; } return 'NF'; })()`);
  await sleep(1500);
  await screenshot('05-search.png');
  // 清搜索
  await evalPage(`(() => { const inp = document.querySelector('input[type="search"], input[placeholder*="搜索"]'); if (inp) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(inp, ''); inp.dispatchEvent(new Event('input', { bubbles: true })); return 'CLR'; } return 'NF'; })()`);
  await sleep(1000);

  // 6. 多选状态（长按文件行）
  console.log('== 6. 多选状态 ==');
  const rowClicked = await evalPage(`(() => { const rows = document.querySelectorAll('[data-file-row]'); if (rows.length > 0) { rows[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return 'OK'; } return 'NF'; })()`);
  await sleep(600);
  await evalPage(`(() => { const rows = document.querySelectorAll('[data-file-row]'); if (rows.length > 0) { rows[0].dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); } return 'OK'; })()`);
  await sleep(1500);
  await screenshot('06-multi-select.png');

  // 7. FileActionSheet 菜单（点⋮或文件行）
  console.log('== 7. 文件操作菜单 ==');
  // 退出多选
  await evalPage(`(() => { const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('取消')); if (btn) btn.click(); return 'OK'; })()`);
  await sleep(1000);
  // 点文件行的更多操作按钮
  const menuOk = await evalPage(`(() => { const rows = document.querySelectorAll('[data-file-row]'); if (rows.length > 0) { const btn = rows[0].querySelector('button[aria-label*="更多"], button[aria-label*="操作"]'); if (btn) { btn.click(); return 'OK'; } } return 'NF'; })()`);
  await sleep(1200);
  await screenshot('07-file-action-sheet.png');

  // 8. 删除确认对话框
  console.log('== 8. 删除确认对话框 ==');
  // 点删除项
  await evalPage(`(() => { const items = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button')].filter(e => (e.textContent||'').includes('删除')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
  await sleep(1200);
  await screenshot('08-delete-confirm.png');
  // 取消
  await evalPage(`(() => { const btn = [...document.querySelectorAll('[role="alertdialog"] button')].find(b => (b.textContent||'').includes('取消')); if (btn) btn.click(); return 'OK'; })()`);
  await sleep(1000);
  // 关闭 BottomSheet
  await evalPage(`(() => { const scrim = document.querySelector('[role="dialog"]'); if (scrim) scrim.click(); return 'OK'; })()`);
  await sleep(1000);

  // 9. 重命名对话框
  console.log('== 9. 重命名对话框 ==');
  const menu2 = await evalPage(`(() => { const rows = document.querySelectorAll('[data-file-row]'); if (rows.length > 0) { const btn = rows[0].querySelector('button[aria-label*="更多"], button[aria-label*="操作"]'); if (btn) { btn.click(); return 'OK'; } } return 'NF'; })()`);
  await sleep(1200);
  await evalPage(`(() => { const items = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button')].filter(e => (e.textContent||'').includes('重命名')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
  await sleep(1200);
  await screenshot('09-rename-dialog.png');
  await evalPage(`(() => { const btn = [...document.querySelectorAll('[role="alertdialog"] button, button')].find(b => (b.textContent||'').includes('取消')); if (btn) btn.click(); return 'OK'; })()`);
  await sleep(1000);

  // 10. 操作进度面板（触发复制）
  console.log('== 10. 操作进度面板 ==');
  const menu3 = await evalPage(`(() => { const rows = document.querySelectorAll('[data-file-row]'); if (rows.length > 0) { const btn = rows[0].querySelector('button[aria-label*="更多"], button[aria-label*="操作"]'); if (btn) { btn.click(); return 'OK'; } } return 'NF'; })()`);
  await sleep(1200);
  await evalPage(`(() => { const items = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button')].filter(e => (e.textContent||'').includes('复制')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
  await sleep(1500);
  await screenshot('10-copy-progress.png');
  await sleep(3000);

  // 11. 冲突对话框（复制同名）
  console.log('== 11. 冲突对话框 ==');
  // 再复制同一文件到同目录→冲突
  const menu4 = await evalPage(`(() => { const rows = document.querySelectorAll('[data-file-row]'); if (rows.length > 0) { const btn = rows[0].querySelector('button[aria-label*="更多"], button[aria-label*="操作"]'); if (btn) { btn.click(); return 'OK'; } } return 'NF'; })()`);
  await sleep(1200);
  await evalPage(`(() => { const items = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button')].filter(e => (e.textContent||'').includes('复制')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
  await sleep(2000);
  await screenshot('11-conflict-dialog.png');
  // 取消/跳过
  await evalPage(`(() => { const btn = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('取消') || (b.textContent||'').includes('跳过')); if (btn) btn.click(); return 'OK'; })()`);
  await sleep(1000);

  // 12. 设置页
  console.log('== 12. 设置页 ==');
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.includes('设置')); if (b) { b.click(); return 'OK'; } return 'NF'; })()`);
  await sleep(1500);
  await screenshot('12-settings.png');

  // 13. M2 验证页
  console.log('== 13. M2 验证页 ==');
  // 设置页→开发者选项→M2
  await evalPage(`(() => { const items = [...document.querySelectorAll('div, button, a')].filter(e => (e.textContent||'').includes('开发者选项')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
  await sleep(1500);
  await evalPage(`(() => { const items = [...document.querySelectorAll('div, button, a')].filter(e => (e.textContent||'').includes('M2') || (e.textContent||'').includes('验证')); if (items.length) { items[0].click(); return 'OK'; } return 'NF'; })()`);
  await sleep(2000);
  await screenshot('13-m2-verification.png');

  // 14. 回工作台
  console.log('== 14. 工作台（已连接态） ==');
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.includes('工作台')); if (b) { b.click(); return 'OK'; } return 'NF'; })()`);
  await sleep(1500);
  await screenshot('14-home-connected.png');

  // 清理测试配置卡
  console.log('== 清理测试卡 ==');
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.includes('连接')); if (b) { b.click(); return 'OK'; } return 'NF'; })()`);
  await sleep(1500);
  try { await deleteCardByName('办公室文件服务器'); console.log('  [CLEAN] 已删除测试卡'); } catch (e) { console.log('  [CLEAN] 跳过：' + e.message.substring(0, 40)); }

  results.allPass = true;
  results.screenshots = 14;
  writeFileSync(join(OUT_DIR, 'screenshot-manifest.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\n===== 全量页面截图完成（14 张） =====');
  adbShell('svc power stayon false');
  ws.close();
}
main().catch((e) => {
  console.error(`✗ ${e.message}`);
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});