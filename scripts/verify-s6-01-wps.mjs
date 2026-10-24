/**
 * TASK-S6-01 WS-13/14：Windows Server 上 .xlsx/.xls WPS 编辑写回闭环（PM 授权仅验证——零代码变更）
 * APK：e7a67ee5…（S5-09 锚定版本）
 * 环境：\\192.168.2.247\soft\AutoFileBackup\PAD2-S6-01（guest，Windows Server，SMB 3.1.1）
 *
 * 每格式完整链：openInWps（真实下载+建会话基线）→WPS 前台→注入编辑版到缓存（模拟 WPS 保存后状态
 * ——与 S5-09 I-06 同款做法，回写链路 100% 真实执行）→checkLocalFileChanged（变更检测）→
 * writeback（writeFileSafe→服务器核验）→三方 SHA+内容级（soffice csv 标记）→重新打开可再编辑。
 * 判据：服务器端 get→sha256sum + csv 内容标记为唯一通过依据。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s6';
const SSH_KEY = process.env.HOME + '/.ssh/pad2_cred_closure';
const SMB = `timeout 90 smbclient //192.168.2.247/soft -U guest%`;
const D = `AutoFileBackup` + String.fromCharCode(92) + `PAD2-S6-01`;
const D_SL = 'AutoFileBackup/PAD2-S6-01';
const TMPW = 'C:/Users/DELL/AppData/Local/Temp';
const WPS = 'cn.wps.moffice_eng';
const BS = 'String.fromCharCode(92)';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 120000 });
}
function ssh(cmd) {
  return execFileSync('ssh', ['-i', SSH_KEY, 'debian@192.168.2.3', cmd], { encoding: 'utf8', timeout: 180000 });
}
function srvSha(remote) {
  ssh(`rm -f /tmp/s601v.bin`);
  const out = ssh(`${SMB} -c 'get "${remote}" /tmp/s601v.bin' 2>&1 || true`);
  if (!/getting file/i.test(String(out))) return null;
  return ssh(`sha256sum /tmp/s601v.bin`).trim().split(/\s+/)[0];
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
const call = (method, paramsExpr) => evalPage(`(async () => { const BS = String.fromCharCode(92); try { const r = await window.Capacitor.Plugins.SmbPlugin.${method}(${paramsExpr}); return 'OK:' + JSON.stringify(r).substring(0, 130); } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 100); } })()`, true);
const callFull = (method, paramsExpr) => evalPage(`(async () => { const BS = String.fromCharCode(92); try { const r = await window.Capacitor.Plugins.SmbPlugin.${method}(${paramsExpr}); return JSON.stringify(r); } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 100); } })()`, true);
function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (name) => `'AutoFileBackup' + ${BS} + 'PAD2-S6-01' + ${BS} + '${name}'`;

/** 单格式完整写回链（editSrv=远程编辑版路径，editLocal=本地副本） */
async function writebackFlow(file, editLocal, editSrv, mark, tag) {
  console.log(`\n===== ${tag} ${file} WPS 编辑写回闭环 =====`);
  // 基线就位（reset 后必有）
  const baseSha = srvSha(`${D_SL}/${file}`);
  assert(!!baseSha, `${tag}.0 服务器基线就位（${baseSha.substring(0, 12)}…）`);
  adbShell(`rm -f "/storage/emulated/0/PAD2/smb_cache/${file}"`);
  // 真实打开（下载+建检测基线）
  const open = await call('openInWps', `{ path: ${rel(file)} }`);
  assert(String(open).startsWith('OK'), `${tag}.1 openInWps 成功（下载+建会话基线）`);
  await sleep(8000);
  let focus = adbShell('dumpsys window | grep mCurrentFocus | head -1');
  assert(focus.includes(WPS), `${tag}.2 WPS 前台（真实打开${file}）`);
  await screenshot(`s601-${tag.toLowerCase()}-wps-open.png`);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(3000);
  const cacheSha1 = adbShell(`sha256sum '/storage/emulated/0/PAD2/smb_cache/${file}' 2>/dev/null`).trim().split(/\s+/)[0];
  assert(cacheSha1 === baseSha, `${tag}.3 缓存==服务器基线（下载完整）`);
  // 注入编辑版（模拟 WPS 保存后缓存状态——回写链路真实执行）
  adbShell(`rm -f "/storage/emulated/0/PAD2/smb_cache/${file}"`);
  execFileSync(ADB, ['-s', DEVICE, 'push', editLocal, `/storage/emulated/0/PAD2/smb_cache/${file}`]);
  const editSha = adbShell(`sha256sum '/storage/emulated/0/PAD2/smb_cache/${file}'`).trim().split(/\s+/)[0];
  const editSrvSha = ssh(`sha256sum ${editSrv}`).trim().split(/\s+/)[0];
  assert(editSha === editSrvSha, `${tag}.4 编辑版注入缓存（SHA==编辑版源）`);
  // 变更检测
  adbShell('logcat -c');
  const chk = await callFull('checkLocalFileChanged', '');
  console.log(`  [CHK] ${String(chk).substring(0, 100)}`);
  const chkOk = /"changed"\s*:\s*true|"changed"\s*:\s*"true"/i.test(String(chk));
  assert(chkOk, `${tag}.5 本地变更被检测（checkLocalFileChanged）`);
  // 回写
  const wb = await callFull('writeback', '');
  console.log(`  [WB ] ${String(wb).substring(0, 110)}`);
  assert(/"writebackSuccess"\s*:\s*true/.test(String(wb)), `${tag}.6 writeback 成功（writebackSuccess=true）`);
  const pid = adbShell('pidof com.pad2.filemanager').trim();
  const log = adbShell(`logcat -d --pid=${pid} 2>/dev/null | grep -iE "Writeback verified" | tail -2`);
  assert(/Writeback verified/i.test(String(log)), `${tag}.7 原生核验日志（Writeback verified——远端 SHA 匹配）`);
  // 服务器三件套：SHA + 内容
  const srvAfter = srvSha(`${D_SL}/${file}`);
  assert(srvAfter === editSrvSha && srvAfter !== baseSha, `${tag}.8 服务器==编辑版（三方一致：编辑源/缓存/服务器）`);
  ssh(`rm -f /tmp/s601w-rt.csv && mkdir -p /tmp/s601wrt`);
  const cvt = file.endsWith('.xls') ? 'xls' : 'xlsx';
  ssh(`cd /tmp && rm -f s601w-rt.${cvt} && cp /tmp/s601v.bin s601w-rt.${cvt} && soffice --headless --convert-to csv --outdir /tmp/s601wrt s601w-rt.${cvt} >/dev/null 2>&1 || true`);
  const csv = ssh(`cat /tmp/s601wrt/s601w-rt.csv 2>/dev/null || echo NOCSV`).trim();
  assert(csv.includes(mark), `${tag}.9 服务器内容含约定标记"${mark}"（内容级证据）`);
  // 重新打开可再编辑
  const reopen = await call('openInWps', `{ path: ${rel(file)} }`);
  assert(String(reopen).startsWith('OK'), `${tag}.10 回写后可重新打开（下轮编辑就绪）`);
  await sleep(8000);
  focus = adbShell('dumpsys window | grep mCurrentFocus | head -1');
  assert(focus.includes(WPS), `${tag}.11 WPS 前台（回写后文件可编辑）`);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(2500);
  return { base: baseSha.substring(0, 16), edit: editSrvSha.substring(0, 16), srv: srvAfter.substring(0, 16), contentMark: true };
}

async function main() {
  const results = { apk: 'e7a67ee5d5f537c59784cbf90453d5137d3c13b7cfe0c0d95cda0b20aaf1ee7b' };
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();

  // 服务器生成两格式编辑版（含约定标记）
  ssh(`cd /tmp && printf 'A1,colB\\nWS13-EDITED,真实写回\\nR3,行3\\n' > s601-e13.csv && soffice --headless --convert-to xlsx --outdir /tmp s601-e13.csv >/dev/null 2>&1`);
  ssh(`cd /tmp && printf 'A1,colB\\nWS14-EDITED,真实写回\\nR3,行3\\n' > s601-e14.csv && soffice --headless --convert-to xls --outdir /tmp s601-e14.csv >/dev/null 2>&1`);
  const e13 = ssh(`ls /tmp/s601-e13.xlsx 2>/dev/null`).trim();
  const e14 = ssh(`ls /tmp/s601-e14.xls 2>/dev/null`).trim();
  assert(!!e13 && !!e14, '编辑版生成（xlsx+xls）');
  execFileSync('scp', ['-i', SSH_KEY, 'debian@192.168.2.3:/tmp/s601-e13.xlsx', `${TMPW}/s601-e13.xlsx`]);
  execFileSync('scp', ['-i', SSH_KEY, 'debian@192.168.2.3:/tmp/s601-e14.xls', `${TMPW}/s601-e14.xls`]);

  // 连接
  const c = await call('connect', `{ host: '192.168.2.247', share: 'soft', username: 'guest', password: '' }`);
  assert(String(c).startsWith('OK'), '连接 Windows Server（guest）');

  // WS-13 .xlsx 写回闭环
  results.WS13 = await writebackFlow('测试表.xlsx', `${TMPW}/s601-e13.xlsx`, '/tmp/s601-e13.xlsx', 'WS13-EDITED', 'WS-13');
  await screenshot('s601-ws13-done.png');
  // WS-14 .xls 写回闭环
  results.WS14 = await writebackFlow('测试表.xls', `${TMPW}/s601-e14.xls`, '/tmp/s601-e14.xls', 'WS14-EDITED', 'WS-14');
  await screenshot('s601-ws14-done.png');

  writeFileSync(join(OUT_DIR, 's601-wps-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\n===== TASK-S6-01 WS-13/14 WPS 编辑写回闭环全部通过（Windows Server） =====');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try { writeFileSync(join(OUT_DIR, 's601-wps-result.json'), JSON.stringify({ error: e.message, ts: new Date().toISOString() }, null, 2)); } catch {}
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});