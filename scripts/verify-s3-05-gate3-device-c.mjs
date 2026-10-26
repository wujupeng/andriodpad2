/**
 * TASK-S3-05 阶段 C：G3-06 密文篡改 fail-secure 演练
 * 前置：shared_prefs 已写入受控篡改的密文（三段式保持、ciphertext 被改）。
 * 断言：重启 → 点卡连接 → 解密失败 warning Banner + 转编辑表单要求重输；
 *       未崩溃、未伪报已连接、未回退明文；fail-secure 后密文字段被清除。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s3';

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
  console.log('== C0 重启 App（加载被篡改的密文） ==');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(6000);
  await connectWs();

  console.log('== C1 导航连接页（篡改后 App 不崩溃） ==');
  await clickByText('nav button', '添加连接');
  await sleep(900);
  const alive = await evalPage(`!!document.querySelector('nav') && document.body.innerText.includes('已保存的连接')`);
  assert(alive, '篡改密文加载后 App 正常启动（无崩溃）');

  console.log('== C2 点卡连接 → 解密失败 fail-secure ==');
  await clickProfileCard('Gate3验证服务器', 0);
  await sleep(4000);
  const tamper = JSON.parse(await evalPage(`
    (() => {
      const t = document.body.innerText;
      return JSON.stringify({
        decryptFailBanner: t.includes('已保存的密码无法解密'),
        reenterForm: t.includes('新建 SMB 连接') && t.includes('Gate3验证服务器'),
        noConnected: !t.includes('已连接'),
        appAlive: !!document.querySelector('nav'),
        noPlaintext: !t.includes('Gate3-Test-2026'),
      });
    })()
  `));
  assert(tamper.decryptFailBanner, '解密失败 warning Banner 呈现（fail-secure 提示重输）');
  assert(tamper.reenterForm, '转编辑表单要求重新输入密码');
  assert(tamper.noConnected, '未伪报已连接（未建立连接）');
  assert(tamper.appAlive, 'App 存活');
  assert(tamper.noPlaintext, 'UI 无明文密码回退');
  await screenshot('device-g3-06-tampered-failsecure.png');
  results.tamper = tamper;

  console.log('== C3 fail-secure 后密文字段清除核验 ==');
  const xml = adbShell('run-as com.pad2.filemanager cat shared_prefs/CapacitorStorage.xml');
  const encCleared = !xml.includes('passwordEncrypted');
  const plaintextLeak = xml.includes('Gate3-Test-2026');
  assert(encCleared, '持久层密文字段已被清除（save() fail-secure 路径）');
  assert(!plaintextLeak, '持久层无明文密码');
  results.encCleared = encCleared;

  writeFileSync(join(OUT_DIR, 'device-gate3c-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\n阶段 C（G3-06 篡改 fail-secure）真机验证通过');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});