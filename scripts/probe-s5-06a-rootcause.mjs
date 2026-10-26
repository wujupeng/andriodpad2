/**
 * TASK-S5-06-A 根因证据采集：冷启动首次点卡静默失败复现
 * 方法：force-stop → 启动 → 连接页 → 立即点卡（首点）→ 轮询 18s 状态
 *      + logcat 采集 Preferences 桥调用序列（To native vs callback 回包配对）
 * 跑 3 轮冷启动（首点/次点对照），输出 JSON 证据。
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 单轮冷启动点卡测试；first=true 为首点，false 为次点对照 */
async function coldStartAttempt(round, first) {
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1200);
  adbShell('logcat -c');
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(6500);
  await connectWs();
  // 导航连接页（首屏=工作台；点 SideNav 添加连接）
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find((x) => x.textContent.includes('添加连接')); if (b) b.click(); return 'OK'; })()`);
  await sleep(1300);
  // 等列表卡渲染
  const hasCard = await evalPage(`document.body.innerText.includes('Gate3验证服务器')`);
  if (!hasCard) throw new Error(`round${round}-first${first}: 卡未渲染`);
  // 点卡（el.click 走 onPress）
  const t0 = Date.now();
  await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && e.textContent.includes('Gate3验证服务器')); if (rows.length) rows[0].click(); return 'OK'; })()`);
  // 轮询 18s：连接状态 + connecting + Banner
  let last = null;
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    last = await evalPage(`(() => { const t = document.body.innerText; return JSON.stringify({ connected: t.includes('已连接'), connecting: t.includes('连接中') || t.includes('正在连接'), failed: t.includes('连接失败'), badge: (t.match(/(已连接|未连接|连接中)/) || ['无'])[0] }); })()`);
    const s = JSON.parse(last);
    if (s.connected || s.failed) break;
    await sleep(1000);
  }
  const elapsed = Date.now() - t0;
  // logcat：Preferences 桥调用配对分析
  const pid = adbShell('pidof com.pad2.filemanager').trim();
  const log = adbShell(`logcat -d --pid=${pid} 2>/dev/null | grep -E "Preferences|SmbPlugin" | tail -20`);
  const toNative = (log.match(/To native.*pluginId: Preferences/g) || []).length;
  const callbacks = (log.match(/pluginId: Preferences, methodName: get/g) || []).length;
  const smbCalls = (log.match(/To native.*pluginId: SmbPlugin/g) || []).length;
  return {
    round, attempt: first ? 'first-click' : 'second-click',
    outcome: JSON.parse(last), elapsedMs: elapsed,
    bridge: { preferencesToNative: toNative, preferencesCallbacks: callbacks, smbToNative: smbCalls },
    logTail: log.trim().split('\n').slice(-8),
  };
}

async function main() {
  const results = [];
  // 轮 1：冷启动首点
  results.push(await coldStartAttempt(1, true));
  console.log(`R1 首点: ${JSON.stringify(results[0].outcome)} elapsed=${results[0].elapsedMs}ms bridge=${JSON.stringify(results[0].bridge)}`);
  // 若首点静默：同进程立即次点对照
  if (!results[0].outcome.connected && !results[0].outcome.failed) {
    // 次点（同进程——桥已就绪假设）
    const t0 = Date.now();
    await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && e.textContent.includes('Gate3验证服务器')); if (rows.length) rows[0].click(); return 'OK'; })()`);
    let last = null;
    const deadline = Date.now() + 18000;
    while (Date.now() < deadline) {
      last = await evalPage(`(() => { const t = document.body.innerText; return JSON.stringify({ connected: t.includes('已连接'), failed: t.includes('连接失败') }); })()`);
      if (JSON.parse(last).connected || JSON.parse(last).failed) break;
      await sleep(1000);
    }
    results.push({ round: 1, attempt: 'second-click-same-process', outcome: JSON.parse(last), elapsedMs: Date.now() - t0 });
    console.log(`R1 次点(同进程): ${JSON.stringify(JSON.parse(last))} ${Date.now() - t0}ms`);
  }
  writeFileSync(join(OUT_DIR, 's506a-rootcause.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  adbShell('svc power stayon false');
  console.log('证据采集完成 → shots/s5/s506a-rootcause.json');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});