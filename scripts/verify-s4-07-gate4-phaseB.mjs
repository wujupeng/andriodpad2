/** Gate-UI-4 Phase B v2：session_invalid 注入（改密码 + restart smbd 断会话）
 * 机制：smbd 重启优雅终止既有 SMB 会话（FIN）→ App 状态仍 connected →
 * 触发操作 → jcifs 透明重连+会话协商（旧密码）→ LOGON_FAILURE →
 * auth_failed → applyOperationError（connected 态）→ session_invalid danger Banner。
 * 前置：已连接且在 gate4-test。凭据经 env SMB_PW。 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s4';
const ORIG_PW = process.env.SMB_PW || 'Gate3-Test-2026';
const TEMP_PW = 'G4R-SessionInvalid-2026';

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

async function main() {
  const results = {};
  adbShell('input keyevent KEYCODE_WAKEUP');
  await connectWs();
  const pre = await readState();
  if (pre.rows !== 4) {
    // 列表空态则重挂载刷新
    await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
    await sleep(1200);
    await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.includes('Gate3验证服务器')); b?.click(); return 'OK'; })()`);
    await sleep(3500);
  }
  const pre2 = await readState();
  assert(pre2.rows === 4, `前置：gate4-test 4 行（实际 ${pre2.rows}）`);

  console.log('== Phase B v2：session_invalid（改密码 + restart smbd） ==');
  const tB0 = new Date().toISOString();
  ssh(`printf '%s\\n%s\\n' '${TEMP_PW}' '${TEMP_PW}' | sudo smbpasswd -s pad2gate3 >/dev/null 2>&1 && echo PW_CHANGED`);
  ssh('sudo systemctl restart smbd');
  console.log(`  [${tB0}] 密码已改（临时）+ smbd 已重启（会话优雅终止）`);
  await sleep(3000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await tapText('[data-file-row]', '财务目录');
  console.log('  已点财务目录，等 jcifs 重连→LOGON_FAILURE→auth_failed→session_invalid…（18s）');
  await sleep(18000);
  const st = await readState();
  console.log('  操作后状态：', JSON.stringify(st));
  await screenshot('g4r-final-b-session-invalid.png');
  assert(st.sessionInvalid, 'B1 session_invalid Banner（"连接会话已失效" danger）');
  assert(st.reconnectBtn, 'B2 "重连"按钮呈现');
  results.phaseB = { injected: tB0, method: 'password change + smbd restart + listDirectory', afterBreak: st };

  console.log('  -- 还原密码 + 重连恢复 --');
  ssh(`printf '%s\\n%s\\n' '${ORIG_PW}' '${ORIG_PW}' | sudo smbpasswd -s pad2gate3 >/dev/null 2>&1 && echo PW_RESTORED`);
  await sleep(1500);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await tapText('button', '重连');
  await sleep(16000);
  const rec = await readState();
  console.log('  重连后状态：', JSON.stringify(rec));
  await screenshot('g4r-final-b-recovered.png');
  assert(!rec.sessionInvalid && !rec.netInterrupted, 'B3 失效 Banner 清除');
  // 重挂载刷新列表
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1200);
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.includes('Gate3验证服务器')); b?.click(); return 'OK'; })()`);
  await sleep(3500);
  const st2 = await readState();
  assert(st2.rows === 4, `B4 列表恢复可用（4 行，实际 ${st2.rows}）`);
  results.phaseB.recovered = st2;

  const pwOk = ssh(`smbclient //localhost/share -U 'pad2gate3%${ORIG_PW}' -c 'ls gate4-test' 2>&1 | head -1`);
  assert(pwOk.includes('gate4-test') || pwOk.includes('D'), 'C 密码已还原（smbclient 通）');
  results.cleanup = { password: 'restored', smbd: 'restarted(normal)' };

  writeFileSync(join(OUT_DIR, 'g4r-final-b-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nPhase B v2（session_invalid）补验通过');
  ws.close();
}

main().catch(async (e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try {
    ssh(`printf '%s\\n%s\\n' '${ORIG_PW}' '${ORIG_PW}' | sudo smbpasswd -s pad2gate3 >/dev/null 2>&1`);
    console.error('[CLEANUP] 已还原密码');
  } catch {}
  process.exit(1);
});