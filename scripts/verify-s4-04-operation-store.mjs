/**
 * TASK-S4-04 web 等价验证（CDP 驱动演示页"operationStore 状态机自检"区块）
 * 点击自检按钮 → 读 data-opstore-result 容器 JSON → 断言 15 项全过。
 * 取消保留已完成部分（spec 6.5.1-R8）：当前 executor 即时失败无长任务窗口——
 * 数据流就绪，真实取消演练归 S4-05/S4-07（真实长操作/注入）。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CDP_PORT = 9229;
const APP_URL = 'http://127.0.0.1:4176/#gallery';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s4';

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

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'pad2-s404-'));
  const edge = spawn(EDGE, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--no-proxy-server',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
    '--window-size=1280,900', 'about:blank',
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
    await send('Page.navigate', { url: APP_URL });
    await delay(2400);

    console.log('== 自检区块就绪 ==');
    const blockOk = await evalPage(`document.body.innerText.includes('operationStore 状态机自检')`);
    assert(blockOk, '演示页自检区块渲染');

    console.log('== 点击运行自检 ==');
    const clicked = await evalPage(`
      (() => {
        const cards = [...document.querySelectorAll('section')];
        const card = cards.find((c) => (c.textContent || '').includes('operationStore 状态机自检'));
        if (!card) return 'NOT_FOUND';
        const btn = [...card.querySelectorAll('button')].find((b) => b.textContent.includes('运行状态机自检'));
        if (!btn) return 'NO_BTN';
        btn.click();
        return 'CLICKED';
      })()
    `);
    if (clicked !== 'CLICKED') throw new Error(`自检按钮点击失败: ${clicked}`);
    await delay(1200);

    const raw = await evalPage(`document.querySelector('[data-opstore-result]')?.textContent ?? 'EMPTY'`);
    if (raw === 'EMPTY') throw new Error('自检结果容器为空');
    const result = JSON.parse(raw);
    assert(result.pass === result.total, `自检 ${result.pass}/${result.total} 项全过`);
    result.items.forEach((item) => {
      if (!item.startsWith('PASS')) console.log(`  [FAIL-DETAIL] ${item}`);
    });
    console.log('  自检项：');
    result.items.forEach((item) => console.log(`    ${item}`));

    writeFileSync(join(OUT_DIR, 'opstore-s404-result.json'), JSON.stringify({ ...result, ts: new Date().toISOString() }, null, 2));
    console.log('\nTASK-S4-04 web 等价验证全部通过');
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    edge.kill();
    await delay(1200);
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});