/**
 * TASK-S5-01 真实使用闭环验收——A/B 段（当前 APK 快速复验）
 * A：连接→浏览 gate4-test→进入财务目录→面包屑返回→搜索→排序→多选→退出
 * B：新 UI FileActionSheet「打开/编辑」现状（S4-05 骨架：应呈现分发骨架提示）
 * 通道：CDP（保持屏幕唤醒——熄屏会冻结 WebView 调度，已确诊教训）
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s5';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 90000 });
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

async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT_DIR, name), Buffer.from(data, 'base64'));
  console.log(`  [SHOT] ${name}`);
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

async function tapText(selector, text) {
  const pos = await evalPage(`
    (() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els.find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
      if (!el) return 'NOT_FOUND';
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()
  `);
  if (pos === 'NOT_FOUND') throw new Error(`点击目标未找到 "${text}"`);
  const { x, y } = JSON.parse(pos);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, 95));
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x, y }] });
}

async function tapRow(rowText) {
  const pos = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('[data-file-row]')];
      const target = rows.find((r) => (r.textContent || '').includes(${JSON.stringify(rowText)}));
      if (!target) return 'NOT_FOUND';
      const r = target.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()
  `);
  if (pos === 'NOT_FOUND') throw new Error(`文件行未找到 "${rowText}"`);
  const { x, y } = JSON.parse(pos);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, 95));
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x, y }] });
}

/** PointerEvent dispatch 短按文件行（useLongPress onPress→onOpen 完整链路） */
async function pressRow(rowText) {
  const ok = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('[data-file-row]')];
      const target = rows.find((r) => (r.textContent || '').includes(${JSON.stringify(rowText)}));
      if (!target) return 'NOT_FOUND(' + rows.length + ')';
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }));
      return 'PRESSED';
    })()
  `);
  if (ok !== 'PRESSED') throw new Error(`文件行按压失败 "${rowText}": ${ok}`);
}

/** 点击连接页的 profile 卡（ListRow 根过滤） */
async function tapProfileCard() {
  const clicked = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('main div')].filter(
        (e) => String(e.className).includes('row') && !String(e.className).includes('row__') && e.textContent.includes('Gate3验证服务器'),
      );
      const target = rows[0];
      if (!target) return 'NOT_FOUND';
      const r = target.getBoundingClientRect();
      window.__cardPt = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      return 'FOUND';
    })()
  `);
  if (clicked !== 'FOUND') throw new Error('Gate3 卡未找到');
  const pt = JSON.parse(await evalPage(`JSON.stringify(window.__cardPt)`));
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  await new Promise((r) => setTimeout(r, 95));
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: pt.x, y: pt.y }] });
}

async function state() {
  return JSON.parse(
    await evalPage(`
    (() => {
      const t = document.body.innerText;
      const nav = document.querySelector('nav[aria-label="路径导航"]');
      return JSON.stringify({
        path: nav ? nav.textContent.substring(0, 40) : '无',
        rows: document.querySelectorAll('[data-file-row]').length,
        marks: document.querySelectorAll('mark').length,
        multiBar: (t.match(/已选 \\d+ 项/) || ['无'])[0],
        sheet: document.querySelectorAll('[role="dialog"]').length,
        banner: (document.querySelector('[role="status"]') || {}).textContent || '无',
      });
    })()
  `),
  );
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = {};
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(6000);
  await connectWs();

  console.log('== A1 连接（真实点击路径，含一次自动重试） ==');
  await tapText('nav button', '添加连接');
  await sleep(1000);
  await tapProfileCard();
  await sleep(15000);
  let connected = await evalPage(`document.body.innerText.includes('已连接')`);
  if (!connected) {
    console.log('  [RETRY] 首次点击未连接，重试一次…');
    await tapProfileCard();
    await sleep(16000);
    connected = await evalPage(`document.body.innerText.includes('已连接')`);
  }
  assert(connected, 'A1 连接成功（pad2gate3/保存凭据）');

  console.log('== A2 浏览+进入目录 ==');
  await tapText('nav button', 'Gate3验证服务器');
  await sleep(3000);
  let st = await state();
  assert(st.rows > 20, `A2 根目录列表（${st.rows} 行）`);
  await tapRow('gate4-test');
  await sleep(3200);
  st = await state();
  assert(st.rows === 4 && st.path.includes('gate4-test'), `A2 进入 gate4-test（4 行）`);
  await screenshot('s501-a-browse.png');

  console.log('== A3 进入子目录+面包屑返回 ==');
  await tapRow('财务目录');
  await sleep(2800);
  st = await state();
  assert(st.rows === 0 || st.path.includes('财务目录'), 'A3 进入财务目录（空目录）');
  await tapText('nav[aria-label="路径导航"] button, nav[aria-label="路径导航"] span', 'gate4-test');
  await sleep(2800);
  st = await state();
  assert(st.rows === 4, `A3 面包屑返回 gate4-test（${st.rows} 行）`);

  console.log('== A4 搜索 ==');
  await evalPage(`
    (() => {
      const input = document.querySelector('input[aria-label="搜索当前目录"]');
      if (!input) return 'NOT_FOUND';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '预算');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'SET';
    })()
  `);
  await sleep(800);
  st = await state();
  assert(st.rows === 1 && st.marks >= 1, `A4 搜索过滤 1 行+高亮`);
  await tapText('button[aria-label="清空搜索"]', '');
  await sleep(700);
  st = await state();
  assert(st.rows === 4, 'A4 清空搜索恢复');

  console.log('== A5 多选 ==');
  await tapText('button[aria-label="多选"]', '');
  await sleep(800);
  st = await state();
  assert(st.multiBar.startsWith('已选 1'), `A5 多选入口（${st.multiBar}）`);
  await screenshot('s501-a-multiselect.png');
  await tapText('footer button', '取消');
  await sleep(700);
  st = await state();
  assert(!st.multiBar.startsWith('已选'), 'A5 退出多选');

  console.log('== B 新 UI FileActionSheet「编辑」现状（S4-05 骨架） ==');
  // 通道说明：CDP touch 对文件行 onOpen 路径存在通道差异（Gate-UI-4 已披露；
  // 真实手指短按人工抽查已确认正常），组件链路经 PointerEvent dispatch 验证
  await pressRow('年度报告.docx');
  await sleep(1300);
  st = await state();
  assert(st.sheet === 1, 'B1 操作菜单弹出');
  // 点「编辑」
  await tapText('[role="dialog"] [role="menuitem"]', '编辑');
  await sleep(2000);
  const afterEdit = await evalPage(`
    (() => {
      const t = document.body.innerText;
      const status = document.querySelector('[role="status"]');
      return JSON.stringify({
        skeletonMsg: t.includes('后续版本交付') || t.includes('分发骨架'),
        banner: status ? status.textContent.substring(0, 50) : '无',
        wpsOpen: false,
      });
    })()
  `);
  const afterEditV = JSON.parse(afterEdit);
  console.log(`  [B2] 编辑分发现状：${afterEditV.skeletonMsg ? '骨架提示（如实披露）' : '无骨架提示'} banner="${afterEditV.banner}"`);
  results.newUiEdit = { skeletonMsg: afterEditV.skeletonMsg, banner: afterEditV.banner };
  await screenshot('s501-b-edit-skeleton.png');
  // 关闭菜单
  await evalPage(`(() => { const s = document.querySelector('[role="dialog"]'); const scrim = s ? s.parentElement : null; if (scrim) scrim.click(); return 'OK'; })()`);
  await sleep(700);

  console.log('== B3 「打开」现状 ==');
  await pressRow('截图.png');
  await sleep(1300);
  await tapText('[role="dialog"] [role="menuitem"]', '打开');
  await sleep(2000);
  const afterOpen = await evalPage(`
    (() => {
      const t = document.body.innerText;
      return JSON.stringify({ skeletonMsg: t.includes('后续版本交付'), noWps: !t.includes('WPS Office') });
    })()
  `);
  const afterOpenV = JSON.parse(afterOpen);
  results.newUiOpen = afterOpenV;
  console.log(`  [B3] 打开分发现状：${afterOpenV.skeletonMsg ? '骨架提示' : '无提示'}（新 UI 通道未接真实 WPS，底层能力走 M2 通道验证——S5-01-C）`);
  await screenshot('s501-b-open-skeleton.png');
  await evalPage(`(() => { const s = document.querySelector('[role="dialog"]'); const scrim = s ? s.parentElement : null; if (scrim) scrim.click(); return 'OK'; })()`);
  await sleep(700);

  writeFileSync(join(OUT_DIR, 's501-ab-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nS5-01 A/B 段验证通过（基本流程全过；新 UI 编辑/打开=骨架现状如实记录）');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});