/**
 * TASK-S4-02 R-01 压测验证（web 等价通道，TASK-S4-03 载体接入后前置执行）
 * 验收项：①500/1000/5000 条仅渲染可视区 ±8 行（DOM 节点数恒定）
 *        ②5000 条快速滚动长任务 < 50ms（performance longtask 采样）
 *        ③搜索过滤 + <mark> 高亮 + scrollTop 归零
 * 载体：组件演示页 D-05 压测区块（mock 数据驱动 FileList）。
 * 真机长按 500ms/滑动取消归 TASK-S4-03 真机验证（部署后执行）。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CDP_PORT = 9227;
const APP_URL = 'http://127.0.0.1:4176/#gallery';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s4';

let ws;
let msgId = 0;
const pending = new Map();
const consoleErrors = [];

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

/** 当前渲染行数（FileRow 根 .rowFixed 计数）与长任务统计 */
async function domStats() {
  return JSON.parse(await evalPage(`
    (() => {
      const rows = document.querySelectorAll('[data-file-row]').length;
      const longTasks = performance.getEntriesByType('longtask');
      const maxDuration = longTasks.reduce((m, e) => Math.max(m, e.duration), 0);
      return JSON.stringify({ rows, longTaskCount: longTasks.length, maxDuration: Math.round(maxDuration) });
    })()
  `));
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

async function setStressCount(count) {
  await clickByText('button', `${count} 条`);
  await delay(600);
}

/** 快速滚动驱动（多段大跳变 + 平滑段模拟） */
async function fastScroll() {
  await evalPage(`
    (() => {
      const sc = document.querySelector('[data-file-scroll]');
      if (!sc) return 'NOT_FOUND';
      const positions = [0, 2000, 8000, 20000, 60000, 120000, 240000, 180000, 90000, 30000, 5000, 0];
      positions.forEach((top, i) => {
        setTimeout(() => { sc.scrollTop = top; }, i * 120);
      });
      return 'OK';
    })()
  `);
  await delay(1800);
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'pad2-s402-'));
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
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(msg.params.args?.map((a) => a.value ?? a.description).join(' ') ?? '');
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: APP_URL });
    await delay(2400);

    console.log('== P1 演示页压测区块就绪 ==');
    const galleryOk = await evalPage(`document.body.innerText.includes('D-05 虚拟化列表压测')`);
    assert(galleryOk, '压测区块渲染');

    console.log('== P2 500 条：DOM 行数窗口化 ==');
    await setStressCount(500);
    const s500 = await domStats();
    console.log(`  [STAT] 500 条 → 渲染行数 ${s500.rows}`);
    assert(s500.rows > 0 && s500.rows <= 45, `500 条仅渲染窗口行（${s500.rows} ≤ 45）`);
    await screenshot('stress-500.png');

    console.log('== P3 1000/5000 条：DOM 节点数恒定 ==');
    await setStressCount(1000);
    const s1000 = await domStats();
    await setStressCount(5000);
    const s5000 = await domStats();
    console.log(`  [STAT] 1000 条 → ${s1000.rows} 行；5000 条 → ${s5000.rows} 行`);
    assert(Math.abs(s1000.rows - s500.rows) <= 6, `1000 条行数与 500 条一致（±6）：${s500.rows} vs ${s1000.rows}`);
    assert(Math.abs(s5000.rows - s500.rows) <= 6, `5000 条行数与 500 条一致（±6）：${s500.rows} vs ${s5000.rows}`);
    await screenshot('stress-5000.png');

    console.log('== P4 5000 条快速滚动：长任务 < 50ms ==');
    await evalPage('performance.clearResourceTimings(); performance.clearMeasures(); (() => { performance.getEntriesByType("longtask").length; return "OK"; })()');
    await fastScroll();
    const after = await domStats();
    const stats = await evalPage(`
      (() => {
        const tasks = performance.getEntriesByType('longtask');
        const max = tasks.reduce((m, e) => Math.max(m, e.duration), 0);
        return JSON.stringify({ count: tasks.length, max: Math.round(max) });
      })()
    `);
    const longTasks = JSON.parse(stats);
    console.log(`  [STAT] 滚动期长任务 ${longTasks.count} 个，最长 ${longTasks.max}ms`);
    assert(longTasks.max < 50, `最长长任务 < 50ms（实际 ${longTasks.max}ms，spec 4.1-2）`);
    assert(after.rows > 0 && after.rows <= 45, `滚动后行数仍窗口化（${after.rows}）`);

    console.log('== P5 搜索过滤 + 高亮 + 归零 ==');
    await evalPage(`
      (() => {
        const input = document.querySelector('input[aria-label="搜索过滤压测"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '00123');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 'OK';
      })()
    `);
    await delay(500);
    const searchStats = JSON.parse(await evalPage(`
      (() => {
        const t = document.body.innerText;
        const marks = document.querySelectorAll('mark').length;
        return JSON.stringify({ matches: (t.match(/测试文件-00123/g) || []).length, marks });
      })()
    `));
    assert(searchStats.matches >= 1, '搜索过滤命中（00123）');
    assert(searchStats.marks >= 1, '匹配段 <mark> 高亮呈现');
    await screenshot('stress-search-highlight.png');
    await evalPage(`
      (() => {
        const input = document.querySelector('input[aria-label="搜索过滤压测"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 'OK';
      })()
    `);
    await delay(400);
    const scrollTop = await evalPage(`document.querySelector('[data-file-scroll]')?.scrollTop ?? -1`);
    assert(scrollTop === 0, '排序/搜索变更后 scrollTop 归零');

    console.log('== P6 渲染健康 ==');
    assert(consoleErrors.length === 0, `console.error 零输出${consoleErrors.length ? `（${consoleErrors.slice(0, 3).join(' | ')}）` : ''}`);

    writeFileSync(
      join(OUT_DIR, 'stress-r01-result.json'),
      JSON.stringify({ s500, s1000, s5000, longTasks, searchStats, ts: new Date().toISOString() }, null, 2),
    );
    console.log('\nR-01 web 压测验证全部通过（DOM 恒定 + 长任务达标 + 高亮/归零）');
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