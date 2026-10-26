/**
 * TASK-S2-03 补充验证：窄屏抽屉打开态（CDP 模拟点击菜单触发按钮）
 * 500px 视口 → 点击 TopBar 菜单按钮 → 抽屉滑出 + 遮罩出现 → 截图归档
 */
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CDP_PORT = 9224;
const APP_URL = 'http://127.0.0.1:4174/#shell';
const OUT = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s2/shell-drawer-open-500.png';

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

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'pad2-s203-'));
  const edge = spawn(EDGE, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
    '--window-size=500,800', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        targets = await res.json();
        if (targets.some((t) => t.type === 'page')) break;
        targets = null;
      } catch { /* 等待 */ }
      await delay(500);
    }
    if (!targets) throw new Error('CDP 未就绪');
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
    await send('Emulation.setDeviceMetricsOverride', {
      width: 500, height: 800, deviceScaleFactor: 1, mobile: false,
    });
    await send('Page.navigate', { url: APP_URL });
    await delay(2200);

    const clicked = await evalPage(`
      (() => {
        const btn = document.querySelector('button[aria-label="打开导航菜单"]');
        if (!btn) return 'TRIGGER_NOT_FOUND';
        btn.click();
        return 'CLICKED';
      })()
    `);
    if (clicked !== 'CLICKED') throw new Error(`菜单按钮点击失败: ${clicked}`);
    await delay(600);

    const navVisible = await evalPage(`
      (() => {
        const nav = document.querySelector('nav');
        if (!nav) return 'NAV_NOT_FOUND';
        const rect = nav.getBoundingClientRect();
        return JSON.stringify({ left: Math.round(rect.left), width: Math.round(rect.width), transform: getComputedStyle(nav).transform });
      })()
    `);
    console.log('抽屉状态:', navVisible);

    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(OUT, Buffer.from(data, 'base64'));
    console.log(`✓ 抽屉打开态截图已归档: ${OUT}`);
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    try { edge.kill(); } catch { /* 忽略 */ }
    try {
      const pid = edge.pid;
      if (pid) execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } catch { /* 忽略 */ }
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }
}

main().catch((err) => {
  console.error('脚本异常：', err);
  process.exit(1);
});