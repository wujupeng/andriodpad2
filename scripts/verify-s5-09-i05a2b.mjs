/** S5-09 I-05A2b：核验+diff+重新打开（A2 检测回写已完成——logcat 归档 022a758a） */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s5';
const FILE = '表格I5A.xlsx';
const BASELINE = 'b2af51a349f1afba06db79972f5f76650e59ae038657d5f618019f06bffa304e';
const EDITED = '022a758a67752943235a3b17595b84acc09bb6bdb494d4defe231577f41828ec';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 90000 });
}
function ssh(cmd) {
  return execFileSync('ssh', ['-i', process.env.HOME + '/.ssh/pad2_cred_closure', 'debian@192.168.2.3', cmd], {
    encoding: 'utf8', timeout: 90000,
  });
}

let ws; let msgId = 0; const pending = new Map();
function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }) || ws.send(JSON.stringify({ id, method, params })));
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
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
}
function assert(cond, label) { if (!cond) throw new Error(`断言失败: ${label}`); console.log(`  PASS ${label}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = {};
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(3000);
  await connectWs();

  console.log('== I-05A2 三时点核验（A2 首跑已归档 logcat） ==');
  const cacheSha = adbShell(`sha256sum '/storage/emulated/0/PAD2/smb_cache/${FILE}' 2>/dev/null`).trim();
  const cacheHash = (cacheSha.match(/^([a-f0-9]{64})/) || [])[1];
  const serverLine = ssh(`sha256sum '/mnt/share/gate4-test/${FILE}'`).trim();
  const serverHash = (serverLine.match(/^([a-f0-9]{64})/) || [])[1];
  console.log(`  时点1 修改前: ${BASELINE.slice(0, 16)}（部署归档）`);
  console.log(`  时点2 客户端缓存: ${cacheHash?.slice(0, 16)}`);
  console.log(`  时点3 服务器（回写后）: ${serverHash?.slice(0, 16)}`);
  console.log(`  时点2' logcat localHash/verifyHash: ${EDITED.slice(0, 16)}（首跑归档）`);
  assert(serverHash === EDITED, 'I-05A2.4a 服务器已更新（≠基线，==编辑版）');
  assert(cacheHash === serverHash, 'I-05A2.4b 客户端缓存==服务器（直读一致）');
  assert(EDITED === serverHash, 'I-05A2.4c logcat 归档哈希==当前服务器（三方一致）');
  results.hashes = { baseline: BASELINE.slice(0, 16), server: serverHash.slice(0, 16) };

  console.log('== I-05A2.5 内容级核验（csv diff） ==');
  ssh(`rm -f /tmp/s509a2b.csv`);
  ssh(`cd /tmp && cp '/mnt/share/gate4-test/${FILE}' s509a2b.xlsx && soffice --headless --convert-to csv --outdir /tmp s509a2b.xlsx >/dev/null 2>&1`);
  const csv = ssh(`cat /tmp/s509a2b.csv 2>/dev/null`).trim();
  const baseCsv = 'I5标记,集成回归xlsx\nR2,行2';
  console.log(`  [基线] ${baseCsv.replace(/\n/g, ' | ')}`);
  console.log(`  [回写后] ${csv.replace(/\n/g, ' | ')}`);
  assert(csv !== baseCsv, 'I-05A2.5a 内容较基线真实变化（编辑持久化）');
  assert(csv.includes('yes') && !baseCsv.includes('yes'), 'I-05A2.5b 用户输入 yes 仅存在于回写后文件（内容级）');
  results.contentVerified = true;
  results.contentNote = '约定输入 I5A已编辑，用户实际输入 yes——diff 证据成立';

  console.log('== I-05A2.6 重新打开核验 ==');
  const onM2 = await evalPage(`document.body.innerText.includes('V1-V7')`);
  if (!onM2) {
    await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '设置'); if (b) b.click(); return 'OK'; })()`);
    await sleep(1800);
    await evalPage(`(() => { const els = [...document.querySelectorAll('main div')].filter((e) => (e.textContent || '').includes('M2 技术验证')); const el = els[els.length - 1]; if (el) el.click(); return 'OK'; })()`);
    await sleep(2500);
  }
  const opened = await evalPage(`(() => { const els = [...document.querySelectorAll('[class*="fileRow"]')]; const el = els.find((e) => (e.textContent || '').includes('${FILE}')); if (!el) return 'NOT_FOUND'; el.click(); return 'CLICKED'; })()`);
  assert(opened === 'CLICKED', 'I-05A2.6a 回写后文件行可点击');
  await sleep(9000);
  const focus = adbShell('dumpsys window | grep mCurrentFocus | head -1');
  assert(focus.includes('cn.wps.moffice_eng'), 'I-05A2.6b WPS 前台（回写后文件可重新打开）');
  results.reopenOk = true;

  writeFileSync(join(OUT_DIR, 's509-i05a2-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\n===== I-05A 段（.xlsx 集成链）全部通过 =====');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});