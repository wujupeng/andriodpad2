/**
 * TASK-S5-07 阶段 C：异常场景（PM 授权第 5 条）
 * C1 断网回写韧性：本地变更注入（文件系统级等价 WPS 已保存）→断网→writeback
 *    如实失败（不伪成功）→服务器核验源不变→恢复→重试成功+内容核验
 * C2 目标冲突检测：服务器侧外部修改→checkRemoteChanged 报 remoteChanged
 *    （冲突识别，不盲目覆盖）
 * C3 重试行为即 C1 恢复段（服务器=注入内容，无重复覆盖）
 * 通道：CDP 直调插件（插件逻辑验证通道——与 M2 按钮同链路）。
 * 零代码变更（纯验证）。
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
    encoding: 'utf8', timeout: 90000,
  });
}
function sshSha(path) {
  const out = ssh(`sha256sum '${path}' 2>/dev/null || echo MISSING`).trim();
  const m = out.match(/^([a-f0-9]{64})/);
  return m ? m[1] : null;
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

async function clickEl(selector, text) {
  const clicked = await evalPage(`
    (() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els.find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'CLICKED';
    })()
  `);
  if (clicked !== 'CLICKED') throw new Error(`点击失败 "${text}"`);
}

async function clickCard() {
  const clicked = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('main div')].filter(
        (e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('Gate3'),
      );
      if (!rows.length) return 'NOT_FOUND';
      rows[0].click();
      return 'CLICKED';
    })()
  `);
  if (clicked !== 'CLICKED') throw new Error('连接卡点击失败');
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = {};
  const FILE = 'C断网测试.xlsx';
  const REMOTE = `/mnt/share/gate4-test/${FILE}`;
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');

  // ===== 环境准备：部署 C 段专用文件+打开（建立缓存与基线） =====
  console.log('== 0 环境准备 ==');
  ssh(`cd /tmp && printf 'C1标记,断网回写\nR2,行2\n' > s507c.csv && soffice --headless --convert-to xlsx --outdir /tmp s507c.csv >/dev/null 2>&1 && cp /tmp/s507c.xlsx '/mnt/share/gate4-test/${FILE}'`);
  // 注入版本（模拟 WPS 已保存的本地变更——内容 C1注入内容）
  ssh(`cd /tmp && printf 'C1标记,断网回写\nR2,行2\nC3,C1注入内容\n' > s507c-edited.csv && soffice --headless --convert-to xlsx --outdir /tmp s507c-edited.csv >/dev/null 2>&1`);
  ssh(`scp 2>/dev/null; ls /tmp/s507c-edited.xlsx`);
  const baseSha = sshSha(REMOTE);
  console.log(`  [STAT] 服务器基线: ${baseSha?.slice(0, 16)}`);
  assert(!!baseSha, '0.1 C 段文件部署');

  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();

  // 连接
  await clickEl('nav button', '添加连接');
  await sleep(1200);
  await clickCard();
  await sleep(16000);
  let connected = await evalPage(`document.body.innerText.includes('已连接')`);
  if (!connected) {
    const setField = async (label, value) => {
      const ok = await evalPage(`
        (() => {
          const labels = [...document.querySelectorAll('label')];
          const label = labels.find((l) => (l.textContent || '').includes(${JSON.stringify(label)}));
          if (!label) return 'L';
          const input = label.htmlFor ? document.getElementById(label.htmlFor) : null;
          if (!input) return 'I';
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, ${JSON.stringify(value)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return 'SET';
        })()
      `);
      if (ok !== 'SET') throw new Error(`字段失败 "${label}"`);
    };
    await setField('连接名称', 'Gate3编辑后');
    await setField('服务器地址', '192.168.2.3');
    await setField('共享名', 'share');
    await setField('用户名', 'pad2gate3');
    await setField('密码', process.env.SMB_PW || 'Gate3-Test-2026');
    await evalPage(`(() => { const cb = document.querySelector('input[type="checkbox"]'); if (cb && !cb.checked) cb.click(); return 'OK'; })()`);
    await sleep(400);
    await clickEl('main button', '保存并连接');
    await sleep(16000);
  }
  // BrowsePage 进 gate4-test（M2 前置）
  await evalPage(`(() => { const bs = [...document.querySelectorAll('nav button')].filter((x) => x.textContent.includes('Gate3')); const b = bs[bs.length - 1]; if (b) b.click(); return 'OK'; })()`);
  await sleep(4000);
  let path = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
  if (!String(path).includes('gate4-test')) {
    await evalPage(`(() => { const rows = [...document.querySelectorAll('[data-file-row]')]; const t = rows.find((x) => (x.textContent || '').includes('gate4-test')); if (!t) return 'NF'; t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); return 'OK'; })()`);
    await sleep(3500);
  }
  // M2 打开 C 文件（建立会话缓存）
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '设置'); if (b) b.click(); return 'OK'; })()`);
  await sleep(1800);
  await evalPage(`(() => { const els = [...document.querySelectorAll('main div')].filter((e) => (e.textContent || '').includes('M2 技术验证')); const el = els[els.length - 1]; if (el) el.click(); return 'OK'; })()`);
  await sleep(2500);
  const opened = await evalPage(`(() => { const els = [...document.querySelectorAll('[class*="fileRow"]')]; const el = els.find((e) => (e.textContent || '').includes('${FILE}')); if (!el) return 'NOT_FOUND'; el.click(); return 'CLICKED'; })()`);
  if (opened !== 'CLICKED') throw new Error('C 文件未在 M2 列表找到');
  await sleep(9000);
  // 切回 PAD2（WPS 占前台）
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(3000);
  const cacheBase = adbShell(`sha256sum '/storage/emulated/0/PAD2/smb_cache/${FILE}' 2>/dev/null`).trim();
  assert(cacheBase.includes(baseSha.slice(0, 20)), '0.2 打开成功（缓存==服务器基线）');
  console.log('  [STAT] 缓存已建立（==基线）');

  // ===== C1 断网回写韧性 =====
  console.log('\n== C1 断网回写：如实失败+源不变+恢复重试成功 ==');
  // 1. 注入本地变更（"WPS 已保存"文件系统等价：覆盖缓存为编辑版）
  const TMP = 'C:/Users/DELL/AppData/Local/Temp/s507c-edited.xlsx';
  execFileSync('scp', ['-i', process.env.HOME + '/.ssh/pad2_cred_closure', `debian@192.168.2.3:/tmp/s507c-edited.xlsx`, TMP]);
  execFileSync(ADB, ['-s', DEVICE, 'push', TMP, `/storage/emulated/0/PAD2/smb_cache/${FILE}`]);
  adbShell(`am start -n com.pad2.filemanager/.MainActivity >/dev/null 2>&1; true`);
  const cacheEdited = adbShell(`sha256sum '/storage/emulated/0/PAD2/smb_cache/${FILE}' 2>/dev/null`).trim();
  const injectedSha = (cacheEdited.match(/^([a-f0-9]{64})/) || [])[1];
  console.log(`  [STAT] 本地变更注入: ${injectedSha?.slice(0, 16)}（≠基线 ${baseSha.slice(0, 16)}）`);
  assert(injectedSha && injectedSha !== baseSha, 'C1.0a 本地缓存已变更（模拟 WPS 保存）');
  const editedServerTmp = sshSha('/tmp/s507c-edited.xlsx');
  assert(injectedSha === editedServerTmp, 'C1.0b 注入内容=编辑版文件');

  // 2. 断网
  adbShell('svc wifi disable');
  await sleep(4000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  // 3. writeback（CDP 直调插件——与 M2 按钮同链路）→ 应如实失败
  const wbFail = await evalPage(`(async () => {
    try {
      const r = await window.Capacitor.Plugins.SmbPlugin.writeback();
      return 'OK:' + JSON.stringify(r).substring(0, 100);
    } catch (e) {
      return 'FAILED:' + String(e.message || e).substring(0, 100);
    }
  })()`, true);
  console.log(`  [STAT] 断网 writeback=${String(wbFail).substring(0, 90)}`);
  assert(String(wbFail).startsWith('FAILED') || (String(wbFail).includes('OK:') && String(wbFail).includes('"writebackSuccess":false')), 'C1.1 断网回写如实失败（不伪成功）');

  // 4. 服务器核验源不变
  const shaOffline = sshSha(REMOTE);
  assert(shaOffline === baseSha, 'C1.2 服务器源文件未变（断网失败零污染）');

  // 5. 恢复网络→重试
  adbShell('svc wifi enable');
  console.log('  wifi 恢复中...');
  await sleep(18000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  const wbRetry = await evalPage(`(async () => {
    try {
      const r = await window.Capacitor.Plugins.SmbPlugin.writeback();
      return 'OK:' + JSON.stringify(r).substring(0, 140);
    } catch (e) {
      return 'FAILED:' + String(e.message || e).substring(0, 100);
    }
  })()`, true);
  console.log(`  [STAT] 重试 writeback=${String(wbRetry).substring(0, 110)}`);
  assert(String(wbRetry).includes('writebackSuccess":true') || String(wbRetry).startsWith('OK:'), 'C1.3 恢复后重试成功');
  const shaAfter = sshSha(REMOTE);
  assert(shaAfter === injectedSha, 'C1.4 服务器=注入内容（重试写入正确内容，重试幂等无重复覆盖）');
  // 内容核验
  ssh(`rm -f /tmp/s507c-verify.csv`);
  ssh(`cp '${REMOTE}' /tmp/s507c-verify.xlsx && cd /tmp && soffice --headless --convert-to csv --outdir /tmp s507c-verify.xlsx >/dev/null 2>&1`);
  const csvAfter = ssh(`cat /tmp/s507c-verify.csv`).trim();
  assert(csvAfter.includes('C1注入内容'), 'C1.5 服务器内容含"C1注入内容"（内容级核验）');
  results.C1 = { offlineFail: true, srcKept: true, retrySuccess: true, contentVerified: true };

  // ===== C2 目标冲突检测 =====
  console.log('\n== C2 目标冲突：服务器外部修改→checkRemoteChanged 识别 ==');
  // 服务器侧再改（外部并发修改）
  ssh(`cd /tmp && printf 'C1标记,断网回写\nR2,行2\nC3,C1注入内容\nX9,服务器外部新改\n' > s507c-ext.csv && soffice --headless --convert-to xlsx --outdir /tmp s507c-ext.csv >/dev/null 2>&1 && cp /tmp/s507c-ext.xlsx '${REMOTE}'`);
  const extSha = sshSha(REMOTE);
  assert(extSha !== injectedSha, 'C2.0 服务器已外部变更（≠本地缓存）');
  const rc = await evalPage(`(async () => {
    try {
      const r = await window.Capacitor.Plugins.SmbPlugin.checkRemoteChanged();
      return JSON.stringify(r);
    } catch (e) {
      return 'ERR:' + String(e.message || e).substring(0, 80);
    }
  })()`, true);
  console.log(`  [STAT] checkRemoteChanged=${String(rc).substring(0, 140)}`);
  const rcObj = JSON.parse(rc);
  assert(rcObj.remoteChanged === true, 'C2.1 远程变更被识别（remoteChanged=true——冲突不盲目）');
  results.C2 = { remoteChanged: true, extSha: extSha?.slice(0, 16) };
  // 不盲目覆盖披露：此时若用户强行 writeback 会覆盖外部修改——产品语义是检查提示+用户决策
  // （checkRemoteChanged 已如实报告；writeback 覆盖属用户显式决策——PM 第 5 条"不盲目覆盖"由检测+决策链保证）

  // 清理
  ssh(`rm -f '${REMOTE}'`);

  writeFileSync(join(OUT_DIR, 's507-c-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nTASK-S5-07 C 段通过（断网回写韧性+冲突检测）');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try { adbShell('svc wifi enable'); } catch {}
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});