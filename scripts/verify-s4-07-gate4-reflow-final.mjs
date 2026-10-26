/**
 * Gate-UI-4 方案 B 最终补验（含 unreachable 回流口径修复轮 b6b7d19e…）
 * Phase A network_interrupted：svc wifi disable → 操作 → ENETUNREACH→unreachable
 *   →回流 network_interrupted + warning Banner → wifi enable → 重连恢复
 * Phase B session_invalid：服务器改密码 + iptables 仅对 ESTABLISHED RST（放行
 *   新连接）→ 操作 → jcifs 旧连接被断→内部重连→会话协商 LOGON_FAILURE→
 *   auth_failed → 回流 session_invalid + danger Banner → 还原密码 → 重连恢复
 * 前置：屏幕唤醒、已连接、gate4-test 目录（脚本自行导航）。凭据经 env SMB_PW。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s4';
const TABLET_IP = '192.168.128.219';
const ORIG_PW = process.env.SMB_PW || 'Gate3-Test-2026';
const TEMP_PW = 'G4R-SessionInvalid-2026';
const IPT_ADD_EST = `sudo iptables -I INPUT -p tcp -s ${TABLET_IP} --dport 445 -m conntrack --ctstate ESTABLISHED -j REJECT --reject-with tcp-reset`;
const IPT_DEL_EST = `sudo iptables -D INPUT -p tcp -s ${TABLET_IP} --dport 445 -m conntrack --ctstate ESTABLISHED -j REJECT --reject-with tcp-reset`;

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

function wake() {
  adbShell('input keyevent KEYCODE_WAKEUP');
}

async function tapText(selector, text) {
  const pos = await evalPage(`
    (() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els.find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
      if (!el) return 'NOT_FOUND';
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()
  `);
  if (pos === 'NOT_FOUND') throw new Error(`点击目标未找到 "${text}"`);
  const { x, y } = JSON.parse(pos);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, 95));
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x, y }] });
}

async function readState() {
  return JSON.parse(
    await evalPage(`
    (() => {
      const t = document.body.innerText;
      const nav = document.querySelector('nav[aria-label="路径导航"]');
      const status = document.querySelector('[role="status"]');
      return JSON.stringify({
        netInterrupted: t.includes('网络已中断'),
        sessionInvalid: t.includes('连接会话已失效'),
        reconnectBtn: !!([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重连')),
        banner: status ? status.textContent.substring(0, 50) : '无',
        path: nav ? nav.textContent.substring(0, 40) : '无',
        rows: document.querySelectorAll('[data-file-row]').length,
      });
    })()
  `),
  );
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 从当前已连接态导航到 gate4-test（冷启动备用：SKIP_BOOT=1 复用当前态） */
async function bootToGate4() {
  if (process.env.SKIP_BOOT === '1') {
    await connectWs();
    await tapText('nav button', 'Gate3验证服务器');
    await sleep(2800);
    await tapText('[data-file-row]', 'gate4-test');
    await sleep(3200);
    const st = await readState();
    if (st.rows !== 4) {
      // 可能在连接页未连——点卡连接后重试
      await tapText('main div', 'Gate3验证服务器');
      await sleep(14000);
      await tapText('nav button', 'Gate3验证服务器');
      await sleep(2800);
      await tapText('[data-file-row]', 'gate4-test');
      await sleep(3200);
    }
    const st2 = await readState();
    assert(st2.rows === 4, `进入 gate4-test（4 行）`);
    return st2;
  }
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(7000);
  await connectWs();
  await tapText('nav button', '添加连接');
  await sleep(1200);
  await tapText('main div', 'Gate3验证服务器');
  await sleep(14000);
  await tapText('nav button', 'Gate3验证服务器');
  await sleep(2800);
  await tapText('[data-file-row]', 'gate4-test');
  await sleep(3200);
  const st = await readState();
  assert(st.rows === 4, `进入 gate4-test（4 行）`);
  return st;
}

async function main() {
  const results = {};
  wake();
  console.log('== 0 冷启动导航 ==');
  await bootToGate4();

  // ======== Phase A：network_interrupted（wifi 断网） ========
  console.log('\n== Phase A：network_interrupted（svc wifi disable → 操作触发） ==');
  adbShell('svc wifi disable');
  await sleep(4000);
  wake();
  await tapText('[data-file-row]', '财务目录');
  console.log('  已点财务目录，等待 ENETUNREACH→unreachable→回流…（22s）');
  await sleep(22000);
  const off = await readState();
  console.log('  断网后状态：', JSON.stringify(off));
  await screenshot('g4r-final-a-network-interrupted.png');
  assert(off.netInterrupted, 'A1 network_interrupted Banner（"网络已中断" warning）');
  assert(off.reconnectBtn, 'A2 "重连"按钮呈现');
  results.phaseA = { injected: 'svc wifi disable + listDirectory', afterBreak: off };

  console.log('  -- wifi enable → 重连 --');
  adbShell('svc wifi enable');
  console.log('  wifi enable 下发，等 18s 网络就绪…');
  await sleep(18000);
  wake();
  await tapText('button', '重连');
  await sleep(16000);
  const recA = await readState();
  console.log('  重连后状态：', JSON.stringify(recA));
  await screenshot('g4r-final-a-recovered.png');
  assert(!recA.netInterrupted && !recA.sessionInvalid, 'A3 Banner 清除');
  // 重连后目录可能回根——重进 gate4-test
  if (!recA.path.includes('gate4-test')) {
    await tapText('nav button', 'Gate3验证服务器');
    await sleep(2500);
    await tapText('[data-file-row]', 'gate4-test');
    await sleep(3200);
  }
  const stA = await readState();
  assert(stA.rows === 4, `A4 列表恢复可用（gate4-test 4 行，实际 ${stA.rows}）`);
  results.phaseA.recovered = stA;

  // ======== Phase B：session_invalid（改密码 + 仅断 ESTABLISHED） ========
  console.log('\n== Phase B：session_invalid（改密码 + ESTABLISHED RST → 操作协商失败） ==');
  const tB0 = new Date().toISOString();
  ssh(`printf '%s\\n%s\\n' '${TEMP_PW}' '${TEMP_PW}' | sudo smbpasswd -s pad2gate3 >/dev/null 2>&1 && echo PW_CHANGED`);
  console.log(`  [${tB0}] 服务器已改 pad2gate3 密码（临时）`);
  ssh(IPT_ADD_EST);
  console.log('  已插入 ESTABLISHED-only RST 规则（新连接放行）');
  await sleep(1500);
  wake();
  await tapText('[data-file-row]', '财务目录');
  console.log('  已点财务目录（旧连接 RST→jcifs 重连→旧凭据 LOGON_FAILURE）…等 18s');
  await sleep(18000);
  const offB = await readState();
  console.log('  操作后状态：', JSON.stringify(offB));
  if (!offB.sessionInvalid && !offB.netInterrupted) {
    console.log('  [INFO] 首次未出失效态，追加一次操作…');
    await tapText('[data-file-row]', '财务目录');
    await sleep(15000);
  }
  const offB2 = await readState();
  await screenshot('g4r-final-b-session-invalid.png');
  assert(offB2.sessionInvalid, 'B1 session_invalid Banner（"连接会话已失效" danger）');
  assert(offB2.reconnectBtn, 'B2 "重连"按钮呈现');
  results.phaseB = { injected: tB0, afterBreak: offB2 };

  console.log('  -- 还原密码 + 移除规则 + 重连 --');
  ssh(`printf '%s\\n%s\\n' '${ORIG_PW}' '${ORIG_PW}' | sudo smbpasswd -s pad2gate3 >/dev/null 2>&1 && echo PW_RESTORED`);
  ssh(IPT_DEL_EST);
  await sleep(2000);
  wake();
  await tapText('button', '重连');
  await sleep(16000);
  const recB = await readState();
  console.log('  恢复后状态：', JSON.stringify(recB));
  await screenshot('g4r-final-b-recovered.png');
  assert(!recB.sessionInvalid && !recB.netInterrupted, 'B3 失效 Banner 清除');
  if (!recB.path.includes('gate4-test')) {
    await tapText('nav button', 'Gate3验证服务器');
    await sleep(2500);
    await tapText('[data-file-row]', 'gate4-test');
    await sleep(3200);
  }
  const stB = await readState();
  assert(stB.rows === 4, `B4 列表恢复可用（4 行，实际 ${stB.rows}）`);
  results.phaseB.recovered = stB;

  // ======== 清理核验 ========
  const ipt = ssh('sudo iptables -L INPUT -n --line-numbers | grep 192.168.128.219 || echo NO_RULE');
  assert(ipt.includes('NO_RULE'), 'C1 iptables 无残留');
  const pwOk = ssh(`smbclient //localhost/share -U 'pad2gate3%${ORIG_PW}' -c 'ls gate4-test' 2>&1 | head -1`);
  assert(pwOk.includes('gate4-test') || pwOk.includes('D'), `C2 密码已还原（smbclient 通）`);
  results.cleanup = { iptables: 'clean', password: 'restored' };

  writeFileSync(join(OUT_DIR, 'g4r-final-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nGate-UI-4 方案 B 最终补验全部通过（两回流态真机注入 + 恢复 + 清理）');
  ws.close();
}

main().catch(async (e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try {
    ssh(`printf '%s\\n%s\\n' '${ORIG_PW}' '${ORIG_PW}' | sudo smbpasswd -s pad2gate3 >/dev/null 2>&1`);
    ssh(IPT_DEL_EST);
    try { adbShell('svc wifi enable'); } catch {}
    console.error('[CLEANUP] 已还原密码+移除规则+启用 wifi');
  } catch (e2) {
    console.error(`[CLEANUP-FAIL] ${e2.message}——请人工核验服务器`);
  }
  process.exit(1);
});