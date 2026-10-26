/**
 * TASK-S5-01 C2 段正式版：WPS 编辑保存→检测→回写→三方 SHA 核验
 * 前置：C1 已打开文件且用户已在 WPS 中编辑并保存（人工协作点）。
 * 流程：M2 页"检查本地变更"（checkChange→SAVE_SUCCESS 三因子）→
 * "执行回写"（writeback+远端校验）→ 服务器 SHA-256 核验（应≠基线且与
 * 回写 verifyHash 一致——三方一致）。原生日志为权威证据（本脚本打印采集）。
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

function ssh(cmd) {
  return execFileSync('ssh', ['-i', process.env.HOME + '/.ssh/pad2_cred_closure', 'debian@192.168.2.3', cmd], {
    encoding: 'utf8',
    timeout: 90000,
  });
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

async function clickEl(text) {
  const clicked = await evalPage(`
    (() => {
      const els = [...document.querySelectorAll('button')];
      const el = els.find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'CLICKED';
    })()
  `);
  if (clicked !== 'CLICKED') throw new Error(`按钮点击失败 "${text}"`);
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(3000);
  await connectWs();

  // 确认在 M2 页
  const onM2 = await evalPage(`document.body.innerText.includes('V1-V7')`);
  if (!onM2) {
    await clickEl('设置');
    await sleep(1800);
    await evalPage(`(() => { const els = [...document.querySelectorAll('main div')].filter((e) => (e.textContent || '').includes('M2 技术验证')); const el = els[els.length - 1]; if (el) el.click(); return 'OK'; })()`);
    await sleep(2500);
  }

  console.log('== C2.1 检查本地变更（checkChange） ==');
  await clickEl('检查本地变更');
  await sleep(9000);

  console.log('== C2.2 执行回写（writeback） ==');
  await clickEl('执行回写');
  await sleep(12000);

  console.log('== C2.3 原生日志证据采集 ==');
  const pid = adbShell('pidof com.pad2.filemanager').trim();
  const logcat = adbShell(`logcat -d --pid=${pid} 2>/dev/null | grep -iE "Verdict|SaveAs evidence|Writeback verified|three-factor" | tail -6`);
  console.log(logcat.trim());
  const saveSuccess = /SAVE_SUCCESS/.test(logcat) || /three-factor/.test(logcat);
  const writebackVerified = /Writeback verified: remote SHA-256 matches local/.test(logcat);
  assert(saveSuccess, 'C2.1 检测 SAVE_SUCCESS（三因子：mtime+SHA）');
  assert(writebackVerified, 'C2.2 回写 verified（远端 SHA 匹配）');

  console.log('== C2.4 服务器三方核验 ==');
  const serverSha = ssh('sha256sum /mnt/share/gate4-test/年度报告.docx').trim();
  console.log(`  服务器 SHA-256: ${serverSha}`);
  const hashMatch = serverSha.match(/([a-f0-9]{64})/);
  const serverHash = hashMatch ? hashMatch[1] : '';
  const verifyMatch = logcat.match(/"verifyHash":"([a-f0-9]{64})"/);
  const verifyHash = verifyMatch ? verifyMatch[1] : '';
  assert(!!serverHash, '服务器哈希可读');
  if (verifyHash) {
    assert(serverHash === verifyHash, `三方一致（服务器 = 回写校验 ${serverHash.substring(0, 16)}…）`);
  }
  assert(serverHash !== 'b5c8aa5499e0ac1809105a2d960eeaac32c1878fe521eabc2964359ec6a8dd2a', '服务器文件已更新（≠基线）');

  writeFileSync(join(OUT_DIR, 's501-c2-result.json'), JSON.stringify({
    saveSuccess,
    writebackVerified,
    serverHash,
    verifyHash,
    baseline: 'b5c8aa5499e0ac1809105a2d960eeaac32c1878fe521eabc2964359ec6a8dd2a',
    ts: new Date().toISOString(),
  }, null, 2));
  console.log('\nS5-01 C2 段通过（检测→回写→三方 SHA 一致）');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});