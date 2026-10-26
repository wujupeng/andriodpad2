/**
 * TASK-S3-05 阶段 B：G3-05b 重启恢复 + G3-04 断网/恢复重连 + G3-07 删除确认
 * 前置：阶段 A2 已保存 profile 并连接成功。
 * 断网注入：adb svc wifi disable（真机网络中断）→ 列表卡点连接 → 失败反馈；
 * 恢复：svc wifi enable → 等 DHCP → 重新连接 → 成功。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s3';
const HOST = process.env.SMB_HOST ?? '192.168.2.3';
const SHARE = process.env.SMB_SHARE ?? 'share';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 60000 });
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

/** 点击列表卡根（ListRow 根：class 含 row 且不含 row__；卡面不含用户名，按序号定位） */
async function clickProfileCard(name, index = 0) {
  const clicked = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('main div')].filter(
        (e) => String(e.className).includes('row') && !String(e.className).includes('row__') && e.textContent.includes(${JSON.stringify(name)}),
      );
      const target = rows[${index}];
      if (!target) return 'NOT_FOUND(' + rows.length + ')';
      target.click();
      return 'CLICKED';
    })()
  `);
  if (!clicked.startsWith('CLICKED')) throw new Error(`列表卡点击失败 "${name}[${index}]": ${clicked}`);
}

async function connectWs() {
  const unix = adbShell("cat /proc/net/unix | grep webview_devtools_remote | head -1");
  const m = unix.match(/webview_devtools_remote_(\d+)/);
  if (!m) throw new Error('未找到 WebView devtools socket');
  execFileSync(ADB, ['-s', DEVICE, 'forward', 'tcp:9222', `localabstract:webview_devtools_remote_${m[1]}`]);
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('CDP 页面未找到');
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

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = {};
  console.log('== B0 重启 App（force-stop 冷启动） ==');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(6000);
  await connectWs();

  console.log('== G3-05b 重启恢复：连接页列表持久化 ==');
  await clickByText('nav button', '添加连接');
  await sleep(900);
  const restored = JSON.parse(await evalPage(`
    (() => {
      const t = document.body.innerText;
      const cards = [...document.querySelectorAll('main [class*="row"], main [role="button"], main div')].filter((e) => e.textContent.includes('${HOST} / ${SHARE}'));
      return JSON.stringify({
        listCard: t.includes('已保存的连接') && t.includes('${HOST} / ${SHARE}'),
        notConnected: t.includes('未连接') && !t.includes('已连接'),
        cardCount: document.body.innerText.split('${HOST} / ${SHARE}').length - 1,
      });
    })()
  `));
  assert(restored.listCard, '重启后已保存连接恢复呈现（spec 5.3.1-R3）');
  assert(restored.notConnected, '重启后状态为未连接（不伪报已连接）');
  results.restored = restored;
  await screenshot('device-g3-05-restart-restored.png');

  console.log('== G3-04a 断网注入（svc wifi disable） ==');
  adbShell('svc wifi disable');
  await sleep(4000);
  console.log('== G3-04b 断网下发起连接（列表卡点击） ==');
  await clickProfileCard('Gate3验证服务器', 1);
  await sleep(35000);
  const offline = JSON.parse(await evalPage(`
    (() => {
      const t = document.body.innerText;
      const i = t.indexOf('连接失败：');
      return JSON.stringify({
        failBanner: i >= 0 ? t.substring(i, i + 30) : '无',
        noConnected: !t.includes('已连接'),
        appAlive: !!document.querySelector('nav'),
      });
    })()
  `));
  assert(offline.failBanner !== '无', `断网连接失败 Banner 呈现（${offline.failBanner}）`);
  assert(offline.noConnected, '断网下未伪报已连接');
  assert(offline.appAlive, 'App 存活无崩溃');
  await screenshot('device-g3-04-wifi-off-failed.png');
  results.offline = offline;

  console.log('== G3-04c 网络恢复 + 重连 ==');
  adbShell('svc wifi enable');
  await sleep(12000);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(2500);
  await clickProfileCard('Gate3验证服务器', 1);
  await sleep(15000);
  const recovered = JSON.parse(await evalPage(`
    (() => {
      const t = document.body.innerText;
      return JSON.stringify({
        connected: t.includes('已连接'),
        noFail: !t.includes('连接失败：'),
      });
    })()
  `));
  assert(recovered.connected, '网络恢复后重连成功（已连接徽章）');
  assert(recovered.noFail, '失败状态清除');
  await screenshot('device-g3-04-wifi-recovered.png');
  results.recovered = recovered;

  console.log('== G3-07 删除二次确认（含密文清理） ==');
  await evalPage(`
    (() => {
      const btn = document.querySelector('button[aria-label^="更多操作"]');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()
  `).catch(() => 'NOT_FOUND');
  await sleep(800);
  await evalPage(`
    (() => {
      const els = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button')];
      const exact = els.filter((e) => (e.textContent || '').trim() === '删除');
      if (exact.length === 0) return 'NOT_FOUND';
      exact[exact.length - 1].click();
      return 'CLICKED';
    })()
  `);
  await sleep(800);
  const dialogOk = await evalPage(`
    (() => {
      const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
      const d = dialogs[dialogs.length - 1];
      const t = d?.textContent ?? '';
      return t.includes('删除连接') && t.includes('取消') && t.includes('删除');
    })()
  `);
  assert(dialogOk, '删除二次确认 Dialog 呈现');
  await screenshot('device-g3-07-delete-confirm.png');
  await evalPage(`
    (() => {
      const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
      const d = dialogs[dialogs.length - 1];
      const btn = [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === '删除');
      btn?.click();
      return 'OK';
    })()
  `);
  await sleep(1500);
  const afterDelete = await evalPage(`
    (() => {
      const t = document.body.innerText;
      const remaining = t.split('${HOST} / ${SHARE}').length - 1;
      return JSON.stringify({ remaining, banner: t.includes('已删除') });
    })()
  `);
  const ad = JSON.parse(afterDelete);
  assert(ad.remaining < results.restored.cardCount, `删除后列表卡减少（${results.restored.cardCount} → ${ad.remaining}）`);
  results.afterDelete = ad;

  writeFileSync(join(OUT_DIR, 'device-gate3b-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\n阶段 B（G3-04 断网恢复 / G3-05b 重启恢复 / G3-07 删除确认）真机验证通过');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});