/** TASK-S5-04 探针实测：SMBJ rename 语义 2×2 矩阵 + mtime 保留 + 耗时
 * T-A rename(false)+目标不存在；T-B rename(false)+目标存在；
 * T-C rename(true)+目标不存在；T-D rename(true)+目标存在（覆盖行为）。
 * 每组实测后服务器核验文件状态与 mtime。 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s5/s504-rename-probe.json';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 90000 });
}
function ssh(cmd) {
  return execFileSync('ssh', ['-i', process.env.HOME + '/.ssh/pad2_cred_closure', 'debian@192.168.2.3', cmd], {
    encoding: 'utf8', timeout: 90000,
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

async function evalPage(expression, awaitP = true) {
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

/** 直调探针 */
async function probe(path, newName, replace) {
  return JSON.parse(await evalPage(`(async () => {
    const BS = String.fromCharCode(92);
    try {
      const r = await window.Capacitor.Plugins.SmbPlugin.renameProbe({
        path: ${JSON.stringify(path)},
        newName: ${JSON.stringify(newName)},
        replaceIfExists: ${replace},
      });
      return JSON.stringify({ ok: true, elapsedMs: r.elapsedMs, beforeMtime: r.beforeMtime, beforeSize: r.beforeSize });
    } catch (e) {
      return JSON.stringify({ ok: false, err: String(e.message || e).substring(0, 180) });
    }
  })()`));
}

async function main() {
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  await connectWs();
  const G = 'gate4-test';
  const BS = '\\';
  const results = {};

  // 连接（点卡→重试）
  const clickEl = async (sel, text) => {
    const c = await evalPage(`(() => { const els = [...document.querySelectorAll('${sel}')]; const el = els.find((e) => (e.textContent || '').includes('${text}')); if (!el) return 'NF'; el.click(); return 'OK'; })()`, false);
    if (c !== 'OK') throw new Error('click fail: ' + text);
  };
  await clickEl('nav button', '添加连接');
  await new Promise((r) => setTimeout(r, 1200));
  await clickEl('main div', 'Gate3验证服务器');
  await new Promise((r) => setTimeout(r, 15000));
  let conn = await evalPage(`document.body.innerText.includes('已连接')`, false);
  if (!conn) {
    await clickEl('main div', 'Gate3验证服务器');
    await new Promise((r) => setTimeout(r, 16000));
    conn = await evalPage(`document.body.innerText.includes('已连接')`, false);
  }
  if (!conn) throw new Error('连接失败');
  console.log('connected');

  // ===== T-A: rename(false) + 目标不存在 =====
  console.log('== T-A rename(false)+目标不存在 ==');
  results.TA = await probe(`${G}${BS}pr源A.txt`, 'pr改名A.txt', false);
  results.TA_server = ssh(`ls /mnt/share/gate4-test/ | grep pr`).trim();
  console.log(JSON.stringify(results.TA), '| server:', results.TA_server.replace(/\n/g, ' '));

  // ===== T-C: rename(true) + 目标不存在（用 T-A 剩余产物或新文件） =====
  ssh(`printf 'probe-c' > /mnt/share/gate4-test/pr源C.txt`);
  await new Promise((r) => setTimeout(r, 500));
  console.log('== T-C rename(true)+目标不存在 ==');
  results.TC = await probe(`${G}${BS}pr源C.txt`, 'pr改名C.txt', true);
  results.TC_server = ssh(`ls /mnt/share/gate4-test/ | grep pr`).trim();
  console.log(JSON.stringify(results.TC), '| server:', results.TC_server.replace(/\n/g, ' '));

  // ===== T-B: rename(false) + 目标存在 =====
  ssh(`printf 'probe-b' > /mnt/share/gate4-test/pr源B.txt`);
  await new Promise((r) => setTimeout(r, 500));
  console.log('== T-B rename(false)+目标存在（目标=pr已存在.txt）==');
  results.TB = await probe(`${G}${BS}pr源B.txt`, 'pr已存在.txt', false);
  results.TB_server = ssh(`cd /mnt/share/gate4-test && ls pr* && stat -c '%s %n' pr已存在.txt`).trim();
  console.log(JSON.stringify(results.TB), '| server:', results.TB_server.replace(/\n/g, ' '));

  // ===== T-D: rename(true) + 目标存在（覆盖行为+数据核验） =====
  ssh(`cd /mnt/share/gate4-test && printf 'NEW-CONTENT-override' > pr目标D.txt && printf 'source-d-original' > pr源D.txt`);
  await new Promise((r) => setTimeout(r, 500));
  console.log('== T-D rename(true)+目标存在（pr源D→pr目标D，预期覆盖）==');
  results.TD = await probe(`${G}${BS}pr源D.txt`, 'pr目标D.txt', true);
  results.TD_server = ssh(`cd /mnt/share/gate4-test && ls pr目标D.txt pr源D.txt 2>&1 | head -2; cat pr目标D.txt 2>/dev/null`).trim();
  console.log(JSON.stringify(results.TD), '| server:', results.TD_server.replace(/\n/g, ' '));

  // ===== mtime 保留核验（对 T-C 产物） =====
  results.mtimeCheck = ssh(`cd /mnt/share/gate4-test && stat -c '%Y %n' pr改名C.txt 2>/dev/null || echo GONE`).trim();
  console.log('mtime(T-C 产物):', results.mtimeCheck);

  writeFileSync(OUT, JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  adbShell('svc power stayon false');
  console.log('\n探针实测完成');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});