/** TASK-S5-04-R 续跑（R3 已过）：R4 占用 / R5 断网权限 / R6 幂等 / R7 大文件 / R8 回归 / R9 披露
 * 前置：R3 已完成（财务目录：子目录新名.txt + 已存在目标.txt 均在） */
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s5';
const GATE4 = '/mnt/share/gate4-test';
const FIN = `${GATE4}/财务目录`;
const WPS = 'cn.wps.moffice_eng';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 90000 });
}
function ssh(cmd) {
  return execFileSync('ssh', ['-i', process.env.HOME + '/.ssh/pad2_cred_closure', 'debian@192.168.2.3', cmd], {
    encoding: 'utf8', timeout: 90000,
  });
}
function serverCheck(path) {
  const out = ssh(`stat -c '%s %Y' '${path}' 2>/dev/null && sha256sum '${path}' 2>/dev/null || echo MISSING`);
  const line = out.trim();
  if (line.startsWith('MISSING') || !line) return { exists: false };
  const lines = line.split('\n');
  const [size, mtime] = lines[0].split(' ');
  const sha = (lines[1] || '').match(/^([a-f0-9]{64})/);
  return { exists: true, size: Number(size), mtime: Number(mtime), sha: sha ? sha[1] : null };
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

async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT_DIR, name), Buffer.from(data, 'base64'));
  console.log(`  [SHOT] ${name}`);
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

async function pressRow(rowText) {
  let r = 'NOT_FOUND';
  for (let i = 0; i < 3 && r !== 'PRESSED'; i += 1) {
    r = await evalPage(`
      (() => {
        const rows = [...document.querySelectorAll('[data-file-row]')];
        const target = rows.find((x) => (x.textContent || '').includes(${JSON.stringify(rowText)}));
        if (!target) return 'NOT_FOUND';
        target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }));
        target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }));
        return 'PRESSED';
      })()
    `);
    if (r !== 'PRESSED') await sleep(1500);
  }
  if (r !== 'PRESSED') throw new Error(`行按压失败 "${rowText}"`);
}

async function renameViaUi(rowName, newName) {
  await pressRow(rowName);
  await sleep(1400);
  await clickEl('[role="menuitem"]', '重命名');
  await sleep(1100);
  const set = await evalPage(`
    (() => {
      const input = document.querySelector('[role="alertdialog"] input:not([type="checkbox"])');
      if (!input) return 'NO_INPUT';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(newName)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'SET';
    })()
  `);
  if (set !== 'SET') throw new Error('重命名输入框未找到');
  await sleep(600);
  await clickEl('[role="alertdialog"] button', '重命名');
}

async function waitResult(ms = 14000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const t = await evalPage(`document.body.innerText`);
    if (t.includes('重命名完成')) return 'success';
    if (t.includes('重命名失败') || t.includes('失败：')) return 'failed';
    await sleep(700);
  }
  return 'timeout';
}

/** 重挂载刷新并回 gate4-test 根（先回共享根再进 gate4-test——含子目录态修正） */
async function backToGate4Root() {
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1300);
  await evalPage(`(() => { const bs = [...document.querySelectorAll('nav button')].filter((x) => x.textContent.includes('Gate3验证服务器')); const b = bs[bs.length - 1]; if (b) b.click(); return 'OK'; })()`);
  await sleep(4000);
  const p = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
  const pathStr = String(p);
  if (pathStr.includes('财务目录') || (pathStr.includes('gate4-test') && pathStr.split('gate4-test')[1]?.length > 0)) {
    // 子目录态：点面包屑 gate4-test 段 button 回 gate4-test 根
    await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim() === 'gate4-test'); if (seg) seg.click(); return 'OK'; })()`);
    await sleep(3200);
  } else if (!pathStr.includes('gate4-test')) {
    await pressRow('gate4-test');
    await sleep(3500);
  }
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = {};
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(3000);
  await connectWs();

  // ===== R4 文件占用（WPS 打开大表格.xlsx→重命名） =====
  console.log('\n== R4 文件占用（WPS 打开中重命名 大表格.xlsx） ==');
  await backToGate4Root();
  // CDP 直调 openInWps（真实投递+唤起；注意 xlsx→WPS 表格组件）
  const openR = await evalPage(`(async () => {
    try {
      const r = await window.Capacitor.Plugins.SmbPlugin.openInWps({ path: 'gate4-test\\\\大表格.xlsx' });
      return 'OK:' + String(r.intentLaunched);
    } catch (e) {
      return 'ERR:' + String(e.message || e).substring(0, 120);
    }
  })()`, true);
  console.log(`  [STAT] openInWps=${openR}`);
  const launched = String(openR).startsWith('OK:true');
  assert(launched, 'R4.0 openInWps 投递成功（WPS 打开中）');
  await sleep(6000);
  // PM 必检④：SHARING_VIOLATION 行为不得预先假定——实测 Samba 默认无强制共享锁下的重命名行为
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(3000);
  await backToGate4Root();
  const r4base = serverCheck(`${GATE4}/大表格.xlsx`);
  await renameViaUi('大表格.xlsx', '占用测试新名.xlsx');
  const r4r = await waitResult(20000);
  const r4src = serverCheck(`${GATE4}/大表格.xlsx`);
  const r4new = serverCheck(`${GATE4}/占用测试新名.xlsx`);
  console.log(`  [STAT] WPS 打开态重命名结果=${r4r} 源=${r4src.exists} 新名=${r4new.exists}`);
  if (r4r === 'success') {
    // Samba 默认共享模式允许（SMB2ShareAccess.ALL）——如实记录：占用不阻断，文件锁语义实测结论
    assert(!r4src.exists && r4new.exists && r4new.sha === r4base.sha, 'R4.1 重命名成功且 SHA 保持（Samba 无强制锁实测——如实记录，不预设 SHARING_VIOLATION）');
    results.R4 = { result: 'success', semantics: 'Samba 默认共享模式（ShareAccess.ALL）下 WPS 打开不锁远端——重命名成功（实测）', shaKept: true };
    // 改回原名供后续
    await backToGate4Root();
    await renameViaUi('占用测试新名.xlsx', '大表格.xlsx');
    await waitResult();
  } else {
    const pid = adbShell('pidof com.pad2.filemanager').trim();
    const log = adbShell(`logcat -d --pid=${pid} 2>/dev/null | grep -iE "Rename file failed" | tail -2`);
    console.log(`  [LOG] ${log.trim().substring(0, 300)}`);
    assert(r4src.exists && r4src.sha === r4base.sha, 'R4.1 占用失败如实+源不变');
    results.R4 = { result: 'failed', srcKept: true, log: log.trim().substring(0, 300) };
  }
  await screenshot('s504r-r4-sharing.png');

  // ===== R5a 断网 =====
  console.log('\n== R5a 断网重命名：如实失败+源不变 ==');
  const r5base = serverCheck(`${GATE4}/测试A.txt`);
  adbShell('svc wifi disable');
  await sleep(4000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await renameViaUi('测试A.txt', '断网改名.txt');
  await sleep(22000);
  const r5t = await evalPage(`document.body.innerText`);
  assert(r5t.includes('重命名失败') || r5t.includes('失败：'), 'R5a.1 断网如实失败');
  adbShell('svc wifi enable');
  await sleep(18000);
  const r5src = serverCheck(`${GATE4}/测试A.txt`);
  const r5new = serverCheck(`${GATE4}/断网改名.txt`);
  assert(r5src.exists && r5src.sha === r5base.sha, 'R5a.2 源不变');
  assert(!r5new.exists, 'R5a.3 目标未创建');
  results.R5a = { honestFail: true };

  // ===== R5b 权限 =====
  console.log('\n== R5b 权限重命名（chmod 000 源） ==');
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(2500);
  // 重连（断网后失效）：连接页点卡
  const onConn = await evalPage(`document.body.innerText.includes('新建 SMB 连接')`);
  if (onConn) {
    await clickEl('main div', 'Gate3验证服务器');
    await sleep(16000);
  } else {
    const netBanner = await evalPage(`document.body.innerText.includes('网络已中断')`);
    if (netBanner) {
      await clickEl('button', '重连');
      await sleep(16000);
    }
  }
  await backToGate4Root();
  ssh(`chmod 000 '${GATE4}/测试C.txt'`);
  await sleep(800);
  await renameViaUi('测试C.txt', '无权改名.txt');
  await sleep(16000);
  const r5bt = await evalPage(`document.body.innerText`);
  const r5bFail = r5bt.includes('重命名失败') || r5bt.includes('失败：');
  ssh(`chmod 664 '${GATE4}/测试C.txt'`);
  const r5bsrc = serverCheck(`${GATE4}/测试C.txt`);
  const r5bnew = serverCheck(`${GATE4}/无权改名.txt`);
  assert(r5bFail && r5bsrc.exists && !r5bnew.exists, 'R5b 权限如实失败+源不变+无越权');
  const pid2 = adbShell('pidof com.pad2.filemanager').trim();
  const log2 = adbShell(`logcat -d --pid=${pid2} 2>/dev/null | grep -iE "Rename file failed" | tail -2`);
  console.log(`  [LOG] ${log2.trim().substring(0, 280)}`);
  results.R5b = { fail: true, log: log2.trim().substring(0, 280) };

  // ===== R6 重试幂等 =====
  console.log('\n== R6 重试幂等（首次成功→同名重试无数据变化） ==');
  await backToGate4Root();
  await renameViaUi('测试B.txt', '幂等名.txt');
  const r6r1 = await waitResult();
  assert(r6r1 === 'success', 'R6.1 首次成功');
  const r6a = serverCheck(`${GATE4}/幂等名.txt`);
  await backToGate4Root();
  await renameViaUi('幂等名.txt', '幂等名.txt');
  const r6r2 = await waitResult();
  const r6b = serverCheck(`${GATE4}/幂等名.txt`);
  assert(r6b.exists && r6b.sha === r6a.sha, 'R6.2 重试后 SHA 不变（幂等，PM 必检③）');
  console.log(`  [STAT] 同名重试结果=${r6r2}（无数据变化）`);
  results.R6 = { idempotent: true, secondResult: r6r2 };

  // ===== R7 大文件 =====
  console.log('\n== R7 大文件重命名（50MB） ==');
  await backToGate4Root();
  const r7base = serverCheck(`${GATE4}/大文件50MB.bin`);
  assert(r7base.exists && r7base.size === 52428800, 'R7.0 基线就绪');
  const t0 = Date.now();
  await renameViaUi('大文件50MB.bin', '大文件已改名.bin');
  const r7r = await waitResult();
  const elapsed = Date.now() - t0;
  const r7new = serverCheck(`${GATE4}/大文件已改名.bin`);
  assert(r7r === 'success', 'R7.1 任务 success');
  assert(r7new.exists && r7new.sha === r7base.sha && r7new.size === 52428800, 'R7.2 SHA+大小不变（零传输）');
  console.log(`  [STAT] 50MB 端到端 ${elapsed}ms（含 UI 对话框全程）`);
  results.R7 = { elapsedMs: elapsed };

  // ===== R8 S4 回归（复制冒烟） =====
  console.log('\n== R8 S4 回归：复制冒烟 ==');
  await backToGate4Root();
  const r8srcSha = serverCheck(`${GATE4}/测试C.txt`).sha;
  await pressRow('测试C.txt');
  await sleep(1400);
  await clickEl('[role="menuitem"]', '复制');
  await sleep(1200);
  await evalPage(`(() => { const list = document.querySelector('[class*="pickerList"]'); if (!list) return 'NL'; const rows = [...list.querySelectorAll('div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__')); const t = rows.find((e) => (e.textContent || '').includes('财务目录')); if (t) t.click(); return 'OK'; })()`);
  await sleep(1200);
  await clickEl('[role="alertdialog"] button', '选此处');
  await sleep(9000);
  const r8dst = serverCheck(`${FIN}/测试C.txt`);
  assert(r8dst.exists && r8dst.sha === r8srcSha, 'R8.1 复制回归（SHA==源）');
  results.R8 = { copyOk: true };

  // ===== R9 回滚披露 =====
  results.R9 = 'capabilities.rename=true 启用；回滚=改 false 一行（菜单灰显+notAvailable 禁用）；无运行时 UI 开关（如实披露）';
  console.log(`\n  [披露] ${results.R9}`);

  // 合并 R1-R3 结果（上轮 JSON）
  try {
    const prev = JSON.parse(readFileSync(join(OUT_DIR, 's504r-result.json'), 'utf8'));
    if (prev && prev.results && prev.results.R1) {
      Object.assign(results, { R1: prev.results.R1, R2: prev.results.R2, R3: prev.results.R3 });
    }
  } catch { /* 首轮无文件 */ }

  writeFileSync(join(OUT_DIR, 's504r-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nTASK-S5-04-R 真机验收完成（R1-R9 全场景）');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try { adbShell('svc wifi enable'); ssh(`chmod 664 '${GATE4}/测试C.txt'`); } catch {}
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});