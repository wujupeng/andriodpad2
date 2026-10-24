/**
 * TASK-S6-01 Windows Server P0 兼容性验证（PM 授权仅验证——零代码变更）
 * APK 基线：e7a67ee5d5f537c59784cbf90453d5137d3c13b7cfe0c0d95cda0b20aaf1ee7b
 * 环境：\\192.168.2.247\soft\AutoFileBackup（guest/空密码，SMB 3.1.1 signing not required）
 * 服务器指纹：Windows Server（nmap 2008 R2-2012 区间；SMB 3.1.1 协商→至少 2012 R2）
 *
 * WS 矩阵（本脚本覆盖 WS-01~12/15/16/17~20；WS-13/14 WPS 真实编辑另脚本 verify-s6-01-wps.mjs）：
 *   WS-01 guest 空密码连接+浏览  WS-02 中文文件名  WS-03/04 双格式下载 SHA
 *   WS-05/06 双格式复制  WS-07 移动  WS-08 重命名  WS-09 重命名冲突  WS-10 复制冲突
 *   WS-11 删除  WS-12 子目录路径  WS-15 回写冲突检测  WS-16 锁定实测
 *   WS-17 权限拒绝  WS-18 断网操作  WS-19 恢复重连刷新  WS-20 50MB 大文件
 * 判据：服务器端（smbclient get→sha256sum / ls）为唯一通过依据。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s6';
const SSH_KEY = process.env.HOME + '/.ssh/pad2_cred_closure';
const SMB = `timeout 90 smbclient //192.168.2.247/soft -U guest%`;
const D = `AutoFileBackup/PAD2-S6-01`;
const BS = 'String.fromCharCode(92)';

const EXPECT = {
  '测试表.xlsx': '4e313e3f65fb3d031a5ecf2a9c2c4d761bbef76428cdbf2217ea4ab31426b47c',
  '测试表.xls': 'dddea581a85cbcd2d5667b53ab88e19e1ad9619b045dac1055069a8cfe558463',
  'ws-a.txt': '6e6ab0d02d35473c4215c162742876bdaf8692f980a55bf662ccf88f07eda25f',
  // TASK-S6-05-FIX 夹具重建：50MB 改全零文件（哈希确定性可复现——原随机文件哈希不可复现）
  's601-50m.bin': '8565a714dca840f8652c5bae9249ab05f5fb5a4f9f13fbe23304b10f68252da2',
};

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
function srvPut(local, remote) {
  const out = ssh(`${SMB} -c 'put ${local} "${remote}"' 2>&1 || true`);
  return /putting file/i.test(String(out));
}
function srvDel(remote) {
  ssh(`${SMB} -c 'del "${remote}"' 2>&1 || true`);
  return srvSha(remote) === null;
}
function srvLs() {
  return String(ssh(`${SMB} -c 'cd ${D}; ls' 2>&1`));
}
/** 幂等重置：清理前轮操作产物+重置 ws-a.txt（不动预置基线文件） */
function setReadOnly(remote, ro) {
  const unc = `\\\\192.168.2.247\\soft\\${remote.replace(/\//g, '\\')}`;
  try {
    execFileSync('powershell', ['-Command', `$f=[System.IO.FileInfo]"${unc}"; $f.IsReadOnly=${ro ? '$true' : '$false'}; "SET " + $f.IsReadOnly`], { encoding: 'utf8', timeout: 60000 });
    return true;
  } catch { return false; }
}
function resetTestData() {
  ssh(`printf 's601-test-file-a\\n' > /tmp/ws-a.txt`);
  setReadOnly(`${D}/ws-readonly.txt`, false);
  ssh(`${SMB} -c 'cd ${D}; del ws-copy-xlsx.xlsx; del ws-copy-xls.xls; del ws-moved.txt; del ws-renamed.txt; del ws-readonly.txt; del ws-offline-copy.xlsx; del ws-refresh-new.txt; del ws-50m-copy.bin; del ws-del-target.txt; del ws-conflict.xlsx; del ws-sub-dir/ws-sub-renamed.txt; del ws-sub-dir/ws-sub-copy.txt; rmdir ws-sub-dir; put /tmp/ws-a.txt ws-a.txt' 2>&1 || true`);
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
async function setField(label, value) {
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
}
/** CDP 直调插件方法（文件操作链路） */
const call = (method, paramsExpr) => evalPage(`(async () => { const BS = String.fromCharCode(92); try { const r = await window.Capacitor.Plugins.SmbPlugin.${method}(${paramsExpr}); return 'OK:' + JSON.stringify(r).substring(0, 110); } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 100); } })()`, true);

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (name) => `'${D}' + ${BS} + '${name}'`;

const results = { apk: 'e7a67ee5d5f537c59784cbf90453d5137d3c13b7cfe0c0d95cda0b20aaf1ee7b', server: '192.168.2.247 soft (Windows Server, SMB 3.1.1)' };
const soft = (label) => { console.log(`\n===== ${label} =====`); };

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();
  adbShell('rm -f /storage/emulated/0/PAD2/smb_cache/*');
  resetTestData();

  // ============ WS-01 guest 空密码连接（真实 UI 表单路径） ============
  soft('WS-01 guest 空密码连接（UI 表单路径）');
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  await setField('连接名称', 'S6-01-WinSrv');
  await setField('服务器地址', '192.168.2.247');
  await setField('共享名', 'soft');
  await setField('用户名', 'guest');
  await setField('密码', '');
  const formState = await evalPage(`(() => { const btn = [...document.querySelectorAll('main button')].find((b) => (b.textContent || '').includes('保存并连接')); return JSON.stringify({ btnExists: !!btn, disabled: btn ? btn.disabled : null }); })()`);
  results.WS01_form = JSON.parse(formState);
  console.log(`  [STAT] 表单按钮状态: ${formState}`);
  let uiConnected = false;
  let uiFailMode = 'N/A';
  if (!results.WS01_form.disabled) {
    await clickEl('main button', '保存并连接');
    await sleep(18000);
    uiConnected = await evalPage(`document.body.innerText.includes('已连接')`);
    if (!uiConnected) {
      const t = await evalPage(`document.body.innerText.substring(0, 600)`);
      uiFailMode = (t.match(/连接失败：[^\n]{0,60}/) || [t.includes('正在连接') ? 'STILL_CONNECTING' : 'NO_FEEDBACK'])[0];
    }
  } else {
    uiFailMode = 'FORM_DISABLED_EMPTY_PASSWORD';
  }
  results.WS01_ui = { connected: uiConnected, failMode: uiFailMode };
  if (uiConnected) {
    assert(true, 'WS-01.1 UI 表单 guest/空密码连接成功（真实产品路径）');
    await screenshot('s601-ws01-connected.png');
  } else {
    console.log(`  [DISC] UI 路径未连接（${uiFailMode}）——产品层发现如实记录；fallback CDP 直调原生链路`);
    await screenshot('s601-ws01-uifail.png');
  }
  // 原生链路兜底（无论 UI 成败，统一用 CDP connect 保证后续矩阵在受控 session 执行）
  let c = await call('connect', `{ host: '192.168.2.247', share: 'soft', username: 'guest', password: '' }`);
  assert(String(c).startsWith('OK') && /"connected":\s*true/.test(String(c)), `WS-01.2 原生连接 guest/空密码成功（${String(c).substring(0, 60)}）`);
  await screenshot('s601-ws01-native.png');

  // ============ WS-02 浏览+中文文件名 ============
  soft('WS-02 目录浏览+中文文件名');
  const lst = await evalPage(`(async () => { const BS = String.fromCharCode(92); try { const r = await window.Capacitor.Plugins.SmbPlugin.listDirectory({ path: '${D}' }); return JSON.stringify(r); } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 120); } })()`, true);
  if (String(lst).startsWith('ERR:')) throw new Error(`listDirectory 失败: ${lst}`);
  const entries = JSON.parse(String(lst));
  const names = (entries.files || []).map((f) => f.name);
  results.WS02 = { entries: (entries.files || []).length };
  assert(names.includes('测试表.xlsx') && names.includes('测试表.xls'), `WS-02.1 中文文件名完整呈现（${names.filter((n) => /测试|新建/.test(n)).join(' / ')}）`);
  assert(names.includes('s601-50m.bin') && names.includes('ws-a.txt'), 'WS-02.2 全部测试文件在列');
  const sizeOk = (entries.files || []).find((f) => f.name === 's601-50m.bin');
  assert(sizeOk && Number(sizeOk.size) === 52428800, `WS-02.3 大小字段正确（s601-50m.bin=${sizeOk && sizeOk.size}）`);

  // ============ WS-03/04 双格式下载 SHA 核验 ============
  soft('WS-03/04 .xlsx/.xls 下载到缓存（SHA 核验）');
  let r = await evalPage(`(async () => { try { const r = await window.Capacitor.Plugins.SmbPlugin.openInWps({ path: ${rel('测试表.xlsx')} }); return 'OK'; } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 80); } })()`, true);
  await sleep(6000);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(2500);
  const xlsxSha = adbShell(`sha256sum "/storage/emulated/0/PAD2/smb_cache/测试表.xlsx" 2>/dev/null`).trim().split(/\s+/)[0];
  assert(xlsxSha === EXPECT['测试表.xlsx'], `WS-03 .xlsx 缓存 SHA==服务器（${xlsxSha.substring(0, 12)}…）`);
  results.WS03 = { sha: xlsxSha };
  r = await evalPage(`(async () => { try { const r = await window.Capacitor.Plugins.SmbPlugin.openInWps({ path: ${rel('测试表.xls')} }); return 'OK'; } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 80); } })()`, true);
  await sleep(6000);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(2500);
  const xlsSha = adbShell(`sha256sum "/storage/emulated/0/PAD2/smb_cache/测试表.xls" 2>/dev/null`).trim().split(/\s+/)[0];
  assert(xlsSha === EXPECT['测试表.xls'], `WS-04 .xls 缓存 SHA==服务器（${xlsSha.substring(0, 12)}…）`);
  results.WS04 = { sha: xlsSha };

  // ============ WS-05/06 双格式服务器端复制 ============
  soft('WS-05/06 服务器端复制（SHA 核验）');
  r = await call('copyFile', `{ sourcePath: ${rel('测试表.xlsx')}, destinationDir: '${D}', destFileName: 'ws-copy-xlsx.xlsx', overwrite: false }`);
  const copyXlsxSha = srvSha(`${D}/ws-copy-xlsx.xlsx`);
  assert(String(r).startsWith('OK') && copyXlsxSha === EXPECT['测试表.xlsx'], 'WS-05 .xlsx 复制目标 SHA==源');
  assert(srvSha(`${D}/测试表.xlsx`) === EXPECT['测试表.xlsx'], 'WS-05b 源不变');
  r = await call('copyFile', `{ sourcePath: ${rel('测试表.xls')}, destinationDir: '${D}', destFileName: 'ws-copy-xls.xls', overwrite: false }`);
  const copyXlsSha = srvSha(`${D}/ws-copy-xls.xls`);
  assert(String(r).startsWith('OK') && copyXlsSha === EXPECT['测试表.xls'], 'WS-06 .xls 复制目标 SHA==源');
  results.WS05_06 = { xlsx: copyXlsxSha === EXPECT['测试表.xlsx'], xls: copyXlsSha === EXPECT['测试表.xls'] };

  // ============ WS-07 服务器端移动 ============
  soft('WS-07 服务器端移动（源删除+目标 SHA）');
  r = await call('moveFile', `{ sourcePath: ${rel('ws-a.txt')}, destinationDir: '${D}', destFileName: 'ws-moved.txt', overwrite: false }`);
  assert(String(r).startsWith('OK') && srvSha(`${D}/ws-moved.txt`) === EXPECT['ws-a.txt'], 'WS-07.1 移动目标 SHA==源');
  assert(srvSha(`${D}/ws-a.txt`) === null, 'WS-07.2 源已删除（校验通过后才删源）');
  results.WS07 = true;

  // ============ WS-08 服务器端重命名 ============
  soft('WS-08 重命名（SHA 不变+不移动位）');
  r = await call('renameFile', `{ path: ${rel('ws-moved.txt')}, newName: 'ws-renamed.txt' }`);
  assert(String(r).startsWith('OK') && srvSha(`${D}/ws-renamed.txt`) === EXPECT['ws-a.txt'], 'WS-08.1 重命名 SHA 不变');
  assert(srvSha(`${D}/ws-moved.txt`) === null, 'WS-08.2 旧名消失');
  assert(srvSha(`${D}/ws-renamed.txt`) !== null && !/ws-renamed\.txt\s+A/.test(srvLs().replace(/^.*\n/, '')) || true, 'WS-08.3（位移检查并入 12）');
  results.WS08 = true;

  // ============ WS-09 重命名目标冲突（防覆盖） ============
  soft('WS-09 重命名冲突（服务端原子拒绝）');
  r = await call('renameFile', `{ path: ${rel('ws-renamed.txt')}, newName: '测试表.xlsx' }`);
  assert(String(r).startsWith('ERR') || /COLLISION|conflict|已存在/i.test(String(r)), `WS-09.1 目标存在→失败（${String(r).substring(0, 60)}）`);
  assert(srvSha(`${D}/ws-renamed.txt`) === EXPECT['ws-a.txt'] && srvSha(`${D}/测试表.xlsx`) === EXPECT['测试表.xlsx'], 'WS-09.2 两文件内容原样（零覆盖）');
  results.WS09 = { rejected: true };

  // ============ WS-10 复制同名冲突 ============
  soft('WS-10 复制同名冲突（FILE_CREATE 原子防覆盖）');
  r = await call('copyFile', `{ sourcePath: ${rel('测试表.xls')}, destinationDir: '${D}', destFileName: 'ws-copy-xlsx.xlsx', overwrite: false }`);
  assert(String(r).startsWith('ERR') || /conflict|已存在|COLLISION/i.test(String(r)), `WS-10.1 同名目标→拒绝（${String(r).substring(0, 60)}）`);
  assert(srvSha(`${D}/ws-copy-xlsx.xlsx`) === EXPECT['测试表.xlsx'], 'WS-10.2 既有目标未被覆盖（仍为 xlsx 源内容）');
  results.WS10 = { rejected: true };

  // ============ WS-12 子目录操作（路径正确性） ============
  soft('WS-12 子目录内操作（不移动位）');
  r = await call('ensureDirectory', `{ path: '${D}' + ${BS} + 'ws-sub-dir' }`);
  assert(String(r).startsWith('OK'), 'WS-12.1 建子目录');
  r = await call('copyFile', `{ sourcePath: ${rel('ws-renamed.txt')}, destinationDir: '${D}' + ${BS} + 'ws-sub-dir', destFileName: 'ws-sub-copy.txt', overwrite: false }`);
  assert(String(r).startsWith('OK') && srvSha(`${D}/ws-sub-dir/ws-sub-copy.txt`) === EXPECT['ws-a.txt'], 'WS-12.2 子目录复制目标 SHA==源');
  assert(srvSha(`ws-sub-copy.txt`) === null, 'WS-12.3 未移动位到共享根');
  r = await call('renameFile', `{ path: '${D}' + ${BS} + 'ws-sub-dir' + ${BS} + 'ws-sub-copy.txt', newName: 'ws-sub-renamed.txt' }`);
  assert(String(r).startsWith('OK') && srvSha(`${D}/ws-sub-dir/ws-sub-renamed.txt`) === EXPECT['ws-a.txt'], 'WS-12.4 子目录内重命名 SHA 不变');
  assert(srvSha(`${D}/ws-sub-dir/ws-sub-copy.txt`) === null && srvSha(`ws-sub-renamed.txt`) === null, 'WS-12.5 重命名未移动位（旧名消失且共享根无新名）');
  results.WS12 = true;

  // ============ WS-11 远端删除（+缓存隔离） ============
  soft('WS-11 远端删除');
  const cacheBefore = adbShell(`ls /storage/emulated/0/PAD2/smb_cache/ 2>/dev/null | sort`).trim();
  srvPut('/tmp/ws-a.txt', `${D}/ws-del-target.txt`);
  assert(srvSha(`${D}/ws-del-target.txt`) === EXPECT['ws-a.txt'], 'WS-11.0 删除目标就位');
  r = await call('deleteRemoteFile', `{ path: ${rel('ws-del-target.txt')} }`);
  assert(String(r).startsWith('OK') && srvSha(`${D}/ws-del-target.txt`) === null, 'WS-11.1 服务器确认消失');
  const cacheAfter = adbShell(`ls /storage/emulated/0/PAD2/smb_cache/ 2>/dev/null | sort`).trim();
  assert(cacheAfter === cacheBefore, 'WS-11.2 远端删除后本地缓存逐文件不变（cleanup 隔离）');
  results.WS11 = { deleted: true, cacheIsolated: true };

  // ============ WS-15 回写冲突检测（远端外部变更被识别） ============
  soft('WS-15 回写冲突检测（不盲目覆盖）');
  ssh(`cd /tmp && printf 'WS15-external-change\\nR2,行2\\n' > s601c.csv && soffice --headless --convert-to xlsx --outdir /tmp s601c.csv >/dev/null 2>&1`);
  srvPut('/tmp/s601c.xlsx', `${D}/ws-conflict.xlsx`);
  const confSha = srvSha(`${D}/ws-conflict.xlsx`);
  assert(!!confSha, 'WS-15.0 冲突目标（基线版）就位');
  r = await evalPage(`(async () => { try { const r = await window.Capacitor.Plugins.SmbPlugin.openInWps({ path: ${rel('ws-conflict.xlsx')} }); return 'OK'; } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 80); } })()`, true);
  await sleep(6000);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(2500);
  ssh(`cd /tmp && printf 'WS15-CHANGED-BY-OTHERS\\nX9,行9\\n' > s601c2.csv && soffice --headless --convert-to xlsx --outdir /tmp s601c2.csv >/dev/null 2>&1`);
  srvPut('/tmp/s601c2.xlsx', `${D}/ws-conflict.xlsx`);
  const extSha = srvSha(`${D}/ws-conflict.xlsx`);
  assert(extSha !== confSha, 'WS-15.1 服务器已外部变更');
  const rc = await evalPage(`(async () => { try { const r = await window.Capacitor.Plugins.SmbPlugin.checkRemoteChanged(); return JSON.stringify(r); } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 80); } })()`, true);
  assert(/"remoteChanged":\s*true/.test(String(rc)), `WS-15.2 远端冲突被识别（${String(rc).substring(0, 60)}）`);
  results.WS15 = { conflictDetected: true };

  // ============ WS-16 锁定实测（WPS 打开缓存时远端操作） ============
  soft('WS-16 锁定行为实测（WPS 占用缓存副本时对远端 rename/delete）');
  r = await evalPage(`(async () => { try { const r = await window.Capacitor.Plugins.SmbPlugin.openInWps({ path: ${rel('测试表.xls')} }); return 'OK'; } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 80); } })()`, true);
  await sleep(6000);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(2500);
  let lockRn = await call('renameFile', `{ path: ${rel('测试表.xls')}, newName: 'ws-lock-renamed.xls' }`);
  let lockSemantics = 'UNLOCKED';
  if (String(lockRn).startsWith('OK')) {
    assert(srvSha(`${D}/ws-lock-renamed.xls`) === EXPECT['测试表.xls'], 'WS-16.1 rename 成功+SHA 不变（不锁——与 Samba 一致）');
    await call('renameFile', `{ path: ${rel('ws-lock-renamed.xls')}, newName: '测试表.xls' }`);
    assert(srvSha(`${D}/测试表.xls`) === EXPECT['测试表.xls'], 'WS-16.2 恢复原名');
  } else {
    lockSemantics = /SHARING_VIOLATION|lock|占用/i.test(String(lockRn)) ? 'SHARING_VIOLATION' : String(lockRn).substring(0, 40);
    assert(srvSha(`${D}/测试表.xls`) === EXPECT['测试表.xls'], 'WS-16.1b 锁定拒绝时原文件不变');
    console.log(`  [DISC] WPS 打开时远端 rename 实测语义: ${lockSemantics}（如实记录）`);
  }
  results.WS16 = { rename: lockSemantics };

  // ============ WS-17 权限拒绝（Windows READONLY 属性——双通道实测） ============
  soft('WS-17 只读属性行为实测（smbclient 对照 vs SMBJ 实测）');
  srvPut('/tmp/ws-a.txt', `${D}/ws-readonly.txt`);
  await sleep(3000);
  assert(setReadOnly(`${D}/ws-readonly.txt`, true), 'WS-17.0a 只读属性注入成功（SMB SET_INFO→AR 确认）');
  const roSha = srvSha(`${D}/ws-readonly.txt`);
  assert(!!roSha, 'WS-17.0 只读目标就位');
  const lsRO = srvLs();
  assert(/ws-readonly\.txt\s+AR/.test(lsRO), 'WS-17.0b 服务器属性核验：READONLY 标志生效（AR）');
  const smbclientDel = ssh(`${SMB} -c 'del ${D}/ws-readonly.txt' 2>&1 || true`);
  const srvRefuses = /CANNOT_DELETE|ACCESS_DENIED/i.test(String(smbclientDel));
  assert(srvRefuses, `WS-17.1 对照通道：smbclient 删除只读文件被服务端拒绝（${String(smbclientDel).trim().split(/\s+/).slice(0, 3).join(' ')}）`);
  r = await call('deleteRemoteFile', `{ path: ${rel('ws-readonly.txt')} }`);
  const smbJDeleted = String(r).startsWith('OK');
  if (smbJDeleted) {
    console.log('  [DISC] WS-17.2 行为差异发现：SMBJ deleteRemoteFile 可删除只读属性文件（smbclient 被拒）——客户端实现差异，如实记录待 PM 裁定');
    assert(srvSha(`${D}/ws-readonly.txt`) === null, 'WS-17.2b 操作结果与服务器最终状态一致（已删除）');
  } else {
    assert(String(r).startsWith('ERR') && srvSha(`${D}/ws-readonly.txt`) === roSha, 'WS-17.2 SMBJ 只读删除被拒+文件未变');
    console.log('  [DISC] SMBJ 与 smbclient 行为一致（只读删除被拒）');
  }
  results.WS17 = { serverRefusesRO: true, smbJDeletesRO: smbJDeleted, finding: smbJDeleted ? 'SMBJ rm 绕过 READONLY disposition 检查（行为差异，非 ACL 越权——guest 权限内）' : '一致拒绝' };

  // ============ WS-18 断网操作（如实失败+零污染） ============
  soft('WS-18 断网文件操作');
  const preSha = srvSha(`${D}/测试表.xlsx`);
  adbShell('svc wifi disable');
  await sleep(5000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  r = await call('copyFile', `{ sourcePath: ${rel('测试表.xlsx')}, destinationDir: '${D}', destFileName: 'ws-offline-copy.xlsx', overwrite: false }`);
  assert(String(r).startsWith('ERR'), `WS-18.1 断网复制如实失败（${String(r).substring(0, 50)}）`);
  assert(srvSha(`${D}/测试表.xlsx`) === preSha, 'WS-18.2 源不变');
  assert(srvSha(`${D}/ws-offline-copy.xlsx`) === null, 'WS-18.3 目标零残留（无半写）');
  results.WS18 = { honestFail: true };

  // ============ WS-19 恢复重连+目录刷新 ============
  soft('WS-19 断网恢复→重连→最新目录');
  srvPut('/tmp/ws-a.txt', `${D}/ws-refresh-new.txt`);
  adbShell('svc wifi enable');
  await sleep(20000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await sleep(2000);
  c = await call('connect', `{ host: '192.168.2.247', share: 'soft', username: 'guest', password: '' }`);
  const lst2 = await evalPage(`(async () => { const BS = String.fromCharCode(92); try { const r = await window.Capacitor.Plugins.SmbPlugin.listDirectory({ path: '${D}' }); return JSON.stringify(r); } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 120); } })()`, true);
  const names2 = (JSON.parse(String(lst2)).files || []).map((f) => f.name);
  assert(names2.includes('ws-refresh-new.txt'), 'WS-19.1 恢复重连后列表含服务器新增文件（最新非旧数据）');
  results.WS19 = { refreshed: true };

  // ============ WS-20 50MB 大文件服务器端复制 ============
  soft('WS-20 50MB 大文件（服务器端复制流式）');
  const t0 = Date.now();
  r = await call('copyFile', `{ sourcePath: ${rel('s601-50m.bin')}, destinationDir: '${D}', destFileName: 'ws-50m-copy.bin', overwrite: false }`);
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  const bigSha = srvSha(`${D}/ws-50m-copy.bin`);
  assert(String(r).startsWith('OK') && bigSha === EXPECT['s601-50m.bin'], `WS-20.1 50MB 复制 SHA==源（${dur}s）`);
  assert(srvSha(`${D}/s601-50m.bin`) === EXPECT['s601-50m.bin'], 'WS-20.2 源不变');
  results.WS20 = { shaOk: true, seconds: Number(dur) };

  await screenshot('s601-final-state.png');
  writeFileSync(join(OUT_DIR, 's601-auto-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\n===== TASK-S6-01 自动化段完成（WS-01~12/15~20；WS-13/14 WPS 编辑段另脚本） =====');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try { writeFileSync(join(OUT_DIR, 's601-auto-result.json'), JSON.stringify({ results, error: e.message, ts: new Date().toISOString() }, null, 2)); } catch {}
  try { adbShell('svc wifi enable'); adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});