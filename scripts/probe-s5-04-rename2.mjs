/** S5-04 探针补测：同目录完整相对路径形式的 rename 2×2 矩阵（SMBJ FileName 相对共享根语义确认后） */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s5/s504-rename-probe2.json';

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

async function probe(path, newNameFullRelative, replace) {
  return JSON.parse(await evalPage(`(async () => {
    try {
      const r = await window.Capacitor.Plugins.SmbPlugin.renameProbe({
        path: ${JSON.stringify(path)},
        newName: ${JSON.stringify(newNameFullRelative)},
        replaceIfExists: ${replace},
      });
      return JSON.stringify({ ok: true, elapsedMs: r.elapsedMs, beforeMtime: r.beforeMtime });
    } catch (e) {
      return JSON.stringify({ ok: false, err: String(e.message || e).substring(0, 160) });
    }
  })()`));
}

async function main() {
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  await connectWs();
  const BS = '\\';
  const G = 'gate4-test';
  const results = {};
  const conn = await evalPage(`document.body.innerText.includes('已连接')`, false);
  if (!conn) throw new Error('未连接（请先连接）');

  // ===== T-A2: rename(false)+同目录目标不存在（完整相对路径） =====
  console.log('== T-A2 rename(false)+同目录目标不存在 ==');
  results.TA2 = await probe(`${G}${BS}p2源A.txt`, `${G}${BS}p2改名A.txt`, false);
  results.TA2_server = ssh(`cd /mnt/share/gate4-test && ls p2* && stat -c '%Y %n' p2改名A.txt 2>/dev/null`).trim();
  console.log(JSON.stringify(results.TA2), '| server:', results.TA2_server.replace(/\n/g, ' '));

  // ===== T-B2: rename(false)+同目录目标存在 =====
  console.log('== T-B2 rename(false)+同目录目标存在（p2源A→p2已存在）==');
  results.TB2 = await probe(`${G}${BS}p2改名A.txt`, `${G}${BS}p2已存在.txt`, false);
  results.TB2_server = ssh(`cd /mnt/share/gate4-test && stat -c '%s %n' p2已存在.txt p2改名A.txt 2>&1`).trim();
  console.log(JSON.stringify(results.TB2), '| server:', results.TB2_server.replace(/\n/g, ' '));

  // ===== T-C2: rename(true)+同目录目标不存在 =====
  console.log('== T-C2 rename(true)+同目录目标不存在（p2源C→p2改名C）==');
  results.TC2 = await probe(`${G}${BS}p2源C.txt`, `${G}${BS}p2改名C.txt`, true);
  results.TC2_server = ssh(`cd /mnt/share/gate4-test && ls p2*`).trim();
  console.log(JSON.stringify(results.TC2), '| server:', results.TC2_server.replace(/\n/g, ' '));

  // ===== T-D2: rename(true)+同目录目标存在（覆盖+内容核验） =====
  console.log('== T-D2 rename(true)+同目录目标存在（p2改名C→p2目标D 覆盖）==');
  results.TD2 = await probe(`${G}${BS}p2改名C.txt`, `${G}${BS}p2目标D.txt`, true);
  results.TD2_server = ssh(`cd /mnt/share/gate4-test && ls p2目标D.txt p2改名C.txt 2>&1 | head -2; cat p2目标D.txt`).trim();
  console.log(JSON.stringify(results.TD2), '| server:', results.TD2_server.replace(/\n/g, ' '));

  writeFileSync(OUT, JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  adbShell('svc power stayon false');
  console.log('\n补测完成');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});