/**
 * TASK-S5-01 C1 段正式版：真实用户路径 WPS 打开（子目录文件）
 * 前置：服务器 gate4-test/年度报告.docx 为真实 OOXML 基线。
 * 流程：连接→BrowsePage 进 gate4-test→M2→点文件→WPS 前台+V1 基线。
 * 交互：按钮 el.click()；文件行 PointerEvent dispatch（useLongPress 链路）。
 * 通道说明：CDP touch 在重装后 WebView 实例失效（通道差异，见验收表）。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s5';
const WPS = 'cn.wps.moffice_eng';

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

/** PointerEvent dispatch 行按压（useLongPress onPress→目录进入） */
async function pressRow(rowText) {
  const r = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('[data-file-row]')];
      const target = rows.find((x) => (x.textContent || '').includes(${JSON.stringify(rowText)}));
      if (!target) return 'NOT_FOUND';
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }));
      return 'PRESSED';
    })()
  `);
  if (r !== 'PRESSED') throw new Error(`行按压失败 "${rowText}"`);
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();

  console.log('== C1.1 连接（点卡→表单 fallback） ==');
  await clickEl('nav button', '添加连接');
  await sleep(1200);
  await clickEl('main div', 'Gate3验证服务器');
  await sleep(15000);
  let connected = await evalPage(`document.body.innerText.includes('已连接')`);
  if (!connected) {
    console.log('  [FALLBACK] 点卡静默失败（观察项）→表单路径');
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
    await setField('连接名称', 'Gate3验证服务器');
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
  assert(connected, 'C1.1 连接成功');

  console.log('== C1.2 BrowsePage→gate4-test ==');
  await evalPage(`(() => { const bs = [...document.querySelectorAll('nav button')].filter((x) => x.textContent.includes('Gate3验证服务器')); const b = bs[bs.length - 1]; if (b) b.click(); return 'OK'; })()`);
  await sleep(3500);
  const curPath = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
  if (!String(curPath).includes('gate4-test')) {
    await pressRow('gate4-test');
    await sleep(3500);
  }
  const rows = await evalPage(`document.querySelectorAll('[data-file-row]').length`);
  assert(rows === 4, `C1.2 gate4-test（4 行）`);

  console.log('== C1.3 M2→打开子目录文件 ==');
  await clickEl('nav button', '设置');
  await sleep(1800);
  await evalPage(`(() => { const els = [...document.querySelectorAll('main div')].filter((e) => (e.textContent || '').includes('M2 技术验证')); const el = els[els.length - 1]; if (el) el.click(); return 'OK'; })()`);
  await sleep(2500);
  await evalPage(`(() => { const els = [...document.querySelectorAll('[class*="fileRow"]')]; const el = els.find((e) => (e.textContent || '').includes('年度报告.docx')); if (!el) return 'NOT_FOUND'; el.click(); return 'CLICKED'; })()`);
  await sleep(9000);
  const focus = adbShell('dumpsys window | grep mCurrentFocus | head -1');
  console.log(`  [STAT] 焦点: ${focus.trim().substring(0, 80)}`);
  assert(focus.includes(WPS), 'C1.3 WPS 前台（子目录文件真实打开）');

  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(3000);
  const v1 = JSON.parse(await evalPage(`
    (() => JSON.stringify({
      baseline: (document.body.innerText.match(/基线SHA-256: ([a-f0-9]{16})/) || [null, null])[1],
    }))()
  `));
  assert(!!v1.baseline, `C1.3 V1 基线 SHA 记录（${v1.baseline}…）`);

  writeFileSync(join(OUT_DIR, 's501-c1-result.json'), JSON.stringify({ wpsOk: true, v1, ts: new Date().toISOString() }, null, 2));
  console.log('\nS5-01 C1 段通过');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});