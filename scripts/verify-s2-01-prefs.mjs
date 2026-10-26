/**
 * TASK-S2-01 验证脚本：uiPrefsStore 版本化持久化闭环（web 等价通道）
 * 场景 1：合法 v1 值（dark）→ 重载 → 深色恢复（主题偏好重启保持，spec 4.5-4 web 等价）
 * 场景 2：版本不匹配（version 99）→ 重载 → 安全丢弃回浅色（design.md 2.7.2）
 * 场景 3：JSON 损坏 → 重载 → 安全丢弃回浅色
 * 通道：Edge headless + CDP（Node v24 内置 WebSocket，零新增依赖）
 * 前置：vite preview 已运行于 127.0.0.1:4174（npm 产物，含 hydrate/bootstrap 路径）
 */
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CDP_PORT = 9223;
const APP_URL = 'http://127.0.0.1:4174/';
const LS_KEY = 'CapacitorStorage.pad2.prefs.v1';

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
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

async function navigateAndWait(url) {
  await send('Page.navigate', { url });
  await delay(2200);
}

async function reloadAndWait() {
  await send('Page.reload', {});
  await delay(2200);
}

async function readTheme() {
  return evalPage(`document.documentElement.dataset.theme || '(light)'`);
}

async function main() {
  const probe = await fetch(APP_URL, { method: 'HEAD' }).catch(() => null);
  if (!probe) {
    console.error('前置失败：127.0.0.1:4174 未运行，请先 `npx vite preview --host 127.0.0.1 --port 4174`');
    process.exit(1);
  }

  const userDataDir = mkdtempSync(join(tmpdir(), 'pad2-s201-'));
  const edge = spawn(EDGE, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        targets = await res.json();
        if (targets.some((t) => t.type === 'page')) break;
        targets = null;
      } catch { /* 等待 CDP 就绪 */ }
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
    await navigateAndWait(APP_URL);

    const initial = await readTheme();
    record('S0 基线：无持久化时默认浅色', initial === '(light)', `theme=${initial}`);

    // 场景 1：合法 v1 → dark 恢复
    await evalPage(`localStorage.setItem(${JSON.stringify(LS_KEY)}, ${JSON.stringify(JSON.stringify({ version: 1, themeMode: 'dark', sideNavCollapsed: true }))})`);
    await reloadAndWait();
    const s1 = await readTheme();
    record('场景 1：合法 v1(dark) 重载后深色保持', s1 === 'dark', `theme=${s1}`);

    // 场景 2：版本不匹配 → 安全丢弃
    await evalPage(`localStorage.setItem(${JSON.stringify(LS_KEY)}, ${JSON.stringify(JSON.stringify({ version: 99, themeMode: 'dark', sideNavCollapsed: true }))})`);
    await reloadAndWait();
    const s2 = await readTheme();
    record('场景 2：version=99 重载后安全丢弃回浅色', s2 === '(light)', `theme=${s2}`);

    // 场景 3：JSON 损坏 → 安全丢弃
    await evalPage(`localStorage.setItem(${JSON.stringify(LS_KEY)}, '" + "{not-json')`);
    await reloadAndWait();
    const s3 = await readTheme();
    record('场景 3：损坏 JSON 重载后安全丢弃回浅色', s3 === '(light)', `theme=${s3}`);

    // 场景 4（附带）：合法 light 显式覆盖 → 恢复 light（区别于 system 的显式浅色）
    await evalPage(`localStorage.setItem(${JSON.stringify(LS_KEY)}, ${JSON.stringify(JSON.stringify({ version: 1, themeMode: 'light', sideNavCollapsed: false }))})`);
    await reloadAndWait();
    const s4 = await readTheme();
    record('场景 4：显式 light 重载后保持浅色（data-theme="light"，与 system 浅色可区分）', s4 === 'light', `theme=${s4}`);

    await evalPage('localStorage.clear()');
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    try { edge.kill(); } catch { /* 忽略 */ }
    try {
      const pid = edge.pid;
      if (pid) execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } catch { /* 进程可能已退出 */ }
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(failed.length === 0
    ? `\n✓ TASK-S2-01 持久化闭环验证通过（${results.length}/${results.length}）`
    : `\n✗ 验证失败（${failed.length}/${results.length} 失败）`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('脚本异常：', err);
  process.exit(1);
});