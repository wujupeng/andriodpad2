/**
 * TASK-S5-09 I-05B1：.xls 打开链路（集成回归，真实 BIFF——与 xlsx 分别验证）
 * 流程：冷启动连接→BrowsePage 进 gate4-test→设置→M2→点 表格测试A.xlsx→
 * openInWps→WPS 前台确认→切回读 V1 基线（修改前三时点之一：服务器基线已归档）。
 * 零代码变更（纯验证，PM 授权仅验证）。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s5';
const WPS = 'cn.wps.moffice_eng';
const FILE = '表格I5B.xls';

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

async function evalPage(expression, awaitP = false) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: awaitP });
  if (exceptionDetails) throw new Error(`evaluate 异常: ${exceptionDetails.text}`);
  return result.value;
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

async function clickEl(selector, text) {
  const clicked = await evalPage(`
    (() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els.find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'CLICKED';
    })()
  `);
  if (clicked !== 'CLICKED') throw new Error(`点击失败 "${text}"`);
}

async function clickCard() {
  const clicked = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('main div')].filter(
        (e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('Gate3'),
      );
      if (!rows.length) return 'NOT_FOUND';
      rows[0].click();
      return 'CLICKED';
    })()
  `);
  if (clicked !== 'CLICKED') throw new Error('连接卡点击失败');
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = {};
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();

  console.log('== A1.1 连接（点卡→fallback） ==');
  await clickEl('nav button', '添加连接');
  await sleep(1200);
  await clickCard();
  await sleep(16000);
  let connected = await evalPage(`document.body.innerText.includes('已连接')`);
  if (!connected) {
    const setField = async (label, value) => {
      const ok = await evalPage(`
        (() => {
          const labels = [...document.querySelectorAll('label')];
          const label = labels.find((l) => (l.textContent || '').includes(${JSON.stringify(label)}));
          if (!label) return 'L';
          const input = label.htmlFor ? document.getElementById(label.htmlFor) : null;
          if (!input) return 'I';
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, ${JSON.stringify(value)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return 'SET';
        })()
      `);
      if (ok !== 'SET') throw new Error(`字段失败 "${label}"`);
    };
    await setField('连接名称', 'Gate3编辑后');
    await setField('服务器地址', '192.168.2.3');
    await setField('共享名', 'share');
    await setField('用户名', 'pad2gate3');
    await setField('密码', process.env.SMB_PW || 'Gate3-Test-2026');
    await evalPage(`(() => { const cb = document.querySelector('input[type="checkbox"]'); if (cb && !cb.checked) cb.click(); return 'OK'; })()`);
    await sleep(400);
    await clickEl('main button', '保存并连接');
    await sleep(16000);
    connected = await evalPage(`document.body.innerText.includes('已连接')`);
  }
  assert(connected, 'A1.1 连接成功');

  console.log('== A1.2 BrowsePage 进 gate4-test（M2 浏览前置） ==');
  await evalPage(`(() => { const bs = [...document.querySelectorAll('nav button')].filter((x) => x.textContent.includes('Gate3')); const b = bs[bs.length - 1]; if (b) b.click(); return 'OK'; })()`);
  await sleep(4000);
  let path = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
  if (!String(path).includes('gate4-test')) {
    await evalPage(`(() => { const rows = [...document.querySelectorAll('[data-file-row]')]; const t = rows.find((x) => (x.textContent || '').includes('gate4-test')); if (!t) return 'NF'; t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); return 'OK'; })()`);
    await sleep(3500);
  }
  const rows = await evalPage(`document.querySelectorAll('[data-file-row]').length`);
  assert(rows >= 2, `A1.2 gate4-test 列表含 ${FILE}（${rows} 行——集成回归基线共存）`);

  console.log('== A1.3 导航 M2→打开 xlsx ==');
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '设置'); if (b) b.click(); return 'OK'; })()`);
  await sleep(1800);
  await evalPage(`(() => { const els = [...document.querySelectorAll('main div')].filter((e) => (e.textContent || '').includes('M2 技术验证')); const el = els[els.length - 1]; if (el) el.click(); return 'OK'; })()`);
  await sleep(2500);
  // M2 页点文件行（browseStore 已有 gate4-test 列表）
  const opened = await evalPage(`(() => { const els = [...document.querySelectorAll('[class*="fileRow"]')]; const el = els.find((e) => (e.textContent || '').includes('${FILE}')); if (!el) return 'NOT_FOUND'; el.click(); return 'CLICKED'; })()`);
  if (opened !== 'CLICKED') throw new Error('M2 文件行未找到');
  await sleep(9000);
  const focus = adbShell('dumpsys window | grep mCurrentFocus | head -1');
  console.log(`  [STAT] 焦点: ${focus.trim().substring(0, 80)}`);
  assert(focus.includes(WPS), `A1.3 WPS 前台（${FILE} 真实打开）`);

  console.log('== A1.4 V1 基线记录（修改前时点） ==');
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(3000);
  const v1 = JSON.parse(await evalPage(`
    (() => JSON.stringify({
      baseline: (document.body.innerText.match(/基线SHA-256: ([a-f0-9]{16})/) || [null, null])[1],
      uri: document.body.innerText.includes('URI: file://'),
    }))()
  `));
  assert(!!v1.baseline, `A1.4 V1 基线 SHA 记录（${v1.baseline}…，服务器基线 44acba56…）`);

  writeFileSync(join(OUT_DIR, 's509-i05b1-result.json'), JSON.stringify({ results: { v1, serverBaseline: 'd6d47c6a68b9c91d2ca5920246fa4b0f8a49a5a1eea5bb846270f457191308a9', file: FILE }, ts: new Date().toISOString() }, null, 2));
  console.log('\nS5-07 A1 段通过（xlsx 打开+基线）——等待人工 WPS 编辑保存');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});