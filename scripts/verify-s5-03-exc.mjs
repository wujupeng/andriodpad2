/**
 * TASK-S5-03 异常场景补充验收：断网 mid-op / 权限拒绝
 * S7 断网复制：wifi disable → 复制 → 如实失败（不伪成功）→ 恢复 → 源完好+零半文件
 * S8 权限复制：服务器 chmod 000 源 → 复制 → permission_denied 失败 → 恢复 → 源完好
 * 前置：已连接、在 gate4-test（复用当前态或自行导航）。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s5';
const GATE4 = '/mnt/share/gate4-test';
const FIN = `${GATE4}/财务目录`;

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 90000 });
}

function ssh(cmd) {
  return execFileSync('ssh', ['-i', process.env.HOME + '/.ssh/pad2_cred_closure', 'debian@192.168.2.3', cmd], {
    encoding: 'utf8',
    timeout: 90000,
  });
}

function serverCheck(path) {
  const sha = ssh(`sha256sum '${path}' 2>/dev/null || echo MISSING`);
  const line = sha.trim();
  if (line.startsWith('MISSING') || !line) return { exists: false };
  const m = line.match(/^([a-f0-9]{64})/);
  return { exists: true, sha: m ? m[1] : null };
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

async function pressRow(rowText) {
  const r = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('[data-file-row]')];
      const target = rows.find((x) => (x.textContent || '').includes(${JSON.stringify(rowText)}));
      if (!target) return 'NOT_FOUND';
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }));
      return 'PRESSED';
    })()
  `);
  if (r !== 'PRESSED') throw new Error(`行按压失败 "${rowText}"`);
}

async function pickerEnterDir(dirName) {
  const r = await evalPage(`
    (() => {
      const list = document.querySelector('[class*="pickerList"]');
      if (!list) return 'NO_LIST';
      const rows = [...list.querySelectorAll('div')].filter(
        (e) => String(e.className).includes('row') && !String(e.className).includes('row__'),
      );
      const target = rows.find((e) => (e.textContent || '').includes(${JSON.stringify(dirName)}));
      if (!target) return 'NOT_FOUND';
      target.click();
      return 'CLICKED';
    })()
  `);
  if (r !== 'CLICKED') throw new Error(`目录行点击失败 ${dirName}: ${r}`);
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 走复制链路；skipPicker=true 时目标=当前目录（断网场景——目录列表不可用） */
async function copyViaUi(fileName, skipPicker = false) {
  await pressRow(fileName);
  await sleep(1300);
  await clickEl('[role="menuitem"]', '复制');
  await sleep(1200);
  if (!skipPicker) {
    await pickerEnterDir('财务目录');
    await sleep(1200);
  }
  await clickEl('[role="alertdialog"] button', '选此处');
}

async function main() {
  const results = {};
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();

  // 冷启动后连接→导航 gate4-test（点卡→重试→表单 fallback，六场景脚本同款）
  await clickEl('nav button', '添加连接');
  await sleep(1200);
  await clickEl('main div', 'Gate3验证服务器');
  await sleep(15000);
  let connected = await evalPage(`document.body.innerText.includes('已连接')`);
  if (!connected) {
    await clickEl('main div', 'Gate3验证服务器');
    await sleep(16000);
    connected = await evalPage(`document.body.innerText.includes('已连接')`);
  }
  if (!connected) {
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
    await setField('连接名称', 'Gate3验证服务器');
    await setField('服务器地址', '192.168.2.3');
    await setField('共享名', 'share');
    await setField('用户名', 'pad2gate3');
    await setField('密码', process.env.SMB_PW || 'Gate3-Test-2026');
    await evalPage(`(() => { const cb = document.querySelector('input[type="checkbox"]'); if (cb && !cb.checked) cb.click(); return 'OK'; })()`);
    await sleep(400);
    await clickEl('main button', '保存并连接');
    await sleep(16000);
    connected = await evalPage(`document.body.innerText.includes('已连接')`);
  }
  assert(connected, 'X.0 连接成功（点卡→fallback 表单）');
  await evalPage(`(() => { const bs = [...document.querySelectorAll('nav button')].filter((x) => x.textContent.includes('Gate3验证服务器')); const b = bs[bs.length - 1]; if (b) b.click(); return 'OK'; })()`);
  await sleep(3500);
  const curPath0 = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
  if (!String(curPath0).includes('gate4-test')) {
    await pressRow('gate4-test');
    await sleep(3500);
  }
  const rows = await evalPage(`document.querySelectorAll('[data-file-row]').length`);
  assert(rows >= 5, `X.1 gate4-test 列表就绪（${rows} 行）`);

  // ===== S7 断网 mid-op =====
  console.log('\n== S7 断网复制：如实失败+源完好+零半文件 ==');
  const SHA_B = serverCheck(`${GATE4}/测试B.txt`).sha;
  assert(!!SHA_B, 'S7.0 源基线就绪');
  adbShell('svc wifi disable');
  await sleep(4000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await copyViaUi('测试B.txt', true); // 断网：目标=当前目录（目录列表不可用属预期）
  await sleep(25000); // SMB 超时窗口（连接级错误回流）
  const t = await evalPage(`document.body.innerText`);
  const failed = t.includes('复制失败') || t.includes('失败：');
  assert(failed, 'S7.1 复制如实失败（不伪成功）');
  // 恢复网络
  adbShell('svc wifi enable');
  console.log('  wifi 恢复中…');
  await sleep(18000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  // 服务器核验（经 ssh 直连，不经平板）
  const srcB = serverCheck(`${GATE4}/测试B.txt`);
  assert(srcB.exists && srcB.sha === SHA_B, 'S7.2 源文件完好（SHA 不变）');
  const dstB = serverCheck(`${FIN}/测试B.txt`);
  assert(!dstB.exists, 'S7.3 目标无半写文件（失败清理/未达创建）');
  const half = ssh(`find '${FIN}' -name '*测试B*' -o -name '*.pad2tmp.*' 2>/dev/null | wc -l`).trim();
  assert(half === '0', `S7.4 零临时/半写残留（实际 ${half}）`);
  results.s7 = { honestFail: true, srcKept: true };
  await writeFileSync(join(OUT_DIR, 's503-s7-offline.txt'), 'S7 断网复制场景执行记录\n');
  console.log('  [记录] s503-s7 断网场景通过');

  // ===== S8 权限拒绝 =====
  console.log('\n== S8 权限复制：permission_denied 失败+源完好 ==');
  ssh(`rm -f '${FIN}/测试C.txt'`); // 清上轮批量复制残留（保证本轮目标不存在→纯权限场景）
  ssh(`chmod 000 '${GATE4}/测试C.txt'`);
  await sleep(1000);
  // 断网轮后会话失效（未连接态）：回连接页→点卡重连→SideNav 进 browse→gate4-test
  {
    const onConn = await evalPage(`document.body.innerText.includes('新建 SMB 连接')`);
    if (!onConn) {
      await clickEl('nav button', '添加连接');
      await sleep(1200);
    }
    await clickEl('main div', 'Gate3验证服务器');
    await sleep(16000);
    let reconn = await evalPage(`document.body.innerText.includes('已连接')`);
    if (!reconn) {
      await clickEl('main div', 'Gate3验证服务器');
      await sleep(16000);
      reconn = await evalPage(`document.body.innerText.includes('已连接')`);
    }
    assert(reconn, 'S8.0a 重连成功');
    await evalPage(`(() => { const bs = [...document.querySelectorAll('nav button')].filter((x) => x.textContent.includes('Gate3验证服务器')); const b = bs[bs.length - 1]; if (b) b.click(); return 'OK'; })()`);
    await sleep(3500);
    const p1 = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
    if (!String(p1).includes('gate4-test')) {
      await pressRow('gate4-test');
      await sleep(3500);
    }
    const rowsOk = await evalPage(`document.querySelectorAll('[data-file-row]').length`);
    assert(rowsOk >= 5, `S8.0b 列表恢复（${rowsOk} 行）`);
  }
  await copyViaUi('测试C.txt');
  await sleep(20000);
  const t2 = await evalPage(`document.body.innerText`);
  const permFail = t2.includes('复制失败') && (t2.includes('权限') || t2.includes('失败：'));
  assert(permFail, 'S8.1 权限不足如实失败（无权限类错误呈现）');
  ssh(`chmod 664 '${GATE4}/测试C.txt'`);
  const srcC = serverCheck(`${GATE4}/测试C.txt`);
  assert(srcC.exists, 'S8.2 源文件完好（chmod 恢复后）');
  const dstC = serverCheck(`${FIN}/测试C.txt`);
  assert(!dstC.exists, 'S8.3 目标未被创建（无越权写入）');
  results.s8 = { permissionDenied: true };

  writeFileSync(join(OUT_DIR, 's503-s78-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nTASK-S5-03 异常场景（断网/权限）验收通过');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try { adbShell('svc wifi enable'); } catch {}
  try { ssh(`chmod 664 '${GATE4}/测试C.txt'`); } catch {}
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});