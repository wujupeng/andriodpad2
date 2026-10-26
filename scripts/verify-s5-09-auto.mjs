/**
 * TASK-S5-09 集成回归（S5 收官，PM 授权仅验证——零代码变更）
 * APK：pad2-p003-s5-06c-trial.apk（e7a67ee5d5f537c59784cbf90453d5137d3c13b7cfe0c0d95cda0b20aaf1ee7b）
 * I-01 连接配置：同身份 upsert/不同身份独立/冷启动重载唯一
 * I-02 错误凭据+断网重试：异常不静默
 * I-03 断网→恢复→重连→自动刷新（恰 1 次+服务器最新）
 * I-04 复制/移动/重命名/删除：服务器 SHA 核验+权限拒绝不误操作
 * I-06 冲突检测+断网写回：不盲目覆盖/失败不伪报
 * I-07 熄屏唤醒+熄屏断网唤醒：数据无损/不冒充
 * I-08 缓存隔离：远端删除不误清缓存
 * （I-05 WPS 写回人工协作段另脚本）
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s5';
const GATE4 = '/mnt/share/gate4-test';
const TMPW = 'C:/Users/DELL/AppData/Local/Temp';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 90000 });
}
function ssh(cmd) {
  return execFileSync('ssh', ['-i', process.env.HOME + '/.ssh/pad2_cred_closure', 'debian@192.168.2.3', cmd], {
    encoding: 'utf8', timeout: 90000,
  });
}
function shaOf(path) {
  const out = ssh(`sha256sum '${path}' 2>/dev/null || echo MISSING`).trim();
  const m = out.match(/^([a-f0-9]{64})/);
  return m ? m[1] : null;
}
/** Preferences profiles 解析 */
function readProfiles() {
  const out = adbShell('run-as com.pad2.filemanager cat shared_prefs/CapacitorStorage.xml');
  const m = String(out).match(/pad2\.profiles\.v1">([^<]*)</);
  if (!m) return [];
  const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  try { return JSON.parse(decoded).profiles || []; } catch { return []; }
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
async function clickCard() {
  const c = await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('Gate3')); if (!rows.length) return 'NOT_FOUND'; rows[0].click(); return 'CLICKED'; })()`);
  if (c !== 'CLICKED') throw new Error('连接卡点击失败');
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
async function formSave(name, host, username, password) {
  await setField('连接名称', name);
  await setField('服务器地址', host);
  await setField('共享名', 'share');
  await setField('用户名', username);
  await setField('密码', password);
  await evalPage(`(() => { const cb = document.querySelector('input[type="checkbox"]'); if (cb && !cb.checked) cb.click(); return 'OK'; })()`);
  await sleep(400);
  await clickEl('main button', '保存并连接');
  await sleep(3000);
}
/** 回空表单（新建模式） */
async function resetForm() {
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1100);
  await clickEl('nav button', '添加连接');
  await sleep(1400);
}
async function pageState() {
  return JSON.parse(await evalPage(`
    (() => {
      const t = document.body.innerText;
      const nav = document.querySelector('nav[aria-label="路径导航"]');
      return JSON.stringify({
        visibility: document.visibilityState,
        rows: document.querySelectorAll('[data-file-row]').length,
        netInterrupted: t.includes('网络已中断'),
        reconnectBtn: !![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重连'),
        loadFail: t.includes('目录加载失败'),
        fail: (t.match(/连接失败：[^\\n]{0,30}/) || ['无'])[0],
        path: nav ? nav.textContent.substring(0, 30) : '无nav',
      });
    })()
  `));
}
function countListCalls() {
  const pid = adbShell('pidof com.pad2.filemanager').trim();
  return Number(adbShell(`logcat -d --pid=${pid} 2>/dev/null | grep -c "To native.*SmbPlugin.*listDirectory" || true`).trim()) || 0;
}
function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 连接（点卡→fallback），connected 断言 */
async function ensureConnected() {
  await clickEl('nav button', '添加连接');
  await sleep(1200);
  await clickCard();
  await sleep(16000);
  let c = await evalPage(`document.body.innerText.includes('已连接')`);
  if (!c) { await clickCard(); await sleep(16000); c = await evalPage(`document.body.innerText.includes('已连接')`); }
  if (!c) { await resetForm(); await formSave('Gate3编辑后', '192.168.2.3', 'pad2gate3', process.env.SMB_PW || 'Gate3-Test-2026'); await sleep(14000); c = await evalPage(`document.body.innerText.includes('已连接')`); }
  assert(c, '连接成功');
}
/** 进 browse gate4-test */
async function enterGate4() {
  await evalPage(`(() => { const bs = [...document.querySelectorAll('nav button')].filter((x) => x.textContent.includes('Gate3')); const b = bs[bs.length - 1]; if (b) b.click(); return 'OK'; })()`);
  await sleep(4000);
  let path = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
  if (!String(path).includes('gate4-test')) {
    await evalPage(`(() => { const rows = [...document.querySelectorAll('[data-file-row]')]; const t = rows.find((x) => (x.textContent || '').includes('gate4-test')); if (!t) return 'NF'; t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); return 'OK'; })()`);
    await sleep(3500);
  }
}

async function main() {
  const results = { apk: 'e7a67ee5d5f537c59784cbf90453d5137d3c13b7cfe0c0d95cda0b20aaf1ee7b' };
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');

  // ============ I-01 连接配置 ============
  console.log('\n===== I-01 连接配置（同身份不重复/不同身份不误合并/冷启动重载） =====');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();
  const p0 = readProfiles();
  const base0 = p0.length;
  console.log(`  [STAT] 起始 profiles=${base0} 张（身份唯一 ${new Set(p0.map((x) => `${x.host}|${x.share}|${x.username}`)).size === base0}）`);
  results.I01_base = base0;
  // 新身份 1（I9 用户）
  await resetForm();
  await formSave('I9配置甲', '192.168.2.99', 'i9user', 'pw-i9');
  await sleep(1500);
  // 同身份保存（不同名称）
  await resetForm();
  await formSave('I9配置甲改名', '192.168.2.99', 'i9user', 'pw-i9');
  await sleep(1500);
  // 不同身份（不同用户名）
  await resetForm();
  await formSave('I9配置乙', '192.168.2.99', 'i9user2', 'pw-i9b');
  await sleep(1500);
  let p1 = readProfiles();
  assert(p1.length === base0 + 2, `I-01.1 同身份 upsert 不新增+不同身份独立成卡（${base0}→${p1.length}）`);
  const i9a = p1.find((x) => x.username === 'i9user');
  assert(i9a && i9a.name === 'I9配置甲改名', 'I-01.2 同身份保存更新既有卡（名称更新）');
  assert(new Set(p1.map((x) => `${x.host}|${x.share}|${x.username}`)).size === p1.length, 'I-01.3 身份四元组全唯一（零误合并）');
  // 冷启动重载
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();
  await clickEl('nav button', '添加连接');
  await sleep(1800);
  const p2 = readProfiles();
  assert(p2.length === p1.length, `I-01.4 冷启动重载卡数一致（${p2.length}）`);
  assert(JSON.stringify(p2.map((x) => [x.id, x.name, x.host, x.username]).sort()) === JSON.stringify(p1.map((x) => [x.id, x.name, x.host, x.username]).sort()), 'I-01.5 冷启动配置逐字段一致');
  await screenshot('s509-i01-profiles.png');
  results.I01 = { before: base0, after: p2.length, upsert: true, unique: true };
  // 清理 I9 测试卡（UI 删除路径）
  for (let i = 0; i < 2; i += 1) {
    await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__')); const btn = rows[1]?.querySelector('button[aria-label^="更多操作"]'); if (!btn) return 'NF'; btn.click(); return 'OK'; })()`);
    await sleep(900);
    await evalPage(`(() => { const rows = [...document.querySelectorAll('[role="dialog"] div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('删除')); if (!rows.length) return 'NF'; rows[0].click(); return 'OK'; })()`);
    await sleep(1100);
    await clickEl('[role="alertdialog"] button', '删除');
    await sleep(2200);
  }
  const p3 = readProfiles();
  assert(p3.length === base0, `I-01.6 测试卡清理（回 ${p3.length}）`);

  // ============ I-02 错误凭据+断网重试 ============
  console.log('\n===== I-02 错误凭据+断网重试（异常不静默） =====');
  // 错误凭据（表单测试连接）
  await resetForm();
  await setField('连接名称', 'I2错误凭据');
  await setField('服务器地址', '192.168.2.3');
  await setField('共享名', 'share');
  await setField('用户名', 'pad2gate3');
  await setField('密码', 'WRONG-I2');
  await clickEl('main button', '测试连接');
  await sleep(18000);
  const i2fail = await evalPage(`document.body.innerText.includes('连接失败：用户名或密码不正确')`);
  assert(i2fail, 'I-02.1 错误凭据→明确 danger Banner（统一文案）');
  await screenshot('s509-i02-authfail.png');
  results.I02_authfail = true;
  // 断网点卡→失败→恢复→重试成功（先回已保存卡）
  adbShell('svc wifi disable');
  await sleep(4000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await clickCard();
  await sleep(25000);
  const i2net = await evalPage(`(() => { const t = document.body.innerText; return JSON.stringify({ fail: t.includes('连接失败：'), silent: !t.includes('连接失败：') && !t.includes('已连接') && !t.includes('正在连接') }); })()`);
  const i2v = JSON.parse(i2net);
  assert(i2v.fail && !i2v.silent, 'I-02.2 断网连接失败明确呈现（不静默）');
  adbShell('svc wifi enable');
  await sleep(18000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await clickCard();
  await sleep(17000);
  const i2ok = await evalPage(`document.body.innerText.includes('已连接')`);
  assert(i2ok, 'I-02.3 恢复后重试连接成功');
  results.I02_retry = true;

  // ============ I-03 断网→恢复→重连→自动刷新 ============
  console.log('\n===== I-03 断网→恢复→重连→目录刷新 =====');
  await enterGate4();
  const i3base = await pageState();
  adbShell('svc wifi disable');
  await sleep(4000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim().includes('Gate3')); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(23000);
  const i3off = await pageState();
  assert(i3off.netInterrupted || i3off.loadFail || i3off.rows === 0, 'I-03.1 断网期目录操作如实失败');
  ssh(`printf 'I3-刷新核验' > ${GATE4}/集成回归新增.txt`);
  adbShell('svc wifi enable');
  await sleep(18000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('logcat -c');
  const hasRec = await evalPage(`!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重连')`);
  if (hasRec) { await clickEl('button', '重连'); } else { await clickEl('nav button', '添加连接'); await sleep(1200); await clickCard(); }
  await sleep(19000);
  const i3on = await pageState();
  const hasNew = await evalPage(`document.body.innerText.includes('集成回归新增')`);
  assert(hasNew, 'I-03.2 重连后列表含服务器新增文件（最新目录非旧数据）');
  assert(!i3on.netInterrupted, 'I-03.3 网络中断状态清除');
  const i3calls = countListCalls();
  assert(i3calls === 1, `I-03.4 重连恰 1 次目录刷新请求（实际 ${i3calls}）`);
  await screenshot('s509-i03-refreshed.png');
  results.I03 = { newFileSeen: true, calls: i3calls };

  // ============ I-04 复制/移动/重命名/删除 ============
  console.log('\n===== I-04 文件四操作（服务器核验） =====');
  const call = (method, paramsExpr) => evalPage(`(async () => { const BS = String.fromCharCode(92); try { const r = await window.Capacitor.Plugins.SmbPlugin.${method}(${paramsExpr}); return 'OK:' + JSON.stringify(r).substring(0, 90); } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 80); } })()`, true);
  // 复制
  const srcCopySha = shaOf(`${GATE4}/复制源.txt`);
  let r = await call('copyFile', `{ sourcePath: 'gate4-test' + BS + '复制源.txt', destinationDir: 'gate4-test' + BS + '归档子目录', destFileName: '复制产物.txt', overwrite: false }`);
  const copySha = shaOf(`${GATE4}/归档子目录/复制产物.txt`);
  assert(String(r).startsWith('OK') && copySha === srcCopySha, `I-04.1 复制（SHA 一致）`);
  assert(shaOf(`${GATE4}/复制源.txt`) === srcCopySha, 'I-04.1b 源不变');
  // 移动
  const srcMoveSha = shaOf(`${GATE4}/移动源.txt`);
  r = await call('moveFile', `{ sourcePath: 'gate4-test' + BS + '移动源.txt', destinationDir: 'gate4-test' + BS + '归档子目录', destFileName: '移动产物.txt', overwrite: false }`);
  assert(String(r).startsWith('OK') && shaOf(`${GATE4}/归档子目录/移动产物.txt`) === srcMoveSha, 'I-04.2 移动（目标 SHA 一致）');
  assert(shaOf(`${GATE4}/移动源.txt`) === null, 'I-04.2b 源已删除（校验通过后才删源）');
  // 重命名
  const srcRnSha = shaOf(`${GATE4}/重命名源.txt`);
  r = await call('renameFile', `{ path: 'gate4-test' + BS + '重命名源.txt', newName: '重命名产物.txt' }`);
  assert(String(r).startsWith('OK') && shaOf(`${GATE4}/重命名产物.txt`) === srcRnSha, 'I-04.3 重命名（SHA 不变）');
  // 删除（I-08 联动：缓存隔离）
  const cacheBefore = adbShell(`ls /storage/emulated/0/PAD2/smb_cache/ 2>/dev/null | sort`).trim();
  const innocentSha = shaOf(`${GATE4}/无辜文件.txt`);
  r = await call('deleteRemoteFile', `{ path: 'gate4-test' + BS + '删除目标.txt' }`);
  assert(String(r).startsWith('OK') && shaOf(`${GATE4}/删除目标.txt`) === null, 'I-04.4 删除（服务器确认消失）');
  assert(shaOf(`${GATE4}/无辜文件.txt`) === innocentSha, 'I-04.4b 无辜文件不受影响');
  // 权限拒绝（错误场景不误操作）
  ssh(`chmod 000 '${GATE4}/权限拒绝源.txt'`);
  r = await call('deleteRemoteFile', `{ path: 'gate4-test' + BS + '权限拒绝源.txt' }`);
  ssh(`chmod 664 '${GATE4}/权限拒绝源.txt'`);
  assert(String(r).startsWith('ERR'), `I-04.5 权限拒绝如实失败（${String(r).substring(0, 50)}）`);
  assert(shaOf(`${GATE4}/权限拒绝源.txt`) !== null, 'I-04.5b 权限拒绝源文件未变');
  results.I04 = { copy: true, move: true, rename: true, delete: true, permDenied: true };
  // I-08 缓存隔离（删除后缓存逐文件不变）
  const cacheAfter = adbShell(`ls /storage/emulated/0/PAD2/smb_cache/ 2>/dev/null | sort`).trim();
  assert(cacheAfter === cacheBefore, `I-08.1 远端删除后本地缓存逐文件不变（${cacheBefore.split('\n').length} 项隔离）`);
  results.I08_cacheIsolated = true;

  // ============ I-06 冲突检测+断网写回 ============
  console.log('\n===== I-06 冲突检测+断网写回 =====');
  // 冲突（顺序关键）：①服务器=基线版 → ②openInWps 建会话基线 → ③服务器外部修改 → ④checkRemoteChanged 检测差异
  ssh(`cp /tmp/s509c.xlsx '${GATE4}/写回断网.xlsx'`);
  const openR = await evalPage(`(async () => { try { const r = await window.Capacitor.Plugins.SmbPlugin.openInWps({ path: 'gate4-test\\\\写回断网.xlsx' }); return 'OK'; } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 60); } })()`, true);
  assert(String(openR).startsWith('OK'), 'I-06.0 会话建立（openInWps·基线版）');
  await sleep(6000);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(2500);
  // ③ 服务器外部修改（模拟并发变更）
  ssh(`cd /tmp && printf 'I6标记,断网写回\\nR2,行2\\nX9,服务器外部改\\n' > s509c-ext.csv && soffice --headless --convert-to xlsx --outdir /tmp s509c-ext.csv >/dev/null 2>&1 && cp /tmp/s509c-ext.xlsx '${GATE4}/写回断网.xlsx'`);
  const extSha = shaOf(`${GATE4}/写回断网.xlsx`);
  assert(!!extSha, 'I-06.0b 服务器已外部变更');
  // ④ 检测
  const rc = await evalPage(`(async () => { try { const r = await window.Capacitor.Plugins.SmbPlugin.checkRemoteChanged(); return JSON.stringify(r); } catch (e) { return 'ERR'; } })()`, true);
  assert(JSON.parse(rc).remoteChanged === true, 'I-06.1 远端冲突被识别（remoteChanged=true——不盲目覆盖）');
  results.I06_conflict = true;
  // 断网写回：注入编辑版→断网→writeback 失败→源不变→恢复→重试→内容正确
  const editSha = ssh(`sha256sum /tmp/s509c-edit.xlsx | awk '{print $1}'`).trim();
  execFileSync('scp', ['-i', process.env.HOME + '/.ssh/pad2_cred_closure', 'debian@192.168.2.3:/tmp/s509c-edit.xlsx', `${TMPW}/s509c-edit.xlsx`]);
  execFileSync(ADB, ['-s', DEVICE, 'push', `${TMPW}/s509c-edit.xlsx`, '/storage/emulated/0/PAD2/smb_cache/写回断网.xlsx']);
  adbShell('am start -n com.pad2.filemanager/.MainActivity >/dev/null 2>&1; true');
  const extShaNow = shaOf(`${GATE4}/写回断网.xlsx`);
  adbShell('svc wifi disable');
  await sleep(4000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  const wbFail = await evalPage(`(async () => { try { const r = await window.Capacitor.Plugins.SmbPlugin.writeback(); return 'OK:' + JSON.stringify(r).substring(0, 90); } catch (e) { return 'FAILED:' + String(e.message || e).substring(0, 70); } })()`, true);
  assert(String(wbFail).startsWith('FAILED') || String(wbFail).includes('"writebackSuccess":false'), 'I-06.2 断网写回如实失败（不伪报成功）');
  assert(shaOf(`${GATE4}/写回断网.xlsx`) === extShaNow, 'I-06.3 断网失败服务器零污染');
  adbShell('svc wifi enable');
  await sleep(18000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  const wbRetry = await evalPage(`(async () => { try { const r = await window.Capacitor.Plugins.SmbPlugin.writeback(); return 'OK:' + JSON.stringify(r).substring(0, 130); } catch (e) { return 'FAILED:' + String(e.message || e).substring(0, 70); } })()`, true);
  assert(String(wbRetry).includes('writebackSuccess":true'), 'I-06.4 恢复后重试写回成功');
  const finalSha = shaOf(`${GATE4}/写回断网.xlsx`);
  assert(finalSha === editSha, 'I-06.5 服务器=注入编辑内容（重试幂等写入正确内容）');
  ssh(`rm -f /tmp/s509-check.csv && cp '${GATE4}/写回断网.xlsx' /tmp/s509-check.xlsx && cd /tmp && soffice --headless --convert-to csv --outdir /tmp s509-check.xlsx >/dev/null 2>&1`);
  const csvFinal = ssh(`cat /tmp/s509-check.csv`).trim();
  assert(csvFinal.includes('I6注入编辑'), 'I-06.6 服务器内容含注入编辑标记（内容级核验）');
  results.I06_writeback = { offlineFail: true, retrySuccess: true, contentVerified: true };
  ssh(`cp /tmp/s509c.xlsx '${GATE4}/写回断网.xlsx'`); // 还原供 I-05 无关

  // ============ I-07 熄屏唤醒+熄屏断网唤醒 ============
  console.log('\n===== I-07 熄屏→唤醒→恢复重连 =====');
  // 回 browse
  await ensureConnected();
  await enterGate4();
  const i7base = await pageState();
  adbShell('input keyevent 26');
  await sleep(60000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('input keyevent 82');
  await sleep(2500);
  const i7wake = await pageState();
  assert(i7base.rows > 0 && i7wake.rows === i7base.rows, `I-07.1 熄屏 60s 唤醒数据无损（${i7base.rows}/${i7wake.rows}）`);
  // 熄屏+断网→唤醒→不冒充→恢复重连
  adbShell('input keyevent 26');
  await sleep(2000);
  adbShell('svc wifi disable');
  await sleep(60000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('input keyevent 82');
  await sleep(2500);
  adbShell('logcat -c');
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim().includes('Gate3')); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(24000);
  const i7off = await pageState();
  assert(i7off.loadFail === true, 'I-07.2 熄屏断网唤醒后触发操作→loadError 如实呈现（不冒充最新）');
  adbShell('svc wifi enable');
  await sleep(18000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('input keyevent 82');
  const hasRec2 = await evalPage(`!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重连')`);
  if (hasRec2) { await clickEl('button', '重连'); } else { await clickEl('button', '重试'); }
  await sleep(19000);
  const i7final = await pageState();
  const i7new = await evalPage(`document.body.innerText.includes('集成回归新增')`);
  assert(i7new && !i7final.loadFail, 'I-07.3 恢复重连后最新目录呈现（含新增文件）');
  await screenshot('s509-i07-recovered.png');
  results.I07 = { wakeDataKept: true, offlineNoFake: true, recovered: true };

  // 清理
  ssh(`rm -f ${GATE4}/集成回归新增.txt`);

  writeFileSync(join(OUT_DIR, 's509-auto-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\n===== TASK-S5-09 自动化集成段全部通过（I-01~I-04/I-06~I-08） =====');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try { adbShell('svc wifi enable'); ssh(`chmod 664 '${GATE4}/权限拒绝源.txt'`); } catch {}
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});