/**
 * TASK-S2-05 验证：M2 迁移第一阶段（web 等价通道）
 * 1) SideNav 不再含 M2 入口（产品界面不暴露验证工具）
 * 2) 设置 → 开发者选项 → M2 技术验证 路径可达
 * 3) M2 页迁移后全区块渲染（连接卡 / V1-V7 门禁表 / 操作日志）
 * 4) 连接逻辑走 store：web 无插件实现 → 连接失败呈现（错误横幅 + 日志，不伪报已连接）
 * 5) 全程无未捕获异常
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CDP_PORT = 9225;
const APP_URL = 'http://127.0.0.1:4174/';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s2';

let ws;
let msgId = 0;
const pending = new Map();
const consoleErrors = [];
const pageExceptions = [];

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

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'pad2-s205-'));
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
      } else if (msg.method === 'Runtime.exceptionThrown') {
        pageExceptions.push(msg.params.exceptionDetails?.text ?? 'unknown');
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await send('Page.navigate', { url: APP_URL });
    await delay(2200);

    console.log('== A1 首页与 SideNav ==');
    const homeOk = await evalPage(`document.body.innerText.includes('工作台')`);
    assert(homeOk, '首页（工作台）渲染');
    const navHasM2 = await evalPage(`
      [...document.querySelectorAll('nav button')].some((b) => b.textContent.includes('M2 技术验证'))
    `);
    assert(!navHasM2, 'SideNav 不含 M2 入口（仅开发者选项可达）');

    console.log('== A2 设置 → 开发者选项 ==');
    await clickByText('nav button', '设置');
    await delay(600);
    const settingsOk = await evalPage(`
      document.body.innerText.includes('开发者选项') && document.body.innerText.includes('M2 技术验证')
    `);
    assert(settingsOk, '设置页呈现开发者选项 + M2 技术验证入口');
    await screenshot('settings-1280.png');

    console.log('== A3 M2 页迁移后渲染 ==');
    await clickByText('main [role="button"]', 'M2 技术验证');
    await delay(800);
    const m2Check = await evalPage(`
      (() => {
        const t = document.body.innerText;
        const stepRows = ['V1','V2','V3','V4','V5','V6','V7'].every((id) => t.includes(id));
        return JSON.stringify({
          title: t.includes('大总理文件管理'),
          connCard: t.includes('SMB 连接'),
          gateTable: t.includes('V1-V7 验证门禁') && stepRows,
          logCard: t.includes('操作日志'),
          browseHidden: !t.includes('文件浏览'),
        });
      })()
    `);
    const m2 = JSON.parse(m2Check);
    assert(m2.title, 'M2 页标题渲染');
    assert(m2.connCard, 'SMB 连接卡片渲染');
    assert(m2.gateTable, 'V1-V7 门禁表 7 行渲染');
    assert(m2.logCard, '操作日志卡片渲染');
    assert(m2.browseHidden, '未连接时文件浏览区隐藏');
    await screenshot('m2-verification-1280.png');

    console.log('== A4 连接失败路径（store 迁移后，web 无插件实现） ==');
    await clickByText('main button', '连接');
    await delay(2500);
    const failCheck = await evalPage(`
      (() => {
        const t = document.body.innerText;
        const banner = document.querySelector('[role="alert"]');
        return JSON.stringify({
          connectFailLog: t.includes('连接失败'),
          errorBanner: !!banner && banner.textContent.length > 0,
          notConnectedBadge: !t.includes('已连接'),
          stillOperable: t.includes('V1-V7 验证门禁'),
        });
      })()
    `);
    const fail = JSON.parse(failCheck);
    assert(fail.connectFailLog, '操作日志记录连接失败');
    assert(fail.errorBanner, '错误横幅呈现失败原因（不伪报成功）');
    assert(fail.notConnectedBadge, '未呈现已连接徽章');
    assert(fail.stillOperable, '页面其余区块仍可用');
    await screenshot('m2-connect-failed-1280.png');

    console.log('== A5 渲染健康 ==');
    assert(pageExceptions.length === 0, `无未捕获异常${pageExceptions.length ? `: ${pageExceptions.join(' | ')}` : ''}`);
    if (consoleErrors.length > 0) {
      console.log(`  [INFO] console.error ${consoleErrors.length} 条（多为 web 无插件实现预期噪音）:`);
      consoleErrors.slice(0, 5).forEach((e) => console.log(`    - ${e.substring(0, 160)}`));
    }

    console.log('\nTASK-S2-05 验证全部通过');
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    edge.kill();
    await delay(1200);
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch { /* Windows 句柄延迟释放，忽略残留 */ }
  }
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});
