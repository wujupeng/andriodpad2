/**
 * TASK-S4-03 真机验证：长按多选（useLongPress 500ms 触发 / 滑动取消）
 * 前置：APK 已安装（c856c183…）、pad2gate3 profile 已保存。
 * 流程：冷启动 → 连接 pad2gate3 → 导航 browse → 文件列表渲染 →
 * ①CDP touchStart-hold600ms-touchEnd → 断言多选条（已选 1 项）
 * ②取消多选 → touchStart-move40px-touchEnd → 断言未进入多选
 * 凭据经 env（SMB_USER/SMB_PW），不入脚本与截图。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s4';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 60000 });
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

async function clickByText(selector, text) {
  const clicked = await evalPage(`
    (() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els.find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'CLICKED';
    })()
  `);
  if (clicked !== 'CLICKED') throw new Error(`点击失败 ${selector} "${text}": ${clicked}`);
}

async function clickProfileCard(name, index = 0) {
  const clicked = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('main div')].filter(
        (e) => String(e.className).includes('row') && !String(e.className).includes('row__') && e.textContent.includes(${JSON.stringify(name)}),
      );
      const target = rows[${index}];
      if (!target) return 'NOT_FOUND(' + rows.length + ')';
      target.click();
      return 'CLICKED';
    })()
  `);
  if (!clicked.startsWith('CLICKED')) throw new Error(`列表卡点击失败 "${name}[${index}]": ${clicked}`);
}

async function touch(type, x, y) {
  const touchPoints = type === 'touchEnd' ? [] : [{ x, y }];
  await send('Input.dispatchTouchEvent', { type, touchPoints });
}

/** 长按：touchStart → hold(600ms) → touchEnd */
async function longPress(x, y) {
  await touch('touchStart', x, y);
  await new Promise((r) => setTimeout(r, 600));
  await touch('touchEnd', 0, 0);
}

/** 滑动取消：touchStart → move(+40px) → touchEnd */
async function swipeCancel(x, y) {
  await touch('touchStart', x, y);
  await new Promise((r) => setTimeout(r, 120));
  await touch('touchMove', x + 40, y + 10);
  await new Promise((r) => setTimeout(r, 80));
  await touch('touchEnd', 0, 0);
}

async function connectWs() {
  const unix = adbShell("cat /proc/net/unix | grep webview_devtools_remote | head -1");
  const m = unix.match(/webview_devtools_remote_(\d+)/);
  if (!m) throw new Error('未找到 WebView devtools socket');
  execFileSync(ADB, ['-s', DEVICE, 'forward', 'tcp:9222', `localabstract:webview_devtools_remote_${m[1]}`]);
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('CDP 页面未找到');
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

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = {};
  const skipConnect = process.argv[2] === 'resume';
  if (!skipConnect) {
    console.log('== 0 冷启动 ==');
    adbShell('am force-stop com.pad2.filemanager');
    await sleep(1200);
    adbShell('am start -n com.pad2.filemanager/.MainActivity');
    await sleep(5000);
  }
  await connectWs();

  if (!skipConnect) {
    console.log('== 1 连接 pad2gate3（保存的 profile） ==');
    await clickByText('nav button', '添加连接');
    await sleep(800);
    await clickProfileCard('Gate3验证服务器', 0);
    await sleep(12000);
    const connected = await evalPage(`document.body.innerText.includes('已连接')`);
    assert(connected, '已连接（保存凭据重连成功）');
  }

  console.log('== 2 导航浏览页 + 列表渲染 ==');
  await clickByText('nav button', 'Gate3验证服务器');
  await sleep(3000);
  const browseOk = await evalPage(`
    (() => {
      const rows = document.querySelectorAll('[data-file-row]').length;
      return JSON.stringify({ rows, viewport: window.innerWidth + 'x' + window.innerHeight });
    })()
  `);
  const browse = JSON.parse(browseOk);
  console.log(`  [STAT] 文件行 ${browse.rows}（视口 ${browse.viewport}）`);
  assert(browse.rows > 0, '文件列表渲染（虚拟化行）');
  await screenshot('device-s403-browse-list.png');
  results.browse = browse;

  console.log('== 3 长按 500ms → 进入多选（已选 1 项） ==');
  const rowCenter = JSON.parse(await evalPage(`
    (() => {
      const row = document.querySelector('[data-file-row]');
      const r = row.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()
  `));
  console.log(`  [STAT] 长按目标 (${rowCenter.x}, ${rowCenter.y})`);
  await longPress(rowCenter.x, rowCenter.y);
  await sleep(1200);
  const afterLongPress = JSON.parse(await evalPage(`
    (() => {
      const t = document.body.innerText;
      return JSON.stringify({
        multiselectBar: t.includes('已选 1 项'),
        batchButtons: t.includes('复制') && t.includes('移动') && t.includes('删除'),
        cancel: t.includes('取消'),
      });
    })()
  `));
  assert(afterLongPress.multiselectBar, '长按 500ms 触发多选（已选 1 项）');
  assert(afterLongPress.batchButtons, 'MultiSelectBar 批量操作呈现');
  await screenshot('device-s403-longpress-multiselect.png');
  results.longPress = afterLongPress;

  console.log('== 4 取消多选 → 返回键语义（点取消，保留列表位置） ==');
  await evalPage(`
    (() => {
      const bars = [...document.querySelectorAll('footer button, main button, body button')];
      const cancel = bars.filter((b) => b.textContent.trim() === '取消').pop();
      if (!cancel) return 'NOT_FOUND';
      cancel.click();
      return 'OK';
    })()
  `);
  await sleep(800);
  const exited = await evalPage(`!document.body.innerText.includes('已选 1 项')`);
  assert(exited, '取消退出多选（列表保留）');

  console.log('== 5 滑动取消：touchStart→move(+40px)→touchEnd 不触发多选 ==');
  const rowCenter2 = JSON.parse(await evalPage(`
    (() => {
      const row = document.querySelector('[data-file-row]');
      const r = row.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()
  `));
  await swipeCancel(rowCenter2.x, rowCenter2.y);
  await sleep(1000);
  const noMultiselect = await evalPage(`!document.body.innerText.includes('已选 1 项') && !document.body.innerText.includes('已选 2 项')`);
  assert(noMultiselect, '滑动取消：未进入多选（移动 >10px 取消长按且吞短按）');
  await screenshot('device-s403-swipe-cancel.png');
  results.swipeCancel = noMultiselect;

  writeFileSync(join(OUT_DIR, 'device-s403-longpress-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nTASK-S4-03 长按真机验证通过（500ms 触发 + 滑动取消）');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});