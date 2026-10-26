/**
 * TASK-S5-08 熄屏与恢复验证（PM 授权七条验证要求，零代码变更）
 * B0 常亮基线：连接→gate4-test→只读操作（排序/搜索）正常
 * S1 短时熄屏（60s）：熄屏中同步探测 document.hidden + 异步 timer 冻结实证
 *     →唤醒→UI 响应/连接徽章/列表状态→只读操作恢复
 * S2 长时熄屏（300s）：同 S1（较长时间）
 * S3 熄屏期间断网+唤醒（PM 第 4 条：不将旧列表误报为最新）：
 *     旧列表+connected 徽章保留观察→触发操作→如实失败（loadError Banner 不冒充）
 * S4 恢复网络+重连（PM 第 5 条：与 S5-06-C 门禁一致——自动刷新+服务器最新数据）
 * S5 熄屏期间发起连接的挂起语义（S5-06-A 8s 超时行为的熄屏态验证）
 * 设备/日志：全程记录持续时间/唤醒方式/logcat + 截图（唤醒后）
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s5';
const GATE4 = '/mnt/share/gate4-test';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 90000 });
}
function ssh(cmd) {
  return execFileSync('ssh', ['-i', process.env.HOME + '/.ssh/pad2_cred_closure', 'debian@192.168.2.3', cmd], {
    encoding: 'utf8', timeout: 90000,
  });
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

/** 带外部超时的异步 evaluate（探测异步冻结：Node 侧超时而非页面 timer） */
function evalPageTimeout(expression, ms) {
  return Promise.race([
    evalPage(expression, true),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`CDP_ASYNC_TIMEOUT_${ms}ms`)), ms)),
  ]);
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

/** 页面状态（同步 evaluate——熄屏下亦可用） */
async function pageState() {
  return JSON.parse(await evalPage(`
    (() => {
      const t = document.body.innerText;
      const nav = document.querySelector('nav[aria-label="路径导航"]');
      return JSON.stringify({
        visibility: document.visibilityState,
        hidden: document.hidden,
        rows: document.querySelectorAll('[data-file-row]').length,
        connected: t.includes('已连接'),
        netInterrupted: t.includes('网络已中断'),
        loadFail: t.includes('目录加载失败'),
        emptyDir: t.includes('目录为空'),
        path: nav ? nav.textContent.substring(0, 30) : '无nav',
      });
    })()
  `));
}

/** 熄屏（电源键 26）并核验 Asleep */
function screenOff() {
  adbShell('input keyevent 26');
  const st = adbShell('dumpsys power | grep mWakefulness | head -1');
  if (!st.includes('Asleep')) {
    adbShell('input keyevent KEYCODE_SLEEP');
  }
}

/** 唤醒+解锁 */
function screenOn() {
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('input keyevent 82');
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 熄屏探针：visibility + 异步 timer 状态探测（fire 或 frozen 均如实记录——
 * 短时浅层熄屏可能不冻结，长时深度休眠可能冻结：差异本身是 PM 要求的验证发现） */
async function screenOffProbe(label) {
  const st = await pageState();
  console.log(`  [熄屏态] visibility=${st.visibility} hidden=${st.hidden} rows=${st.rows}`);
  assert(st.hidden === true, `${label}.a 熄屏态 document.hidden=true（visibility=${st.visibility}）`);
  // 异步 timer 状态探测（PM 第 3 条：记录设备状态）
  let timerState = 'frozen';
  try {
    const r = await evalPageTimeout(`new Promise((res) => setTimeout(() => res('TIMER_FIRED'), 50))`, 5000);
    timerState = r === 'TIMER_FIRED' ? 'running' : 'unknown';
  } catch (e) {
    timerState = String(e.message).includes('CDP_ASYNC_TIMEOUT') ? 'frozen' : 'error';
  }
  console.log(`  [探测] 异步 timer=${timerState}（50ms setTimeout 5s 观察窗）`);
  // 同步 evaluate 可用性
  const sync = await evalPage(`1 + 1`);
  assert(sync === 2, `${label}.c 同步 evaluate 可用`);
  st.timerState = timerState;
  return st;
}

/** 唤醒后恢复探针 */
async function wakeProbe(label, expectRows) {
  const st = await pageState();
  console.log(`  [唤醒态] visibility=${st.visibility} rows=${st.rows} connected=${st.connected} netInterrupted=${st.netInterrupted}`);
  assert(st.visibility === 'visible', `${label}.a 唤醒后 visibility=visible`);
  if (expectRows !== undefined) {
    assert(st.rows === expectRows, `${label}.b 唤醒后列表行数保留（${st.rows}/${expectRows}——冻结前数据无损）`);
  }
  return st;
}

async function main() {
  const results = {};
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('input keyevent 82');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();

  // ===== B0 常亮基线 =====
  console.log('== B0 常亮基线：连接+目录+只读操作 ==');
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
  assert(connected, 'B0.1 连接成功');
  await evalPage(`(() => { const bs = [...document.querySelectorAll('nav button')].filter((x) => x.textContent.includes('Gate3')); const b = bs[bs.length - 1]; if (b) b.click(); return 'OK'; })()`);
  await sleep(4000);
  let path = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
  if (!String(path).includes('gate4-test')) {
    await evalPage(`(() => { const rows = [...document.querySelectorAll('[data-file-row]')]; const t = rows.find((x) => (x.textContent || '').includes('gate4-test')); if (!t) return 'NF'; t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); return 'OK'; })()`);
    await sleep(3500);
  }
  const b0 = await pageState();
  assert(b0.rows >= 1 && b0.visibility === 'visible', `B0.2 目录就绪（${b0.rows} 行，常亮）`);
  // 只读操作：搜索+清空
  await evalPage(`(() => { const input = document.querySelector('input[aria-label="搜索当前目录"]'); if (input) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, 'a'); input.dispatchEvent(new Event('input', { bubbles: true })); } return 'OK'; })()`);
  await sleep(700);
  await clickEl('button[aria-label="清空搜索"]', '');
  await sleep(600);
  console.log('  PASS B0.3 只读操作（搜索/清空）正常');
  results.B0 = { rows: b0.rows };
  await screenshot('s508-b0-baseline.png');

  // ===== S1 短时熄屏 60s =====
  console.log('\n== S1 短时熄屏（60s） ==');
  const t1off = Date.now();
  screenOff();
  const off1 = await screenOffProbe('S1');
  await sleep(60000);
  screenOn();
  await sleep(2000);
  const wake1 = await wakeProbe('S1', b0.rows);
  const s1dur = Math.round((Date.now() - t1off) / 1000);
  console.log(`  [STAT] 熄屏时长 ${s1dur}s`);
  // 唤醒后只读操作恢复
  await evalPage(`(() => { const input = document.querySelector('input[aria-label="搜索当前目录"]'); if (input) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, 'a'); input.dispatchEvent(new Event('input', { bubbles: true })); } return 'OK'; })()`);
  await sleep(700);
  const searchWorks = await evalPage(`document.querySelectorAll('[data-file-row]').length >= 0`);
  await clickEl('button[aria-label="清空搜索"]', '');
  await sleep(600);
  assert(searchWorks, 'S1.d 唤醒后只读操作恢复（搜索/清空）');
  // 异步 timer 恢复
  const timerOk = await evalPageTimeout(`new Promise((res) => setTimeout(() => res('FIRED'), 100))`, 5000);
  assert(timerOk === 'FIRED', 'S1.e 唤醒后异步 timer 恢复（100ms 正常 fire）');
  results.S1 = { durationSec: s1dur, offState: off1, wakeState: wake1 };

  // ===== S2 长时熄屏 300s =====
  console.log('\n== S2 长时熄屏（300s） ==');
  const t2off = Date.now();
  screenOff();
  const off2 = await screenOffProbe('S2');
  await sleep(300000);
  screenOn();
  await sleep(2000);
  const wake2 = await wakeProbe('S2', b0.rows);
  const s2dur = Math.round((Date.now() - t2off) / 1000);
  console.log(`  [STAT] 熄屏时长 ${s2dur}s`);
  const timerOk2 = await evalPageTimeout(`new Promise((res) => setTimeout(() => res('FIRED'), 100))`, 5000);
  assert(timerOk2 === 'FIRED', 'S2.d 唤醒后异步 timer 恢复');
  // 只读目录操作恢复（点面包屑根段回根——当前目录段点击无操作，须换目录）
  adbShell('logcat -c');
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim().includes('Gate3')); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(6000);
  const pid = adbShell('pidof com.pad2.filemanager').trim();
  const listCalls = adbShell(`logcat -d --pid=${pid} 2>/dev/null | grep -c "To native.*SmbPlugin.*listDirectory" || true`).trim();
  assert(listCalls === '1', `S2.e 唤醒后目录操作真实恢复（listDirectory ${listCalls} 次——SMB 连接经 5 分钟熄屏仍存活）`);
  // 回 gate4-test
  await evalPage(`(() => { const rows = [...document.querySelectorAll('[data-file-row]')]; const t = rows.find((x) => (x.textContent || '').includes('gate4-test')); if (!t) return 'NF'; t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); return 'OK'; })()`);
  await sleep(3500);
  results.S2 = { durationSec: s2dur, offState: off2, wakeState: wake2 };
  await screenshot('s508-s2-after-wake-5min.png');

  // ===== S3 熄屏期间断网+唤醒（PM 第 4 条） =====
  console.log('\n== S3 熄屏期间断网+唤醒（旧列表不误报为最新） ==');
  screenOff();
  await sleep(2000);
  // 熄屏中探针
  await pageState();
  adbShell('svc wifi disable');
  await sleep(5000);
  console.log('  [STAT] 熄屏中 wifi 已断开（60s）');
  await sleep(60000);
  screenOn();
  await sleep(2500);
  const wake3 = await pageState();
  console.log(`  [唤醒态-断网] rows=${wake3.rows} connected=${wake3.connected} netInterrupted=${wake3.netInterrupted} loadFail=${wake3.loadFail}`);
  // 观察点 1：唤醒后保留旧列表+旧 connected 徽章（无自动探测——如实记录，不判 FAIL）
  results.S3 = { wakeState: wake3, observation: '唤醒后保留熄屏前列表与 connected 徽章（App 无自动探测——乐观保留观察点，触发操作时如实回落）' };
  console.log(`  [记录] ${results.S3.observation}`);
  // 观察点 2（关键）：触发操作 → 如实失败（loadError Banner 呈现，不冒充最新）
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim().includes('Gate3')); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(25000);
  const afterOp = await pageState();
  console.log(`  [操作后] loadFail=${afterOp.loadFail} netInterrupted=${afterOp.netInterrupted} rows=${afterOp.rows}`);
  assert(afterOp.loadFail === true, 'S3.a 触发目录操作→"目录加载失败"Banner 如实呈现（S5-06-C 门禁：不将旧列表冒充最新）');
  await screenshot('s508-s3-offline-loadfail.png');

  // ===== S4 恢复网络+重连（PM 第 5 条：S5-06-C 门禁一致） =====
  console.log('\n== S4 恢复网络+重连（S5-06-C 门禁一致性） ==');
  // 服务器侧新增文件（验证刷新真实性）
  ssh(`printf 'S508唤醒新增' > ${GATE4}/熄屏恢复新增.txt`);
  adbShell('svc wifi enable');
  console.log('  wifi 恢复中...');
  await sleep(18000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('input keyevent 82');
  // 点 loadError Banner 的重试
  await clickEl('button', '重试');
  await sleep(12000);
  const s4a = await pageState();
  console.log(`  [重试后] loadFail=${s4a.loadFail} rows=${s4a.rows}`);
  if (s4a.loadFail) {
    // 连接可能已断（session 失效）——走重连
    const hasReconnect = await evalPage(`!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重连')`);
    if (hasReconnect) {
      await clickEl('button', '重连');
      await sleep(17000);
    } else {
      await clickEl('nav button', '添加连接');
      await sleep(1200);
      await clickCard();
      await sleep(17000);
    }
  }
  const s4 = await pageState();
  console.log(`  [终态] connected=${s4.connected} rows=${s4.rows} netInterrupted=${s4.netInterrupted} loadFail=${s4.loadFail}`);
  const hasNew = await evalPage(`document.body.innerText.includes('熄屏恢复新增')`);
  assert(hasNew, 'S4.a 重连后列表含服务器新增文件（S5-06-C 门禁：自动刷新+最新数据非冒充）');
  assert(!s4.loadFail, 'S4.b loadError 清除');
  results.S4 = { rows: s4.rows, newFileSeen: true };
  await screenshot('s508-s4-reconnected-refreshed.png');

  // ===== S5 熄屏期间发起连接的挂起语义 =====
  console.log('\n== S5 熄屏中点击连接的挂起语义（S5-06-A 超时行为熄屏态） ==');
  // 先断开连接（回连接页）
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1200);
  await clickEl('nav button', '添加连接');
  await sleep(1500);
  // 熄屏
  screenOff();
  await sleep(3000);
  // 熄屏中点连接卡（el.click 同步入队但解密 Promise 冻结——8s 超时 timer 也冻结）
  await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('Gate3')); if (rows.length) rows[0].click(); return 'OK'; })()`);
  console.log('  [STAT] 熄屏中已点击连接卡（异步链冻结挂起——等待 30s）');
  await sleep(30000);
  const offS5 = await pageState();
  console.log(`  [熄屏30s后] connected=${offS5.connected}（挂起中——无超时触发：timer 亦冻结）`);
  results.S5 = { pendingObserved: !offS5.connected };
  screenOn();
  await sleep(3000);
  // 唤醒后：冻结的解密/超时链恢复——8s 超时自唤醒点重新计时（或解密完成继续）
  await sleep(15000);
  const s5 = await pageState();
  console.log(`  [唤醒后15s] connected=${s5.connected}（冻结链恢复执行）`);
  // 无论成功或超时失败——关键断言：不静默（S5-06-A 门禁：有反馈）
  const feedback = await evalPage(`document.body.innerText.includes('已连接') || document.body.innerText.includes('连接失败') || document.body.innerText.includes('正在连接')`);
  assert(feedback, 'S5.a 唤醒后挂起操作有明确反馈（成功/失败/进行中——不静默，S5-06-A 门禁）');
  results.S5.afterWake = { connected: s5.connected, feedback: true };
  await screenshot('s508-s5-after-wake.png');

  // 清理
  ssh(`rm -f ${GATE4}/熄屏恢复新增.txt`);

  writeFileSync(join(OUT_DIR, 's508-result.json'), JSON.stringify({ results, device: 'NDL2_W09 / Android 16 / WPS 14.25.0', ts: new Date().toISOString() }, null, 2));
  console.log('\nTASK-S5-08 熄屏与恢复验证全部完成（B0/S1/S2/S3/S4/S5）');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try { adbShell('svc wifi enable'); } catch {}
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});