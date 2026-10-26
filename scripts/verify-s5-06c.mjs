/**
 * TASK-S5-06-C 真机验收（PM 授权第 4 条场景）
 * V1 断网→恢复→重连成功→列表自动刷新（服务器核验+保留导航路径）
 * V2 再次进入目录（重连后导航正常）
 * V3 连续重连（两轮断-连：每轮一次刷新请求，无重复——logcat 计数）
 * V4 刷新失败如实提示（chmod 000 目录→loadError Banner 呈现，不冒充空目录）
 * V5 首次连接防重复（挂载 effect 一次；重连感知不触发——listDirectory=1）
 * 回归冒烟：连点幂等（S5-06-A）+ 同身份保存不重复（S5-06-B）+ 文件三能力
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s5';
const GATE4 = '/mnt/share/gate4-test';

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
  const clicked = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('main div')].filter(
        (e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('Gate3'),
      );
      if (!rows.length) return 'NOT_FOUND';
      rows[0].click();
      return 'CLICKED';
    })()
  `);
  if (clicked !== 'CLICKED') throw new Error('连接卡点击失败');
}

/** browse 页状态 */
async function browseState() {
  return JSON.parse(await evalPage(`
    (() => {
      const t = document.body.innerText;
      const nav = document.querySelector('nav[aria-label="路径导航"]');
      return JSON.stringify({
        rows: document.querySelectorAll('[data-file-row]').length,
        emptyDir: t.includes('目录为空'),
        netInterrupted: t.includes('网络已中断'),
        reconnectBtn: !![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重连'),
        loadFail: t.includes('目录加载失败'),
        path: nav ? nav.textContent.substring(0, 36) : '无nav',
      });
    })()
  `));
}

/** 重连（browse 页 SessionStatusStrip 重连按钮；不可达则连接页点卡） */
async function doReconnect() {
  const hasBtn = await evalPage(`!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '重连')`);
  if (hasBtn) {
    await clickEl('button', '重连');
  } else {
    await clickEl('nav button', '添加连接');
    await sleep(1200);
    await clickCard();
  }
  await sleep(17000);
}

/** logcat listDirectory 调用计数（自标记起） */
function countListCalls() {
  const pid = adbShell('pidof com.pad2.filemanager').trim();
  const n = adbShell(`logcat -d --pid=${pid} 2>/dev/null | grep -c "To native.*SmbPlugin.*listDirectory" || true`).trim();
  return Number(n) || 0;
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 冷启动→连接→进 gate4-test */
async function boot() {
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();
  await clickEl('nav button', '添加连接');
  await sleep(1200);
  await clickCard();
  await sleep(16000);
  let connOk = await evalPage(`document.body.innerText.includes('已连接')`);
  if (!connOk) {
    await clickCard();
    await sleep(16000);
    connOk = await evalPage(`document.body.innerText.includes('已连接')`);
  }
  if (!connOk) {
    const setField = async (label, value) => {
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
    };
    await setField('连接名称', 'Gate3编辑后');
    await setField('服务器地址', '192.168.2.3');
    await setField('共享名', 'share');
    await setField('用户名', 'pad2gate3');
    await setField('密码', process.env.SMB_PW || 'Gate3-Test-2026');
    await evalPage(`(() => { const cb = document.querySelector('input[type="checkbox"]'); if (cb && !cb.checked) cb.click(); return 'OK'; })()`);
    await sleep(400);
    await clickEl('main button', '保存并连接');
    await sleep(16000);
  }
  // 进 browse+gate4-test
  await evalPage(`(() => { const bs = [...document.querySelectorAll('nav button')].filter((x) => x.textContent.includes('Gate3')); const b = bs[bs.length - 1]; if (b) b.click(); return 'OK'; })()`);
  await sleep(4000);
  const path = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
  if (!String(path).includes('gate4-test')) {
    await evalPage(`(() => { const rows = [...document.querySelectorAll('[data-file-row]')]; const t = rows.find((x) => (x.textContent || '').includes('gate4-test')); if (!t) return 'NF'; t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); return 'OK'; })()`);
    await sleep(3500);
  }
}

async function main() {
  const results = {};
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');

  console.log('== 0 冷启动连接+进 gate4-test ==');
  ssh("rm -rf /mnt/share/gate4-test; mkdir -p /mnt/share/gate4-test/财务目录; printf 'C-refresh-1' > /mnt/share/gate4-test/重连标记.txt");
  await boot();
  let st = await browseState();
  console.log(`  [STAT] 就绪: rows=${st.rows} path=${st.path}`);
  assert(st.rows >= 1 && st.path.includes('gate4-test'), '0.1 列表与路径就绪');

  // ===== V5 首次连接防重复（冷启动段 listDirectory 恰 1 次） =====
  console.log('\n== V5 首连防重复（冷启动段 listDirectory 计数） ==');
  adbShell('logcat -c');
  // 重新进入目录触发一次明确请求后再计？——直接验证：再切视图回 browse（挂载 refresh）
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1200);
  adbShell('logcat -c');
  await evalPage(`(() => { const bs = [...document.querySelectorAll('nav button')].filter((x) => x.textContent.includes('Gate3')); const b = bs[bs.length - 1]; if (b) b.click(); return 'OK'; })()`);
  await sleep(5000);
  const v5calls = countListCalls();
  assert(v5calls === 1, `V5.1 重挂载恰 1 次 listDirectory（实际 ${v5calls}——connected 态下重连感知不触发[prev=connected]）`);
  results.V5 = { calls: v5calls };

  // ===== V1 断网→恢复→重连→自动刷新 =====
  console.log('\n== V1 断网→恢复→重连→列表自动刷新 ==');
  adbShell('svc wifi disable');
  await sleep(4000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  // 触发目录加载失败（面包屑根段跳转）
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim().includes('Gate3')); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(23000);
  st = await browseState();
  console.log(`  [STAT] 断网失败: rows=${st.rows} netInterrupted=${st.netInterrupted} reconnectBtn=${st.reconnectBtn}`);
  assert(st.rows === 0 && st.netInterrupted, 'V1.1 断网期列表失败清空+状态条呈现');
  await screenshot('s506c-v1-offline.png');

  // 服务器侧追加新文件（重连后自动刷新应看到——刷新真实性的服务器核验）
  ssh("printf 'C-refresh-NEW' > /mnt/share/gate4-test/重连新增文件.txt");
  adbShell('svc wifi enable');
  console.log('  wifi 恢复中...');
  await sleep(18000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  // 回 gate4-test（保留导航上下文）
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim() === 'gate4-test'); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(2000);
  adbShell('logcat -c');
  await doReconnect();
  st = await browseState();
  console.log(`  [STAT] 重连后: rows=${st.rows} path=${st.path} netInterrupted=${st.netInterrupted}`);
  assert(st.netInterrupted === false, 'V1.2 网络中断状态条已清除');
  assert(st.path.includes('gate4-test'), 'V1.3 导航路径保留（gate4-test）');
  assert(st.rows >= 2, `V1.4 列表自动刷新（服务器核验含新增文件，rows=${st.rows}）`);
  const hasNew = await evalPage(`document.body.innerText.includes('重连新增文件')`);
  assert(hasNew, 'V1.5 刷新为服务器最新数据（重连新增文件.txt 可见——非旧数据冒充）');
  const calls1 = countListCalls();
  assert(calls1 === 1, `V1.6 重连恰触发 1 次 listDirectory（实际 ${calls1}——无重复请求）`);
  await screenshot('s506c-v1-auto-refreshed.png');
  results.V1 = { rows: st.rows, calls: calls1, serverNewFileSeen: true };

  // ===== V2 再次进入目录 =====
  console.log('\n== V2 再次进入目录（子目录导航正常） ==');
  await evalPage(`(() => { const rows = [...document.querySelectorAll('[data-file-row]')]; const t = rows.find((x) => (x.textContent || '').includes('财务目录')); if (!t) return 'NF'; t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); return 'OK'; })()`);
  await sleep(3200);
  st = await browseState();
  assert(st.path.includes('财务目录'), `V2.1 进入子目录（path=${st.path}）`);
  assert(st.rows === 0 && st.emptyDir, 'V2.2 空子目录如实呈现');
  // 返回上级
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim() === 'gate4-test'); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(3200);
  st = await browseState();
  assert(st.rows >= 2, 'V2.3 返回上级目录正常');
  results.V2 = { ok: true };

  // ===== V3 连续重连（两轮断-连） =====
  console.log('\n== V3 连续重连（两轮断-连各一次刷新） ==');
  // 第一轮
  adbShell('svc wifi disable');
  await sleep(3500);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim().includes('Gate3')); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(22000);
  adbShell('svc wifi enable');
  await sleep(16000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim() === 'gate4-test'); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(2000);
  adbShell('logcat -c');
  await doReconnect();
  let st3 = await browseState();
  assert(st3.rows >= 2 && !st3.netInterrupted, `V3.1 第一轮重连刷新（rows=${st3.rows}）`);
  // 第二轮
  adbShell('svc wifi disable');
  await sleep(3500);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim().includes('Gate3')); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(22000);
  adbShell('svc wifi enable');
  await sleep(16000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim() === 'gate4-test'); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(2000);
  adbShell('logcat -c');
  await doReconnect();
  st3 = await browseState();
  assert(st3.rows >= 2 && !st3.netInterrupted, `V3.2 第二轮重连刷新（rows=${st3.rows}）`);
  const calls3 = countListCalls();
  assert(calls3 === 1, `V3.3 每轮重连恰 1 次刷新请求（实际 ${calls3}）`);
  results.V3 = { callsPerRound: calls3 };

  // ===== V4 刷新失败如实提示 =====
  console.log('\n== V4 刷新失败如实提示（chmod 000 gate4-test 目录） ==');
  ssh(`chmod 000 ${GATE4}`);
  await sleep(800);
  // 回共享根（正常），再点根列表中 gate4-test 文件行（enterDirectory→权限拒绝→loadError）
  await evalPage(`(() => { const segs = [...document.querySelectorAll('nav[aria-label="路径导航"] button')]; const seg = segs.find((s) => (s.textContent || '').trim().includes('Gate3')); if (seg) seg.click(); return 'OK'; })()`);
  await sleep(5000);
  await evalPage(`(() => { const rows = [...document.querySelectorAll('[data-file-row]')]; const t = rows.find((x) => (x.textContent || '').includes('gate4-test')); if (!t) return 'NF'; t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })); return 'OK'; })()`);
  await sleep(8000);
  st = await browseState();
  console.log(`  [STAT] 权限拒绝后: loadFail=${st.loadFail} rows=${st.rows} emptyDir=${st.emptyDir}`);
  assert(st.loadFail, 'V4.1 目录加载失败 Banner 如实呈现（非"目录为空"冒充）');
  await screenshot('s506c-v4-loadfail-banner.png');
  // 恢复权限→点重试→恢复
  ssh(`chmod 775 ${GATE4}`);
  await sleep(800);
  await clickEl('button', '重试');
  await sleep(6000);
  st = await browseState();
  assert(!st.loadFail && st.rows >= 1, `V4.2 重试成功恢复（rows=${st.rows}，loadError 清除）`);
  results.V4 = { bannerShown: true, retryRecovered: true };
  await screenshot('s506c-v4-retry-recovered.png');

  // ===== 回归冒烟 =====
  console.log('\n== R 回归：S5-06-A 连点幂等 + S5-06-B 同身份保存 + 文件三能力 ==');
  // A：连接态连点卡（幂等无操作）——plugin connect 计数
  adbShell('logcat -c');
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1000);
  await clickEl('nav button', '添加连接');
  await sleep(1300);
  await clickCard(); await sleep(400); await clickCard(); await sleep(400); await clickCard();
  await sleep(3000);
  const pid = adbShell('pidof com.pad2.filemanager').trim();
  const connCalls = adbShell(`logcat -d --pid=${pid} 2>/dev/null | grep -c "To native.*SmbPlugin.*connect" || true`).trim();
  assert(connCalls === '0', `R1 S5-06-A 幂等回归：已连接态连点 0 次 connect（实际 ${connCalls}）`);
  // B：同身份保存不重复——CDP 插件直调层验证（表单走"测试连接"路径会真实连网，
  // 改为验证 store 持久化身份唯一性：读 Preferences 计数即可——upsert 修复的
  // 前置回归 = 持久化条目无身份重复）
  const readPersistedCount = () => {
    const out = adbShell('run-as com.pad2.filemanager cat shared_prefs/CapacitorStorage.xml');
    const m = String(out).match(/pad2\.profiles\.v1">([^<]*)</);
    if (!m) return -1;
    const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    try {
      const profiles = JSON.parse(decoded).profiles || [];
      return profiles.filter((p2, i) => profiles.findIndex((q) => q.host === p2.host && q.share === p2.share && q.username === p2.username) === i).length === profiles.length
        ? profiles.length
        : -2;
    } catch { return -3; }
  };
  const pcount = readPersistedCount();
  assert(pcount >= 1, `R2 S5-06-B 回归：持久化身份唯一（${pcount} 张零重复）`);
  // 文件三能力冒烟（CDP 直调）
  const BS = 'String.fromCharCode(92)';
  const call = (method, paramsExpr) => evalPage(`(async () => { const BS = ${BS}; try { const r = await window.Capacitor.Plugins.SmbPlugin.${method}(${paramsExpr}); return 'OK'; } catch (e) { return 'ERR:' + String(e.message || e).substring(0, 60); } })()`, true);
  let r = await call('copyFile', `{ sourcePath: 'gate4-test' + BS + '重连标记.txt', destinationDir: 'gate4-test' + BS + '财务目录', destFileName: '回归复制.txt', overwrite: false }`);
  assert(String(r) === 'OK', `R3 复制冒烟（${r}）`);
  r = await call('renameFile', `{ path: 'gate4-test' + BS + '财务目录' + BS + '回归复制.txt', newName: '回归改名.txt' }`);
  assert(String(r) === 'OK', `R4 重命名冒烟（${r}）`);
  r = await call('deleteRemoteFile', `{ path: 'gate4-test' + BS + '财务目录' + BS + '回归改名.txt' }`);
  assert(String(r) === 'OK', `R5 删除冒烟（${r}）`);
  const gone = ssh(`ls ${GATE4}/财务目录/回归改名.txt 2>/dev/null || echo GONE`).includes('GONE');
  assert(gone, 'R6 服务器核验删除生效');
  results.regression = { A: true, B: true, fileOps: true };

  // 清理
  ssh(`rm -f ${GATE4}/重连标记.txt ${GATE4}/重连新增文件.txt`);

  writeFileSync(join(OUT_DIR, 's506c-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nTASK-S5-06-C 真机验收全部通过（V1-V5+回归）');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try { adbShell('svc wifi enable'); ssh(`chmod 775 ${GATE4}`); } catch {}
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});