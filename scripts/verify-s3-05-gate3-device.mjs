/**
 * TASK-S3-05 Gate-UI-3 真机验证（阶段 A：G3-02 表单 / G3-03 AUTH_FAILED / 正确保存连接）
 * 凭据经环境变量传入（SMB_HOST/SMB_SHARE/SMB_USER/SMB_PW/BAD_PW），不入脚本与截图（PM 红线 1）。
 * 用法：SMB_PW=真实密码 BAD_PW=错误密码 node scripts/verify-s3-05-gate3-device.mjs a
 * 阶段：a = 表单校验+AUTH_FAILED 注入+保存并连接（connecting/connected 捕获）
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s3';
const HOST = process.env.SMB_HOST ?? '192.168.2.3';
const SHARE = process.env.SMB_SHARE ?? 'share';
const USER = process.env.SMB_USER ?? 'debian';
const PW = process.env.SMB_PW;
const BAD_PW = process.env.BAD_PW;

if (!PW || (!BAD_PW && process.argv[2] === 'a')) {
  console.error('阶段 a 需要环境变量 SMB_PW 与 BAD_PW；阶段 a2 仅需 SMB_USER/SMB_PW（凭据不入脚本）');
  process.exit(1);
}

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 30000 });
}

function cdpForward() {
  const unix = adbShell("cat /proc/net/unix | grep webview_devtools_remote | head -1");
  const m = unix.match(/webview_devtools_remote_(\d+)/);
  if (!m) throw new Error('未找到 WebView devtools socket');
  execFileSync(ADB, ['-s', DEVICE, 'forward', 'tcp:9222', `localabstract:webview_devtools_remote_${m[1]}`]);
}

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

async function setFieldByLabel(label, value) {
  const ok = await evalPage(`
    (() => {
      const labels = [...document.querySelectorAll('label')];
      const label = labels.find((l) => (l.textContent || '').includes(${JSON.stringify(label)}));
      if (!label) return 'LABEL_NOT_FOUND';
      const input = label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector('input');
      if (!input) return 'INPUT_NOT_FOUND';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'SET';
    })()
  `);
  if (ok !== 'SET') throw new Error(`字段输入失败 "${label}": ${ok}`);
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 轮询捕获瞬时状态（每 150ms 查一次） */
async function pollFor(expr, totalMs) {
  const deadline = Date.now() + totalMs;
  while (Date.now() < deadline) {
    if (await evalPage(expr)) return true;
    await sleep(150);
  }
  return false;
}

async function connectWs() {
  cdpForward();
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
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args?.map((a) => a.value ?? a.description).join(' ') ?? '');
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
}

async function main() {
  const phase = process.argv[2] ?? 'a';
  await connectWs();
  const results = {};

  if (phase === 'a') {
  console.log('== G3-02a 导航至连接页 ==');
  await clickByText('nav button', '添加连接');
  await sleep(900);
  const formOk = await evalPage(`document.body.innerText.includes('新建 SMB 连接') && document.body.innerText.includes('还没有保存的连接')`);
  assert(formOk, '连接页双栏渲染（表单+空态）');
  await screenshot('device-g3-02-empty.png');

  console.log('== G3-02b 必填校验（内联 danger caption） ==');
  await clickByText('main button', '测试连接');
  await sleep(600);
  const requiredCount = await evalPage(`
    [...document.querySelectorAll('main span[role="alert"]')].filter((c) => c.textContent.includes('请填写')).length
  `);
  assert(requiredCount >= 5, `必填内联提示 ≥5 项（实际 ${requiredCount}）`);

  console.log('== G3-02c 地址格式校验 ==');
  await setFieldByLabel('服务器地址', '192.168.300.1');
  await sleep(300);
  await clickByText('main button', '测试连接');
  await sleep(500);
  const hostErr = await evalPage(`document.body.innerText.includes('地址格式不正确')`);
  assert(hostErr, '非法 IP 格式提示呈现');
  await setFieldByLabel('服务器地址', HOST);
  await evalPage(`
    (() => {
      const captions = [...document.querySelectorAll('main span[role="alert"]')];
      captions.forEach((c) => { if (c.textContent.includes('地址格式')) c.previousElementSibling; });
      return 'OK';
    })()
  `);

  console.log('== G3-02d 密码掩码与显隐 ==');
  await setFieldByLabel('密码', 'placeholder-check');
  const masked = await evalPage(`
    (() => {
      const labels = [...document.querySelectorAll('label')];
      const label = labels.find((l) => (l.textContent || '').trim().startsWith('密码'));
      const input = label.htmlFor ? document.getElementById(label.htmlFor) : null;
      return input?.type ?? 'none';
    })()
  `);
  assert(masked === 'password', '密码默认掩码');
  await evalPage(`
    [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label').includes('密码')).click()
  `);
  await sleep(400);
  const revealed = await evalPage(`
    (() => {
      const labels = [...document.querySelectorAll('label')];
      const label = labels.find((l) => (l.textContent || '').trim().startsWith('密码'));
      const input = label.htmlFor ? document.getElementById(label.htmlFor) : null;
      return input?.type ?? 'none';
    })()
  `);
  assert(revealed === 'text', '显隐切换至明文');
  await evalPage(`
    [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label').includes('密码')).click()
  `);
  await sleep(300);

  console.log('== G3-03 AUTH_FAILED 注入（错误凭据） ==');
  await setFieldByLabel('连接名称', 'Gate3验证服务器');
  await setFieldByLabel('共享名', SHARE);
  await setFieldByLabel('用户名', USER);
  await setFieldByLabel('密码', BAD_PW);
  await clickByText('main button', '测试连接');
  await sleep(6000);
  const authFail = JSON.parse(await evalPage(`
    (() => {
      const t = document.body.innerText;
      const labels = [...document.querySelectorAll('label')];
      const label = labels.find((l) => (l.textContent || '').trim().startsWith('密码'));
      const input = label.htmlFor ? document.getElementById(label.htmlFor) : null;
      const caption = input?.parentElement?.nextElementSibling?.textContent ?? '';
      return JSON.stringify({
        banner: t.includes('连接失败：用户名或密码不正确'),
        pwdInline: caption.includes('用户名或密码不正确'),
        noConnected: !t.includes('已连接'),
      });
    })()
  `));
  assert(authFail.banner, '失败 Banner 呈现统一文案（用户名或密码不正确）');
  assert(authFail.pwdInline, 'AUTH_FAILED 定位到密码项内联（spec 5.3.3 异常 2）');
  assert(authFail.noConnected, '未伪报已连接');
  await screenshot('device-g3-03-auth-failed.png');
  results.authFailed = authFail;

  console.log('== G3-02e/G3-05a 正确凭据保存并连接（含 connecting 捕获） ==');
  await setFieldByLabel('用户名', USER);
  await setFieldByLabel('密码', PW);
  await evalPage(`
    (() => {
      const cb = document.querySelector('input[type="checkbox"]');
      if (cb && !cb.checked) cb.click();
      return 'OK';
    })()
  `);
  await sleep(300);
  await clickByText('main button', '保存并连接');
  const connectingSeen = await pollFor(`document.body.innerText.includes('正在连接')`, 1500);
  await sleep(9000);
  const connected = JSON.parse(await evalPage(`
    (() => {
      const t = document.body.innerText;
      return JSON.stringify({
        connectedBadge: t.includes('已连接'),
        listCard: t.includes('Gate3验证服务器') && t.includes('${HOST} / ${SHARE}'),
        noFail: !t.includes('连接失败：'),
      });
    })()
  `));
  assert(connectingSeen, 'connecting 态呈现（正在连接... 徽章，spec 5.3.1-R5）');
  assert(connected.connectedBadge, 'connected 徽章呈现（保存并连接成功）');
  assert(connected.listCard, '列表卡渲染（名称+host/share）');
  assert(connected.noFail, '无失败残留');
  await screenshot('device-g3-05-connected.png');
  results.connected = { ...connected, connectingSeen };

  console.log('== 渲染健康 ==');
  console.log(`  [INFO] console.error ${consoleErrors.length} 条`);
  consoleErrors.slice(0, 5).forEach((e) => console.log(`    - ${e.substring(0, 140)}`));

  writeFileSync(join(OUT_DIR, 'device-gate3a-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\n阶段 A（G3-02/03 + 保存连接）真机验证通过');
  }

  if (phase === 'a2') {
    console.log('== A2 测试账号凭据保存并连接 ==');
    await setFieldByLabel('用户名', USER);
    await setFieldByLabel('密码', PW);
    await evalPage(`
      (() => {
        const cb = document.querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) cb.click();
        return 'OK';
      })()
    `);
    await sleep(300);
    await clickByText('main button', '保存并连接');
    const connectingSeen = await pollFor(`document.body.innerText.includes('正在连接')`, 1500);
    await sleep(9000);
    const connected = JSON.parse(await evalPage(`
      (() => {
        const t = document.body.innerText;
        return JSON.stringify({
          connectedBadge: t.includes('已连接'),
          listCard: t.includes('Gate3验证服务器') && t.includes('${HOST} / ${SHARE}'),
          noFail: !t.includes('连接失败：'),
        });
      })()
    `));
    assert(connectingSeen, 'connecting 态呈现（正在连接... 徽章，spec 5.3.1-R5）');
    assert(connected.connectedBadge, 'connected 徽章呈现（保存并连接成功）');
    assert(connected.listCard, '列表卡渲染（名称+host/share）');
    assert(connected.noFail, '无失败残留');
    await screenshot('device-g3-05-connected.png');
    results.connected = { ...connected, connectingSeen };
    writeFileSync(join(OUT_DIR, 'device-gate3a2-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
    console.log('\n阶段 A2（测试账号保存连接）真机验证通过');
  }

  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});