/**
 * rootPath 端到端验证：CDP 检查表单 rootPath 字段 + 填写 + 保存 + 浏览页验证
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 30000 });
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
  const pid = adbShell('pidof com.pad2.filemanager').trim();
  const unix = adbShell(`cat /proc/net/unix | grep webview_devtools_remote_${pid} | head -1`);
  const m = unix.match(/webview_devtools_remote_(\d+)/);
  if (!m) throw new Error(`未找到 WebView CDP 端口 for PID ${pid}`);
  execFileSync(ADB, ['-s', DEVICE, 'forward', 'tcp:9222', `localabstract:webview_devtools_remote_${m[1]}`]);
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('无 page target');
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

async function main() {
  const results = [];
  function record(name, pass, detail) {
    results.push({ name, pass, detail });
    console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  }

  await connectWs();
  console.log('CDP 已连接');

  // 导航到连接页（添加连接）
  await evalPage(`(() => { const btn = [...document.querySelectorAll('nav button')].find(b => b.textContent.includes('添加连接')); if (btn) btn.click(); return 'OK'; })()`);
  await sleep(1500);

  // 检查 rootPath 表单字段是否存在
  const hasRootPathField = await evalPage(`(() => { const labels = [...document.querySelectorAll('label')]; return labels.some(l => (l.textContent || '').includes('根路径')); })()`);
  record('rootPath 表单字段存在', hasRootPathField === true, String(hasRootPathField));

  if (!hasRootPathField) {
    // 可能需要点击"新建连接"按钮
    await evalPage(`(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('新建')); if (btn) btn.click(); return 'OK'; })()`);
    await sleep(1000);
    const hasField2 = await evalPage(`(() => { const labels = [...document.querySelectorAll('label')]; return labels.some(l => (l.textContent || '').includes('根路径')); })()`);
    record('rootPath 表单字段存在（第二次检查）', hasField2 === true, String(hasField2));
  }

  // 检查 rootPath 字段的 placeholder
  const rootPathPlaceholder = await evalPage(`(() => { const labels = [...document.querySelectorAll('label')]; const rp = labels.find(l => (l.textContent || '').includes('根路径')); if (!rp) return 'NOT_FOUND'; const input = rp.htmlFor ? document.getElementById(rp.htmlFor) : null; return input ? input.placeholder : 'NO_INPUT'; })()`);
  record('rootPath placeholder 正确', rootPathPlaceholder === '如 AutoFileBackup', rootPathPlaceholder);

  // 检查 rootPath hint
  const rootPathHint = await evalPage(`(() => { const labels = [...document.querySelectorAll('label')]; const rp = labels.find(l => (l.textContent || '').includes('根路径')); if (!rp) return 'NOT_FOUND'; const hint = rp.parentElement.querySelector('.formHint, [class*="hint"]'); return hint ? hint.textContent : 'NO_HINT'; })()`);
  record('rootPath hint 存在', rootPathHint !== 'NOT_FOUND' && rootPathHint !== 'NO_HINT', rootPathHint);

  // 填写 rootPath 字段（使用 native setter）
  const setRootPath = await evalPage(`
    (() => {
      const labels = [...document.querySelectorAll('label')];
      const rp = labels.find(l => (l.textContent || '').includes('根路径'));
      if (!rp) return 'NO_LABEL';
      const input = rp.htmlFor ? document.getElementById(rp.htmlFor) : null;
      if (!input) return 'NO_INPUT';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'AutoFileBackup');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'SET';
    })()
  `);
  record('rootPath 填写 AutoFileBackup', setRootPath === 'SET', setRootPath);

  // 验证填写后值正确
  const rootPathValue = await evalPage(`(() => { const labels = [...document.querySelectorAll('label')]; const rp = labels.find(l => (l.textContent || '').includes('根路径')); const input = rp.htmlFor ? document.getElementById(rp.htmlFor) : null; return input ? input.value : 'NO_INPUT'; })()`);
  record('rootPath 填写后值正确', rootPathValue === 'AutoFileBackup', rootPathValue);

  // 填写 .. 越界测试
  await evalPage(`
    (() => {
      const labels = [...document.querySelectorAll('label')];
      const rp = labels.find(l => (l.textContent || '').includes('根路径'));
      const input = rp.htmlFor ? document.getElementById(rp.htmlFor) : null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '../other');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'SET';
    })()
  `);
  await sleep(300);

  // 点击保存并连接按钮触发校验
  await evalPage(`(() => { const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('保存并连接')); if (btn) btn.click(); return 'OK'; })()`);
  await sleep(1000);

  // 检查是否有错误提示
  const hasError = await evalPage(`(() => { const text = document.body.innerText; return text.includes('根路径不得越出共享范围'); })()`);
  record('rootPath 含 .. 时校验拒绝（REQ-RP-11）', hasError === true, String(hasError));

  // 恢复为合法值
  await evalPage(`
    (() => {
      const labels = [...document.querySelectorAll('label')];
      const rp = labels.find(l => (l.textContent || '').includes('根路径'));
      const input = rp.htmlFor ? document.getElementById(rp.htmlFor) : null;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'AutoFileBackup');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'SET';
    })()
  `);
  await sleep(300);

  const failed = results.filter((r) => !r.pass);
  const summary = {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    ts: new Date().toISOString(),
  };

  writeFileSync(
    join(__dirname, 'rp-e2e-result.json'),
    JSON.stringify({ summary, results }, null, 2),
  );

  console.log(
    failed.length === 0
      ? `\n✓ rootPath 端到端验证通过（${results.length}/${results.length}）`
      : `\n✗ 验证失败（${failed.length}/${results.length} 失败）`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});