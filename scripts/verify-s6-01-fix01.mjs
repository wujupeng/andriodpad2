/**
 * TASK-S6-01-FIX-01 修复验证脚本（S1~S10 场景矩阵，PM 授权验收载体）
 * APK：pad2-p003-s6-01-fix01.apk（016be5f6245b35d6474443ec0509b1a25a4d7ed609bbf4b380cbe31e337458e6）
 * 基线对照：e7a67ee5…f1ee7b（S6-01 WS-01 实测 F-01 缺陷形态：30s 零反馈+profiles 未落盘）
 *
 * 场景矩阵（design 2.5.1）：
 *   S1 空密码连接成功（≤1s 反馈+无空窗+终态+落盘+服务器端）+S9 明文清理+S10 宣称核验
 *   S1b/c 冷启动复测 ×2（C03）
 *   S4 防重入三连点（logcat connect=1）
 *   S2 错误凭据（Linux Samba 对照——247 guest 任意凭据放行无法真实触发 auth_failed）
 *   S3 不可达地址（进行中反馈持续+网络类终态+可重试）
 *   S5 失败重试（失败→进行中合法迁移+旧 Banner 替代）
 *   S6 连接卡冷启动空密码（无补输+直接连接）
 *   S7 upsert 命中（条目不增+归属正确）
 *   S8 三态可区分（empty_credential 直接连接 vs unset 补输）
 * 判据等级：客户端截图仅辅助；logcat+profiles XML+服务器端核验为通过唯一依据。
 * 幂等：开头清理历史测试卡；结尾清理本轮测试卡（预置原件零触碰——R24）。
 * 用法：node scripts/verify-s6-01-fix01.mjs [all|s1|s2|...|s8]（默认 all）
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s6';
const SSH_KEY = process.env.HOME + '/.ssh/pad2_cred_closure';
const SMB247 = `timeout 90 smbclient //192.168.2.247/soft -U guest%`;
const SMB3 = `timeout 90 smbclient //192.168.2.3/share -U pad2gate3%Gate3-Test-2026`;
const D_SL = 'AutoFileBackup/PAD2-S6-01';
const BS = 'String.fromCharCode(92)';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 120000 });
}
function ssh(cmd) {
  return execFileSync('ssh', ['-i', SSH_KEY, 'debian@192.168.2.3', cmd], { encoding: 'utf8', timeout: 180000 });
}
/** profiles XML 原文（run-as——仅 debug 构建可用） */
function profilesXml() {
  return String(adbShell('run-as com.pad2.filemanager cat shared_prefs/CapacitorStorage.xml 2>/dev/null'));
}
/**
 * profiles 解析（TASK-S6-05-FIX 适配：release 构建 run-as 不可用 not debuggable——
 * fallback CDP Preferences API 通道，App 自身 API 权威等价）
 */
async function readProfiles() {
  try {
    const xml = profilesXml();
    const m = xml.match(/pad2\.profiles\.v1">([^<]*)</);
    if (m) {
      const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      try { return JSON.parse(decoded).profiles || []; } catch { return []; }
    }
  } catch { /* run-as 不可用走 CDP */ }
  if (ws && ws.readyState === 1) {
    const v = await evalPage(`(async () => { try { const r = await window.Capacitor.Plugins.Preferences.get({ key: 'pad2.profiles.v1' }); return r.value || ''; } catch (e) { return ''; } })()`, true);
    if (v) { try { return JSON.parse(String(v)).profiles || []; } catch { return []; } }
  }
  return [];
}
/** bridge connect 调用计数器（TASK-S6-05-FIX 适配：桥日志已关闭——logcat 计数失效；
 * 注入点=window.Capacitor.nativePromise（registerPlugin proxy 的必经底层通道——
 * patch window.Capacitor.Plugins.* 无效因 adapter 持有独立 proxy 实例） */
async function injectConnectCounter() {
  await evalPage(`(() => { if (!window.__pad2ConnectCalls) { window.__pad2ConnectCalls = 0; const cap = window.Capacitor; const orig = cap.nativePromise.bind(cap); cap.nativePromise = function(pluginId, method, options) { if (pluginId === 'SmbPlugin' && method === 'connect') window.__pad2ConnectCalls++; return orig(pluginId, method, options); }; } return 'INJECTED'; })()`);
}
async function readConnectCounter() {
  const n = await evalPage(`window.__pad2ConnectCalls`);
  return Number(n) || 0;
}
function countConnectCalls() {
  const pid = adbShell('pidof com.pad2.filemanager').trim();
  return Number(adbShell(`logcat -d --pid=${pid} 2>/dev/null | grep -c "To native.*SmbPlugin.*connect" || true`).trim()) || 0;
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
  // 冷启动后 WebView/CDP 未就绪属预期（DevTools socket 实例化延迟）——轮询重试
  let m = null;
  for (let i = 0; i < 15; i++) {
    const unix = adbShell("cat /proc/net/unix 2>/dev/null | grep webview_devtools_remote | head -1");
    m = String(unix).match(/webview_devtools_remote_(\d+)/);
    if (m) break;
    await sleep(2000);
  }
  if (!m) throw new Error('DevTools socket 未出现（WebView 未实例化）');
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
/** 回新建空表单（S5-09 模式） */
async function resetForm() {
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1100);
  await clickEl('nav button', '添加连接');
  await sleep(1400);
}
/** 点按名称定位的连接卡 */
async function clickCardByName(nameKey) {
  const c = await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes(${JSON.stringify(nameKey)})); if (!rows.length) return 'NOT_FOUND'; rows[0].click(); return 'CLICKED'; })()`);
  if (c !== 'CLICKED') throw new Error(`连接卡点击失败 "${nameKey}"`);
}
/** UI 删除指定连接卡（S5-09 模式，按名称定位） */
async function deleteCardByName(nameKey) {
  const menu = await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes(${JSON.stringify(nameKey)})); const btn = rows[0]?.querySelector('button[aria-label^="更多操作"]'); if (!btn) return 'NF'; btn.click(); return 'OK'; })()`);
  if (menu !== 'OK') throw new Error(`菜单打开失败 "${nameKey}"`);
  await sleep(900);
  await evalPage(`(() => { const rows = [...document.querySelectorAll('[role="dialog"] div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('删除')); if (!rows.length) return 'NF'; rows[0].click(); return 'OK'; })()`);
  await sleep(1100);
  await clickEl('[role="alertdialog"] button', '删除');
  await sleep(2200);
}
function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = { apk: '016be5f6245b35d6474443ec0509b1a25a4d7ed609bbf4b380cbe31e337458e6', baseline: 'e7a67ee5d5f537c59784cbf90453d5137d3c13b7cfe0c0d95cda0b20aaf1ee7b' };
const soft = (label) => console.log(`\n===== ${label} =====`);

/** 冷启动到 CDP 就绪 */
async function coldBoot() {
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();
}

/** 提交后反馈采样：返回 { firstMs, final }——任何可见状态（loading/正在连接/终态）都计为反馈（C01） */
async function sampleConnectFlow(maxWaitMs = 30000) {
  const t0 = Date.now();
  let firstMs = null;
  let final = null;
  let finalText = '';
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const st = await evalPage(`(() => { const t = document.body.innerText; const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent||'').includes('保存并连接')); return JSON.stringify({ d: btn ? btn.disabled : null, connecting: t.includes('正在连接'), connected: t.includes('已连接'), fail: (t.match(/连接失败：[^\\n]{0,40}/) || [null])[0] }); })()`);
    const v = JSON.parse(st);
    if (firstMs === null && (v.d || v.connecting || v.connected || v.fail)) firstMs = Date.now() - t0;
    if (v.connected) { final = 'connected'; finalText = '已连接'; break; }
    if (v.fail) { final = 'fail'; finalText = v.fail; break; }
    if (firstMs !== null && !v.d && !v.connecting) throw new Error(`反馈空窗：${JSON.stringify(v)}`);
    await sleep(150);
  }
  return { firstMs, final, finalText };
}

/** 连接卡点击后采样（等待终态） */
async function sampleCardFlow(nameKey, maxWaitMs = 30000) {
  const t0 = Date.now();
  let sawConnecting = false;
  let sawReenter = false;
  let final = null;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const st = await evalPage(`(() => { const t = document.body.innerText; return JSON.stringify({ connecting: t.includes('正在连接'), connected: t.includes('已连接'), fail: t.includes('连接失败：'), reenter: t.includes('请输入密码完成连接') }); })()`);
    const v = JSON.parse(st);
    if (v.connecting) sawConnecting = true;
    if (v.reenter) sawReenter = true;
    if (v.connected) { final = 'connected'; break; }
    if (v.fail) { final = 'fail'; break; }
    await sleep(500);
  }
  return { ms: Date.now() - t0, sawConnecting, sawReenter, final };
}

/** 点击"保存并连接"（带触发确认重试——冷启动后 React/桥就绪竞态偶发首次点击不生效） */
async function clickSaveAndConnect(maxRetry = 3) {
  for (let i = 0; i < maxRetry; i++) {
    await evalPage(`(() => { const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent||'').includes('保存并连接')); if (btn) btn.click(); return 'OK'; })()`);
    await sleep(400);
    const st = await evalPage(`(() => { const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent||'').includes('保存并连接')); const t = document.body.innerText; return JSON.stringify({ d: btn ? btn.disabled : null, connecting: t.includes('正在连接'), connected: t.includes('已连接'), fail: t.includes('连接失败：') }); })()`);
    const v = JSON.parse(st);
    if (v.d || v.connecting || v.connected || v.fail) return i + 1;
  }
  return 0;
}

// ============ S1 空密码连接成功（核心，含 S9/S10） ============
async function s1() {
  soft('S1 空密码连接成功（247 guest/空密码，表单路径）');
  await coldBoot();
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  await setField('连接名称', 'S6-01-WinSrv');
  await setField('服务器地址', '192.168.2.247');
  await setField('共享名', 'soft');
  await setField('用户名', 'guest');
  await setField('密码', '');
  adbShell('logcat -c');
  const clickOk = await clickSaveAndConnect();
  if (clickOk === 0) throw new Error('保存并连接点击未触发（3 次重试）');
  console.log(`  [DBG] 保存并连接触发（第 ${clickOk} 次点击）`);
  const dbg0 = await evalPage(`(() => { const t = document.body.innerText; const errs = [...document.querySelectorAll('main p,main span,main div')].map(e => e.textContent||'').filter(s => /请填写|不正确/.test(s)); return JSON.stringify({ errs: errs.slice(0, 5), hasForm: !!document.querySelector('label'), url: location.hash }); })()`);
  console.log(`  [DBG] 点击后即时状态=${String(dbg0).substring(0, 200)}`);
  const flow = await sampleConnectFlow(30000);
  assert(flow.firstMs !== null && flow.firstMs <= 1000, `S1① 提交后 ≤1s 出现反馈（${flow.firstMs}ms——F-01 基线为 30s 零反馈）`);
  assert(flow.final === 'connected', `S1③ 终态"已连接"（采样无空窗持续，${flow.final}）`);
  await screenshot('s601fix01-s1-connected.png');
  // ④ profiles 落盘（TASK-S6-05-FIX 适配：release 构建 run-as 不可用——CDP Preferences API 权威通道）
  const raw = await evalPage(`(async () => { try { const r = await window.Capacitor.Plugins.Preferences.get({ key: 'pad2.profiles.v1' }); return r.value || ''; } catch (e) { return ''; } })()`, true);
  const entry247 = (await readProfiles()).find((p) => p.host === '192.168.2.247');
  assert(/192\.168\.2\.247/.test(String(raw)), 'S1④a profiles 落盘含 247 条目（F-01 基线未落盘）');
  assert(/"passwordEmpty"\s*:\s*true/.test(String(raw)), 'S1④b passwordEmpty:true 落盘（空密码凭据语义标记）');
  assert(!!entry247 && !entry247.passwordEncrypted, 'S1④c 247 条目无密文（空密码不产密文，R09）');
  assert(!/Gate3-Test|WRONG-S2|pad2gate3%/.test(String(raw)), 'S1④d 落盘无明文密码（C05）');
  // ⑤ 服务器端核验：App 会话读目录 + ssh 独立 ls
  const lst = await evalPage(`(async () => { const BS = String.fromCharCode(92); try { const r = await window.Capacitor.Plugins.SmbPlugin.listDirectory({ path: 'AutoFileBackup' + BS + 'PAD2-S6-01' }); return 'OK:' + (r.files || []).length + ' entries'; } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 60); } })()`, true);
  assert(String(lst).startsWith('OK'), `S1⑤ App 会话可读服务器目录（${lst}——连接事实）`);
  const lsOut = String(ssh(`${SMB247} -c 'ls ${D_SL}' 2>&1 || true`));
  assert(!/NT_STATUS_.*ERR/i.test(lsOut), 'S1⑤b 服务器端独立 ls 复核通过（smbclient guest）');
  results.S1 = { firstFeedbackMs: flow.firstMs, final: flow.final, persisted: true };
  // S9 明文清理
  const pw = await evalPage(`(() => { const labels = [...document.querySelectorAll('label')]; const l = labels.find(x => (x.textContent||'').includes('密码')); const input = l && l.htmlFor ? document.getElementById(l.htmlFor) : null; return input ? input.value : 'GONE'; })()`);
  assert(pw === '' || pw === 'GONE', `S9 连接成功后密码明文已清空（${pw === 'GONE' ? '表单已重置' : '空串'}，R12）`);
  results.S9 = true;
  // S10 宣称核验
  const bodyText = String(await evalPage(`document.body.innerText`));
  assert(!/密码已记住|已加密保存/.test(bodyText), 'S10 界面无密码保存结果性宣称（R09/C06——无密文事实不宣称）');
  results.S10 = true;
}

/** 冷启动复测（连接卡路径直达已连接） */
async function s1Cold(tag) {
  soft(`S1${tag} 冷启动复测（C03）`);
  await coldBoot();
  await clickEl('nav button', '添加连接');
  await sleep(1600);
  await clickCardByName('S6-01-WinSrv');
  const flow = await sampleCardFlow('S6-01-WinSrv', 30000);
  assert(!flow.sawReenter, `S1${tag}.1 无补输拦截（空密码凭据直接连接）`);
  assert(flow.sawConnecting || flow.final === 'connected', `S1${tag}.2 反馈可见（connecting=${flow.sawConnecting}）`);
  assert(flow.final === 'connected', `S1${tag}.3 冷启动后连接成功（${flow.final}，${flow.ms}ms）`);
  results[`S1${tag}`] = { reenter: false, final: flow.final };
}

// ============ S4 防重入三连点 ============
async function s4() {
  soft('S4 连接在途三连点防重入（R13/R14）');
  // 冷启动断开态发起（防 S1 残留已连接态触发 store 幂等 return——那不是防重入在途场景）
  await coldBoot();
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  await setField('连接名称', 'S6-01-WinSrv');
  await setField('服务器地址', '192.168.2.247');
  await setField('共享名', 'soft');
  await setField('用户名', 'guest');
  await setField('密码', '');
  adbShell('logcat -c');
  await injectConnectCounter();
  await clickEl('main button', '保存并连接');
  for (let i = 0; i < 3; i++) {
    await sleep(300);
    await evalPage(`(() => { const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent||'').includes('保存并连接')); if (btn) btn.click(); return 'OK'; })()`);
  }
  const flow = await sampleConnectFlow(30000);
  assert(flow.final === 'connected', `S4.1 三连点后终态唯一（已连接，${flow.final}）`);
  const calls = await readConnectCounter();
  assert(calls === 1, `S4.2 bridge connect 调用恰 1 次（实际 ${calls}——双层防重入生效；TASK-S6-05-FIX 适配：桥日志关闭后改页面层注入计数）`);
  results.S4 = { connectCalls: calls, final: flow.final };
}

// ============ S2 错误凭据（Linux Samba 对照） ============
async function s2() {
  soft('S2 错误凭据（Linux Samba pad2gate3/错误密码，R06）');
  // 冷启动隔离（防前场景已连接卡的"已连接"徽章污染终态检测）
  await coldBoot();
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  await setField('连接名称', 'S2错误凭据');
  await setField('服务器地址', '192.168.2.3');
  await setField('共享名', 'share');
  await setField('用户名', 'pad2gate3');
  await setField('密码', 'WRONG-S2-FIX01');
  const clickS2 = await clickSaveAndConnect();
  if (clickS2 === 0) throw new Error('S2 保存并连接点击未触发（3 次重试）');
  console.log(`  [DBG] S2 保存并连接触发（第 ${clickS2} 次点击）`);
  const dbgS2 = await evalPage(`(() => { const t = document.body.innerText; const errs = [...document.querySelectorAll('main p,main span,main div')].map(e => e.textContent||'').filter(s => /请填写|不正确/.test(s)); const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent||'').includes('保存并连接')); return JSON.stringify({ errs: errs.slice(0, 5), btnDisabled: btn ? btn.disabled : null, pw: (() => { const labels = [...document.querySelectorAll('label')]; const l = labels.find(x => (x.textContent||'').includes('密码')); const input = l && l.htmlFor ? document.getElementById(l.htmlFor) : null; return input ? input.value.length : -1; })() }); })()`);
  console.log(`  [DBG] S2 点击后即时状态=${String(dbgS2).substring(0, 250)}`);
  const flow = await sampleConnectFlow(35000);
  assert(flow.final === 'fail', `S2.1 终态失败呈现（${flow.finalText}）`);
  assert(/用户名或密码不正确/.test(flow.finalText), 'S2.2 auth_failed 统一反探测文案（danger Banner）');
  const cnt = await evalPage(`(() => { const t = document.body.innerText; return (t.match(/用户名或密码不正确/g) || []).length; })()`);
  assert(Number(cnt) >= 2, `S2.3 密码项内联错误定位（文案出现 ${cnt} 次=Banner+内联）`);
  await screenshot('s601fix01-s2-authfail.png');
  await sleep(10000);
  const persist = await evalPage(`document.body.innerText.includes('连接失败：用户名或密码不正确')`);
  assert(persist, 'S2.4 失败持久呈现（10s 后仍在，R06）');
  results.S2 = { banner: flow.finalText, inline: true, persistent: true };
}

// ============ S3 不可达地址 ============
async function s3() {
  soft('S3 不可达地址（192.168.2.250，进行中反馈+网络类终态）');
  // 冷启动隔离（防 S2 失败态/已连接卡残留污染）
  await coldBoot();
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  await setField('连接名称', 'S3不可达');
  await setField('服务器地址', '192.168.2.250');
  await setField('共享名', 'share');
  await setField('用户名', 'guest');
  await setField('密码', '');
  const clickS3 = await clickSaveAndConnect();
  if (clickS3 === 0) throw new Error('S3 保存并连接点击未触发（3 次重试）');
  console.log(`  [DBG] S3 保存并连接触发（第 ${clickS3} 次点击）`);
  const flow = await sampleConnectFlow(35000);
  assert(flow.firstMs !== null && flow.firstMs <= 1000, `S3.1 提交后 ≤1s 反馈（${flow.firstMs}ms）`);
  assert(flow.final === 'fail', `S3.2 终态失败（${flow.finalText}）`);
  assert(!/用户名或密码/.test(flow.finalText || ''), 'S3.3 网络类文案（非凭据类）');
  await screenshot('s601fix01-s3-unreachable.png');
  const retryable = await evalPage(`(() => { const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent||'').includes('保存并连接')); return btn ? !btn.disabled : false; })()`);
  assert(retryable, 'S3.4 按钮恢复可重试（R07）');
  results.S3 = { firstMs: flow.firstMs, finalText: flow.finalText, retryable };
  return flow;
}

// ============ S5 失败重试 ============
async function s5() {
  soft('S5 失败后重试（失败→进行中合法迁移+旧 Banner 替代，R07）');
  adbShell('logcat -c');
  const clickS5 = await clickSaveAndConnect();
  if (clickS5 === 0) throw new Error('S5 重试点击未触发（3 次重试）');
  const mid = await evalPage(`(() => { const t = document.body.innerText; const btn = [...document.querySelectorAll('main button')].find(b => (b.textContent||'').includes('保存并连接')); return JSON.stringify({ connecting: t.includes('正在连接'), oldFail: t.includes('连接失败：'), d: btn ? btn.disabled : null }); })()`);
  const mv = JSON.parse(mid);
  assert(mv.connecting || mv.d, `S5.1 重试发起即进行中反馈（connecting=${mv.connecting}, disabled=${mv.d}——失败→进行中合法迁移）`);
  assert(!mv.oldFail, 'S5.2 旧失败 Banner 已被清除（发起时 setBanner(null)）');
  const flow = await sampleConnectFlow(35000);
  assert(flow.final === 'fail', `S5.3 到达新终态（${flow.finalText}）`);
  results.S5 = { retriggered: true, newFinal: flow.finalText };
}

// ============ S6 连接卡冷启动空密码 ============
async function s6() {
  soft('S6 连接卡冷启动空密码（R10——无补输直接连接）');
  await coldBoot();
  await clickEl('nav button', '添加连接');
  await sleep(1600);
  await clickCardByName('S6-01-WinSrv');
  const flow = await sampleCardFlow('S6-01-WinSrv', 30000);
  assert(!flow.sawReenter, 'S6.1 无"请输入密码完成连接"补输拦截（empty_credential 语义生效）');
  assert(flow.sawConnecting, 'S6.2 即时 info"正在连接..."反馈（S5-06-A 防护链）');
  assert(flow.final === 'connected', `S6.3 终态已连接（${flow.final}，${flow.ms}ms）`);
  const badge = await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('S6-01-WinSrv')); return rows.length ? (rows[0].textContent || '').includes('已连接') : false; })()`);
  assert(badge, 'S6.4 该配置连接卡呈"已连接"（activeProfileId 归属一致）');
  await screenshot('s601fix01-s6-card-coldboot.png');
  results.S6 = { reenter: false, final: flow.final, badge: true };
}

// ============ S7 upsert 命中 ============
async function s7() {
  soft('S7 同身份再次保存（upsert 命中——条目不增+归属正确，R11）');
  const before = (await readProfiles()).filter((p) => p.host === '192.168.2.247').length;
  await resetForm();
  await setField('连接名称', 'S6-01-WinSrv-B');
  await setField('服务器地址', '192.168.2.247');
  await setField('共享名', 'soft');
  await setField('用户名', 'guest');
  await setField('密码', '');
  const clickS7 = await clickSaveAndConnect();
  if (clickS7 === 0) throw new Error('S7 保存并连接点击未触发（3 次重试）');
  const flow = await sampleConnectFlow(30000);
  assert(flow.final === 'connected', `S7.1 同身份保存并连接成功（${flow.final}）`);
  const after = (await readProfiles()).filter((p) => p.host === '192.168.2.247');
  assert(after.length === before, `S7.2 条目数不增（upsert 命中：${before}→${after.length}）`);
  assert(after.every((p) => !p.passwordEncrypted && p.passwordEmpty === true), 'S7.3 条目三态标记保持（passwordEmpty=true 无密文）');
  const badge = await evalPage(`(() => { const rows = [...document.querySelectorAll('main div')].filter((e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('S6-01-WinSrv')); return rows.length ? (rows[0].textContent || '').includes('已连接') : false; })()`);
  assert(badge, 'S7.4 该条目连接卡呈"已连接"（profileId 归属真实条目——FIX-C3 生效）');
  results.S7 = { countBefore: before, countAfter: after.length, badge: true };
}

// ============ S8 三态可区分 ============
async function s8() {
  soft('S8 三态可区分（empty_credential 直连 vs unset 补输，F01）');
  // 准备 unset 配置（Linux Samba 非空密码不勾记住）
  await resetForm();
  await setField('连接名称', 'S8-Samba-Unset');
  await setField('服务器地址', '192.168.2.3');
  await setField('共享名', 'share');
  await setField('用户名', 'pad2gate3');
  await setField('密码', process.env.SMB_PW || 'Gate3-Test-2026');
  const clickS8 = await clickSaveAndConnect();
  if (clickS8 === 0) throw new Error('S8 保存并连接点击未触发（3 次重试）');
  const flow = await sampleConnectFlow(30000);
  assert(flow.final === 'connected', `S8.0 unset 配置创建并连接成功（${flow.final}）`);
  const unsetEntry = (await readProfiles()).find((p) => p.host === '192.168.2.3');
  assert(unsetEntry && !unsetEntry.passwordEncrypted && unsetEntry.passwordEmpty === undefined, 'S8.0b 落盘为 unset 态（无密文无 empty 标记）');
  // 冷启动后两卡对照
  await coldBoot();
  await clickEl('nav button', '添加连接');
  await sleep(1600);
  await clickCardByName('S8-Samba-Unset');
  const unsetFlow = await sampleCardFlow('S8-Samba-Unset', 30000);
  assert(unsetFlow.sawReenter, 'S8.1 unset 卡→"请输入密码完成连接"补输引导（转编辑表单）');
  assert(!unsetFlow.sawConnecting, 'S8.2 unset 卡不发起连接（补输先行）');
  await screenshot('s601fix01-s8-unset-reenter.png');
  // 回到列表再点 empty_credential 卡（对照）
  await clickEl('nav button', '添加连接');
  await sleep(1600);
  await clickCardByName('S6-01-WinSrv');
  const emptyFlow = await sampleCardFlow('S6-01-WinSrv', 30000);
  assert(!emptyFlow.sawReenter, 'S8.3 empty_credential 卡无补输（对照）');
  assert(emptyFlow.final === 'connected', `S8.4 empty_credential 卡直接连接成功（${emptyFlow.final}）`);
  await screenshot('s601fix01-s8-empty-direct.png');
  results.S8 = { unsetReenter: true, emptyDirect: emptyFlow.final === 'connected' };
}

// ============ 清理（幂等） ============
async function cleanup() {
  soft('CLEANUP 测试卡清理（幂等重置）');
  const names = ['S6-01-WinSrv', 'S6-01-Diag', 'S2错误凭据', 'S3不可达', 'S8-Samba-Unset'];
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1000);
  await clickEl('nav button', '添加连接');
  await sleep(1400);
  for (const n of names) {
    try {
      const still = (await readProfiles()).some((p) => p.name === n || (n === 'S6-01-WinSrv' && p.host === '192.168.2.247'));
      if (still) {
        await deleteCardByName(n);
        console.log(`  [CLEAN] 已删除 ${n}`);
      }
    } catch (e) {
      console.log(`  [CLEAN] ${n} 清理跳过：${e.message.substring(0, 50)}`);
    }
  }
  const remain = (await readProfiles()).filter((p) => p.host === '192.168.2.247' || /S2错误|S3不可达|S8-Samba|S6-01-Diag/.test(p.name));
  console.log(`  [CLEAN] 残留测试卡：${remain.length} 张`);
  results.cleanup = { remaining: remain.length };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  const which = process.argv[2] || 'all';
  try {
    if (which === 'all' || which === 's1') { await coldBoot(); await cleanup(); await s1(); await s1Cold('b'); await s1Cold('c'); }
    if (which === 'all' || which === 's4') await s4();
    if (which === 'all' || which === 's2') await s2();
    if (which === 'all' || which === 's3') await s3();
    if (which === 'all' || which === 's5') await s5();
    if (which === 'all' || which === 's6') await s6();
    if (which === 'all' || which === 's7') await s7();
    if (which === 'all' || which === 's8') await s8();
    if (which === 'all') await cleanup();
    results.allPass = true;
    writeFileSync(join(OUT_DIR, 's601-fix01-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
    console.log('\n===== TASK-S6-01-FIX-01 S1~S10 验证全部通过 =====');
  } catch (e) {
    results.allPass = false;
    results.error = e.message;
    writeFileSync(join(OUT_DIR, 's601-fix01-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
    console.error(`✗ 验证失败: ${e.message}`);
    process.exitCode = 1;
  } finally {
    try { adbShell('svc power stayon false'); } catch {}
    try { ws && ws.close(); } catch {}
  }
}

main();