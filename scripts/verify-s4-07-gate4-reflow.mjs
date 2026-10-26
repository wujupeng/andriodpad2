/**
 * Gate-UI-4 方案 B 补验（PM 2026-10-21 批准）：两回流态真机注入
 * Phase A network_interrupted：服务器 iptables RST 断已建立连接 → 平板操作
 *   （进子目录 listDirectory）→ jcifs "Connection reset/aborted" → network_lost
 *   → browseStore 回流 applyOperationError → network_interrupted + SessionStatusStrip
 *   warning Banner → 移除规则 → 点"重连" → 恢复 connected + Banner 清除
 * Phase B session_invalid：服务器改 pad2gate3 密码 + RST 断连接 → 平板操作 →
 *   jcifs 内部重连会话协商失败 LOGON_FAILURE → auth_failed → 回流 session_invalid
 *   + danger Banner → 恢复密码 → 点"重连"（携带存储凭据）→ 恢复 connected
 * 前置：屏幕唤醒（熄屏会冻结 WebView 定时器——本轮已确诊的根因）、已连接、
 * 在 gate4-test 目录。凭据经 env（SMB_PW 为可恢复的原密码）。
 */
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s4';
const SSH = 'ssh -i ~/.ssh/pad2_cred_closure debian@192.168.2.3';
const TABLET_IP = '192.168.128.219';
const ORIG_PW = process.env.SMB_PW || 'Gate3-Test-2026';
const TEMP_PW = 'G4R-SessionInvalid-2026';
const IPTABLES_ADD = `sudo iptables -I INPUT -p tcp -s ${TABLET_IP} --dport 445 -j REJECT --reject-with tcp-reset`;
const IPTABLES_DEL = `sudo iptables -D INPUT -p tcp -s ${TABLET_IP} --dport 445 -j REJECT --reject-with tcp-reset`;

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 60000 });
}

function ssh(cmd) {
  return execFileSync('ssh', ['-i', process.env.HOME + '/.ssh/pad2_cred_closure', 'debian@192.168.2.3', cmd], {
    encoding: 'utf8',
    timeout: 60000,
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

function wake() {
  adbShell('input keyevent KEYCODE_WAKEUP');
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** 触发一次目录操作（点子目录行→listDirectory） */
async function triggerOperation(dirName) {
  const pos = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('[data-file-row]')];
      const target = rows.find((r) => (r.textContent || '').includes(${JSON.stringify(dirName)}));
      if (!target) return 'NOT_FOUND';
      const r = target.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()
  `);
  if (pos === 'NOT_FOUND') throw new Error(`目录行未找到 "${dirName}"`);
  const { x, y } = JSON.parse(pos);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await sleep(95);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x, y }] });
}

/** 读页面关键状态（连接徽章/状态条/Banner/重连按钮） */
async function readState() {
  return JSON.parse(
    await evalPage(`
    (() => {
      const t = document.body.innerText;
      const status = document.querySelector('[role="status"]');
      return JSON.stringify({
        netInterrupted: t.includes('网络已中断'),
        sessionInvalid: t.includes('连接会话已失效'),
        reconnectBtn: !!([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重连')),
        bannerText: status ? status.textContent.substring(0, 60) : '无',
        navPath: (document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || '无',
        rows: document.querySelectorAll('[data-file-row]').length,
      });
    })()
  `),
  );
}

/** 点 SessionStatusStrip 的"重连"按钮 */
async function clickReconnect() {
  const clicked = await evalPage(`
    (() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重连');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()
  `);
  if (clicked !== 'CLICKED') throw new Error('重连按钮未找到');
}

async function main() {
  const results = {};
  console.log('== 0 前置：唤醒+连接状态确认 ==');
  wake();
  await connectWs();
  await sleep(500);
  const pre = await readState();
  assert(pre.rows === 4 && pre.navPath.includes('gate4-test'), `当前 gate4-test（4 行）：${pre.navPath}`);
  console.log('  [STAT] 起始状态：', JSON.stringify(pre));

  // ============ Phase A：network_interrupted ============
  console.log('\n== Phase A：network_interrupted 注入（iptables RST 断连接） ==');
  const tA0 = new Date().toISOString();
  ssh(IPTABLES_ADD);
  console.log(`  [${tA0}] 服务器已插入 RST 规则`);
  await sleep(1500);
  wake();
  await triggerOperation('财务目录');
  console.log('  [操作] 点击"财务目录"（listDirectory）…等待错误回流');
  await sleep(12000);
  const afterBreak = await readState();
  console.log('  [STAT] 断连后：', JSON.stringify(afterBreak));
  await screenshot('g4r-a-network-interrupted.png');
  assert(afterBreak.netInterrupted, 'network_interrupted Banner 呈现（"网络已中断"）');
  assert(afterBreak.reconnectBtn, '"重连"按钮呈现');
  results.phaseA = { injected: tA0, afterBreak };

  console.log('  -- 恢复：移除 RST 规则 + 点重连 --');
  ssh(IPTABLES_DEL);
  await sleep(2000);
  wake();
  await clickReconnect();
  await sleep(15000);
  const afterReconnect = await readState();
  console.log('  [STAT] 重连后：', JSON.stringify(afterReconnect));
  await screenshot('g4r-a-recovered.png');
  assert(!afterReconnect.netInterrupted, 'Banner 已清除');
  // 重连后回根目录（重连会重建会话，可能停在当前目录或根目录——断言连接恢复即可，再导航回 gate4-test）
  const connectedAgain = await evalPage(`document.body.innerText.includes('已连接')`);
  assert(connectedAgain, '连接恢复（已连接）');
  // 导航回 gate4-test 供 Phase B
  const navBack = await evalPage(`
    (() => {
      const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button, nav[aria-label="路径导航"] a, nav[aria-label="路径导航"] span')];
      const gate = segs.find((s) => s.textContent.includes('gate4-test'));
      if (gate) { gate.click(); return 'CLICKED'; }
      return 'NOT_FOUND';
    })()
  `);
  void navBack;
  await sleep(2500);
  let state = await readState();
  if (!state.navPath.includes('gate4-test')) {
    // 重新从根目录进入
    await triggerOperation('gate4-test');
    await sleep(3000);
    state = await readState();
  }
  assert(state.navPath.includes('gate4-test'), `回到 gate4-test（${state.navPath}）`);
  results.phaseA.recovered = afterReconnect;

  // ============ Phase B：session_invalid ============
  console.log('\n== Phase B：session_invalid 注入（改密码 + RST 断连接） ==');
  const tB0 = new Date().toISOString();
  // 改密码（printf 两行新密码喂 smbpasswd -s）
  ssh(`printf '%s\\n%s\\n' '${TEMP_PW}' '${TEMP_PW}' | sudo smbpasswd -s pad2gate3 >/dev/null 2>&1 && echo PW_CHANGED`);
  console.log(`  [${tB0}] 服务器已改 pad2gate3 密码（临时）`);
  ssh(IPTABLES_ADD);
  console.log('  服务器已插入 RST 规则');
  await sleep(1500);
  wake();
  await triggerOperation('财务目录');
  console.log('  [操作] 点击"财务目录"（连接断→重连协商→旧凭据 LOGON_FAILURE）…');
  await sleep(15000);
  let afterAuth = await readState();
  console.log('  [STAT] 第一次操作后：', JSON.stringify(afterAuth));
  if (!afterAuth.sessionInvalid && !afterAuth.netInterrupted) {
    // 可能首次错误为 network_lost（库未自动重连）——再触发一次操作促使重连协商
    console.log('  [INFO] 首次未出现失效态，追加第二次操作…');
    await triggerOperation('财务目录');
    await sleep(12000);
    afterAuth = await readState();
    console.log('  [STAT] 第二次操作后：', JSON.stringify(afterAuth));
  }
  await screenshot('g4r-b-session-invalid.png');
  assert(afterAuth.sessionInvalid, 'session_invalid Banner 呈现（"连接会话已失效"，danger）');
  assert(afterAuth.reconnectBtn, '"重连"按钮呈现');
  results.phaseB = { injected: tB0, afterAuth };

  console.log('  -- 恢复：还原密码 + 移除规则 + 点重连 --');
  ssh(`printf '%s\\n%s\\n' '${ORIG_PW}' '${ORIG_PW}' | sudo smbpasswd -s pad2gate3 >/dev/null 2>&1 && echo PW_RESTORED`);
  ssh(IPTABLES_DEL);
  await sleep(2000);
  wake();
  await clickReconnect();
  await sleep(15000);
  const afterRestore = await readState();
  console.log('  [STAT] 恢复后：', JSON.stringify(afterRestore));
  await screenshot('g4r-b-recovered.png');
  assert(!afterRestore.sessionInvalid, '失效 Banner 已清除');
  const connectedB = await evalPage(`document.body.innerText.includes('已连接')`);
  assert(connectedB, '重连恢复（存储凭据有效）');
  results.phaseB.recovered = afterRestore;

  // 清理核验：iptables 无残留规则
  const ipt = ssh('sudo iptables -L INPUT -n --line-numbers | grep 192.168.128.219 || echo NO_RULE');
  assert(ipt.includes('NO_RULE'), 'iptables 规则无残留');
  const pwOk = ssh(`smbclient //localhost/share -U 'pad2gate3%${ORIG_PW}' -c 'ls gate4-test' 2>&1 | head -1`);
  assert(pwOk.includes('gate4-test') || pwOk.includes('.'), `密码已还原（smbclient 验证通）`);
  results.cleanup = { iptables: 'clean', password: 'restored' };

  writeFileSync(join(OUT_DIR, 'g4r-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nGate-UI-4 方案 B 补验全部通过（两回流态真机注入+恢复）');
  ws.close();
}

main().catch(async (e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  // 失败也必须清理服务器状态（密码+防火墙）
  try {
    ssh(`printf '%s\\n%s\\n' '${ORIG_PW}' '${ORIG_PW}' | sudo smbpasswd -s pad2gate3 >/dev/null 2>&1`);
    ssh(IPTABLES_DEL);
    console.error('[CLEANUP] 已还原密码并移除 iptables 规则');
  } catch (e2) {
    console.error(`[CLEANUP-FAIL] ${e2.message}——请人工核验服务器`);
  }
  process.exit(1);
});