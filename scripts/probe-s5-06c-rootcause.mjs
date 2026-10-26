/**
 * TASK-S5-06-C 根因证据采集 v2（复用 S5-06-A 已验证骨架：点卡→fallback 表单）
 * 流程：连接→进 gate4-test→断网→面包屑跳根（enterDirectory 失败清空）→
 * 恢复 wifi→重连→【缺陷断言】列表不自动刷新+logcat listDirectory=0→截图归档
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

/** 点连接卡（ListRow 根过滤+宽文本——勿用无过滤 clickEl 点外层容器） */
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

/** 冷启动连接（点卡→重试→fallback 表单——S5-06-A 已验证模式） */
async function coldStartConnect() {
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();
  await clickEl('nav button', '添加连接');
  await sleep(1200);
  await clickCard();
  await sleep(16000);
  let connected = await evalPage(`document.body.innerText.includes('已连接')`);
  if (!connected) {
    await clickCard();
    await sleep(16000);
    connected = await evalPage(`document.body.innerText.includes('已连接')`);
  }
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
  if (!connected) throw new Error('连接失败（三种路径均未成）');
  // 进入 browse
  await evalPage(`(() => { const bs = [...document.querySelectorAll('nav button')].filter((x) => x.textContent.includes('Gate3')); const b = bs[bs.length - 1]; if (b) b.click(); return 'OK'; })()`);
  await sleep(4000);
  // 进 gate4-test（若未在）
  let path = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
  if (!String(path).includes('gate4-test')) {
    await evalPage(`(() => { const rows = [...document.querySelectorAll('[data-file-row]')]; const t = rows.find((x) => (x.textContent || '').includes('gate4-test')); if (!t) return 'NF'; t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); return 'OK'; })()`);
    await sleep(3500);
  }
}

async function state() {
  return JSON.parse(await evalPage(`
    (() => {
      const t = document.body.innerText;
      const nav = document.querySelector('nav[aria-label="路径导航"]');
      return JSON.stringify({
        connected: t.includes('已连接'),
        netInterrupted: t.includes('网络已中断'),
        reconnectBtn: !![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重连'),
        rows: document.querySelectorAll('[data-file-row]').length,
        emptyDir: t.includes('目录为空'),
        path: nav ? nav.textContent.substring(0, 36) : '无nav',
      });
    })()
  `));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const evidence = {};
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');

  console.log('== 1 冷启动连接+进 gate4-test ==');
  await coldStartConnect();
  let st = await state();
  console.log(`  [STAT] 列表就绪: rows=${st.rows} path=${st.path} connected=${st.connected}`);
  if (st.rows === 0) throw new Error('gate4-test 列表为空（前置失败）');
  evidence.beforeOffline = st;
  await screenshot('s506c-1-before-offline.png');

  console.log('== 2 断网+触发目录加载失败 ==');
  adbShell('svc wifi disable');
  await sleep(4000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  // 面包屑根段跳转（触发 enterDirectory→失败→files 清空）
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim().includes('Gate3')); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(24000);
  st = await state();
  console.log(`  [STAT] 断网失败后: rows=${st.rows} netInterrupted=${st.netInterrupted} emptyDir=${st.emptyDir}`);
  evidence.afterOfflineOp = st;
  await screenshot('s506c-2-offline-failed.png');

  console.log('== 3 恢复网络+重连 ==');
  adbShell('svc wifi enable');
  await sleep(18000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('logcat -c');
  // 回到 gate4-test 目录路径（面包屑 gate4-test 段）——保留导航状态（PM 要求）
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim() === 'gate4-test'); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(22000);
  st = await state();
  console.log(`  [STAT] 恢复后回目录: rows=${st.rows} path=${st.path}`);
  const hasReconnect = await evalPage(`!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重连')`);
  if (hasReconnect) {
    await clickEl('button', '重连');
    await sleep(18000);
  }
  st = await state();
  console.log(`  [STAT] 重连后: connected=${st.connected} rows=${st.rows} emptyDir=${st.emptyDir} path=${st.path}`);
  evidence.afterReconnect = st;
  // 等待观察窗口（若自动刷新应在此窗口内发生）
  await sleep(8000);
  st = await state();
  console.log(`  [STAT] +8s 观察窗后: rows=${st.rows}（自动刷新发生了吗）`);
  evidence.afterWaitWindow = st;
  const pid = adbShell('pidof com.pad2.filemanager').trim();
  const listCalls = adbShell(`logcat -d --pid=${pid} 2>/dev/null | grep -c "To native.*SmbPlugin.*listDirectory" || true`).trim();
  console.log(`  [STAT] 重连窗口 listDirectory 调用=${listCalls}（0=零刷新请求——根因证据）`);
  evidence.listDirectoryCalls = listCalls;
  await screenshot('s506c-3-no-auto-refresh.png');

  writeFileSync(join(OUT_DIR, 's506c-rootcause.json'), JSON.stringify({ evidence, ts: new Date().toISOString() }, null, 2));
  console.log('\n根因证据采集完成 → shots/s5/s506c-rootcause.json');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  try { adbShell('svc wifi enable'); } catch {}
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});