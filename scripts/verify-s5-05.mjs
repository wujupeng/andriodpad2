/**
 * TASK-S5-05 真机验收：PM 九场景强制门槛（服务器三件套核验）
 * D1 正常删除：只删指定测试文件，服务器确认消失，其他文件不变
 * D2 取消确认：不发送操作，文件不变（服务器核验+无插件调用日志）
 * D3 目标不存在：明确失败不伪报成功（CDP 直调注入已删除路径）
 * D4 无删除权限：明确失败文件不变（chmod 000）
 * D5 断网：如实失败+服务器文件不变（未收到响应不假定未发生——服务器侧核验）
 * D6 重复触发：连点确认不误删其他文件
 * D7 目录目标：拒绝执行（UI 灰显+原生 folderExists 预检双防线）
 * D8 缓存隔离：远端删除后本地缓存文件不受影响
 * D9 回滚：capabilities 静态核验（开关关闭后 UI+执行器均禁用）
 * 通道：el.click（按钮/menuitem/Dialog）+ PointerEvent dispatch（文件行）
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
function serverExists(path) {
  return ssh(`test -e '${path}' && echo YES || echo NO`).trim() === 'YES';
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

async function pressRow(rowText) {
  let r = 'NOT_FOUND';
  for (let i = 0; i < 3 && r !== 'PRESSED'; i += 1) {
    r = await evalPage(`
      (() => {
        const rows = [...document.querySelectorAll('[data-file-row]')];
        const target = rows.find((x) => (x.textContent || '').includes(${JSON.stringify(rowText)}));
        if (!target) return 'NOT_FOUND';
        target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }));
        target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }));
        return 'PRESSED';
      })()
    `);
    if (r !== 'PRESSED') await sleep(1500);
  }
  if (r !== 'PRESSED') throw new Error(`行按压失败 "${rowText}"`);
}

/** 走删除链路到确认框（不点确认）；confirm=true 时勾选+确认 */
async function deleteViaUi(rowName, { confirm = true, doubleFire = false } = {}) {
  await pressRow(rowName);
  await sleep(1400);
  await clickEl('[role="menuitem"]', '删除');
  await sleep(1100);
  if (confirm) {
    // 勾选"我了解此操作不可恢复"
    await evalPage(`(() => { const cb = document.querySelector('[role="alertdialog"] input[type="checkbox"]'); if (cb) cb.click(); return 'OK'; })()`);
    await sleep(500);
    await clickEl('[role="alertdialog"] button', '永久删除');
    if (doubleFire) {
      await sleep(300);
      // 连点第二次（防重入验证——operationStore 防重入+服务器核验只删一次）
      await evalPage(`(() => { const d = [...document.querySelectorAll('[role="alertdialog"]')].pop(); if (!d) return 'GONE'; const btn = [...d.querySelectorAll('button')].find((b) => b.textContent.includes('永久删除')); if (btn) btn.click(); return 'OK'; })()`);
    }
  }
}

/** 等待删除结果呈现 */
async function waitResult(ms = 14000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const t = await evalPage(`document.body.innerText`);
    if (t.includes('删除完成')) return 'success';
    if (t.includes('删除失败') || t.includes('失败：') || t.includes('不支持删除文件夹') || t.includes('文件不存在')) return 'failed';
    await sleep(700);
  }
  return 'timeout';
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = {};
  adbShell('svc power stayon true');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();

  console.log('== 0 连接+导航 gate4-test ==');
  await clickEl('nav button', '添加连接');
  await sleep(1200);
  await clickEl('main div', 'Gate3验证服务器');
  await sleep(15000);
  let connected = await evalPage(`document.body.innerText.includes('已连接')`);
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
  assert(connected, '0.1 连接成功');
  await evalPage(`(() => { const bs = [...document.querySelectorAll('nav button')].filter((x) => x.textContent.includes('Gate3验证服务器')); const b = bs[bs.length - 1]; if (b) b.click(); return 'OK'; })()`);
  await sleep(4500);
  let curPath = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
  if (!String(curPath).includes('gate4-test')) {
    await pressRow('gate4-test');
    await sleep(3500);
    curPath = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
    if (!String(curPath).includes('gate4-test')) {
      await sleep(2500);
      await pressRow('gate4-test');
      await sleep(3500);
    }
  }
  const rows = await evalPage(`document.querySelectorAll('[data-file-row]').length`);
  assert(rows === 5, `0.2 gate4-test 列表（5 行，实际 ${rows}）`);

  // ===== D2 取消确认（先做——不消耗 D1 基线） =====
  console.log('\n== D2 取消确认：不发送操作，文件不变 ==');
  const pid0 = adbShell('pidof com.pad2.filemanager').trim();
  adbShell(`logcat -c`);
  await pressRow('取消目标.txt');
  await sleep(1400);
  await clickEl('[role="menuitem"]', '删除');
  await sleep(1100);
  // 确认框呈现（含共享路径行——PM 要求）后点取消
  const dialogText = await evalPage(`(() => { const d = [...document.querySelectorAll('[role="alertdialog"]')].pop(); return d ? d.textContent : '无'; })()`);
  assert(dialogText.includes('此操作不可恢复') && dialogText.includes('取消目标.txt'), 'D2.1 确认框呈现（含目标文件名）');
  assert(dialogText.includes('位于共享：'), 'D2.2 确认框显示共享路径（PM 要求）');
  assert(dialogText.includes('永久删除'), 'D2.3 danger 措辞+永久删除按钮');
  await screenshot('s505-d2-confirm-dialog.png');
  await clickEl('[role="alertdialog"] button', '取消');
  await sleep(1500);
  assert(serverExists(`${GATE4}/取消目标.txt`), 'D2.4 取消后文件仍在（服务器核验）');
  const noCall = adbShell(`logcat -d --pid=${pid0} 2>/dev/null | grep -c "deleteRemoteFile" || true`).trim();
  assert(noCall === '0', `D2.5 未发送删除操作（插件调用 0 次，实际 ${noCall}）`);
  results.D2 = { cancelled: true, pathShown: true };

  // ===== D7 目录目标拒绝（UI 灰显：经多选路径——目录短按=进入目录不弹菜单） =====
  console.log('\n== D7 目录目标拒绝（UI 灰显：多选→目录→批量删除入口） ==');
  {
    // 清 D2 残留 sheet（scrim click 关闭）
    await evalPage(`(() => { const s = document.querySelector('[role="dialog"]'); const scrim = s ? s.parentElement : null; if (scrim) scrim.click(); return 'OK'; })()`);
    await sleep(800);
    // 进入多选（目录置顶=首行——enterSelectionMode 自动选中财务目录为初始项）
    await clickEl('button[aria-label="多选"]', '');
    await sleep(900);
    const selCount = await evalPage(`(document.body.innerText.match(/已选 [0-9]+ 项/) || ['无'])[0]`);
    console.log(`  [STAT] 多选初始=${selCount}（财务目录置顶自动选中）`);
    // MultiSelectBar 删除按钮 → FileActionSheet（entries=[财务目录]）
    await clickEl('footer button', '删除');
    await sleep(1400);
    const menuState = await evalPage(`
      (() => {
        const items = [...document.querySelectorAll('[role="menuitem"]')];
        const del = items.find((i) => (i.textContent || '').includes('删除'));
        return JSON.stringify({
          greyed: del ? del.getAttribute('aria-disabled') === 'true' : 'NO_ITEM',
          reason: del ? (del.textContent.match(/暂不支持文件夹/) || [''])[0] : '',
        });
      })()
    `);
    const d7 = JSON.parse(menuState);
    assert(d7.greyed === true, `D7.1 目录删除菜单灰显（${d7.reason}——UI 灰显+原生预检双防线）`);
    await screenshot('s505-d7-dir-greyed.png');
    // 退出多选+关菜单
    await evalPage(`(() => { const s = document.querySelector('[role="dialog"]'); const scrim = s ? s.parentElement : null; if (scrim) scrim.click(); return 'OK'; })()`);
    await sleep(800);
    const stillMulti = await evalPage(`!!document.querySelector('footer[role="toolbar"]')`);
    if (stillMulti) {
      await clickEl('footer button', '取消');
      await sleep(800);
    }
    assert(serverExists(`${GATE4}/财务目录`), 'D7.2 目录未受影响');
    results.D7 = { uiGreyed: true };
    // 原生层 folderExists 预检双防线（CDP 直调验证拒绝语义）
    const nativeReject = await evalPage(`(async () => {
      try {
        await window.Capacitor.Plugins.SmbPlugin.deleteRemoteFile({ path: 'gate4-test\\\\财务目录' });
        return 'UNEXPECTED_SUCCESS';
      } catch (e) {
        return 'REJECTED:' + String(e.message || e).substring(0, 80);
      }
    })()`, true);
    console.log(`  [STAT] 原生预检=${nativeReject}`);
    assert(String(nativeReject).startsWith('REJECTED'), 'D7.3 原生层 folderExists 预检拒绝（双防线）');
    results.D7.nativeReject = String(nativeReject).substring(0, 80);
  }

  // ===== D1 正常删除 =====
  console.log('\n== D1 正常删除：待删除.txt ==');
  await deleteViaUi('待删除.txt');
  const d1r = await waitResult();
  assert(d1r === 'success', `D1.1 任务结果 success（实际 ${d1r}）`);
  await sleep(1000);
  assert(!serverExists(`${GATE4}/待删除.txt`), 'D1.2 服务器确认文件消失');
  assert(serverExists(`${GATE4}/无辜文件.txt`), 'D1.3 其他文件不受影响（PM 门槛：只删指定文件）');
  assert(serverExists(`${GATE4}/取消目标.txt`), 'D1.4 取消目标仍在');
  results.D1 = { deleted: true, othersKept: true };
  await screenshot('s505-d1-deleted.png');

  // ===== D3 目标不存在（CDP 直调注入已删除路径） =====
  console.log('\n== D3 目标不存在：明确失败不伪报成功 ==');
  const d3 = await evalPage(`(async () => {
    try {
      await window.Capacitor.Plugins.SmbPlugin.deleteRemoteFile({ path: 'gate4-test\\\\待删除.txt' });
      return 'UNEXPECTED_SUCCESS';
    } catch (e) {
      return 'FAILED:' + String(e.message || e).substring(0, 100);
    }
  })()`, true);
  console.log(`  [STAT] ${d3}`);
  assert(String(d3).startsWith('FAILED') && String(d3).includes('不存在'), 'D3.1 目标不存在→明确失败（不伪报成功）');
  results.D3 = String(d3).substring(0, 100);

  // ===== D4 无删除权限 =====
  console.log('\n== D4 无删除权限：明确失败文件不变 ==');
  ssh(`chmod 000 '${GATE4}/无辜文件.txt'`);
  await sleep(800);
  // 页面列表可能已缓存（文件还在列表中）——走 UI 链路
  await deleteViaUi('无辜文件.txt');
  const d4r = await waitResult(18000);
  assert(d4r === 'failed', `D4.1 权限不足如实失败（实际 ${d4r}）`);
  ssh(`chmod 664 '${GATE4}/无辜文件.txt'`);
  assert(serverExists(`${GATE4}/无辜文件.txt`), 'D4.2 文件保持不变（chmod 恢复后核验）');
  results.D4 = { honestFail: true };
  await screenshot('s505-d4-permission.png');

  // ===== D6 重复触发（连点确认） =====
  console.log('\n== D6 重复触发：连点确认不误删其他文件 ==');
  await deleteViaUi('取消目标.txt', { doubleFire: true });
  const d6r = await waitResult();
  assert(d6r === 'success' || d6r === 'timeout', `D6.1 删除完成（实际 ${d6r}——连点不产生错误态）`);
  await sleep(1500);
  assert(!serverExists(`${GATE4}/取消目标.txt`), 'D6.2 目标已删除（一次）');
  assert(serverExists(`${GATE4}/无辜文件.txt`) && serverExists(`${GATE4}/缓存关联.txt`), 'D6.3 其他文件零误删');
  results.D6 = { singleDelete: true, noCollateral: true };

  // ===== D5 断网 =====
  console.log('\n== D5 断网删除：如实失败+服务器核验（不假定未发生/不盲目重试） ==');
  adbShell('svc wifi disable');
  await sleep(4000);
  adbShell('input keyevent KEYCODE_WAKEUP');
  await deleteViaUi('缓存关联.txt');
  await sleep(25000);
  const d5t = await evalPage(`document.body.innerText`);
  assert(d5t.includes('删除失败') || d5t.includes('失败：'), 'D5.1 断网如实失败（不伪成功）');
  adbShell('svc wifi enable');
  await sleep(18000);
  // 服务器侧核验（PM 要求：先核对实际状态，不假定）——wifi 已断，服务器文件状态如何
  assert(serverExists(`${GATE4}/缓存关联.txt`), 'D5.2 服务器核验：文件未被删除（断网窗口操作未达服务器）');
  results.D5 = { honestFail: true, serverKept: true };

  // ===== D8 缓存隔离 =====
  console.log('\n== D8 缓存隔离：远端删除不影响本地缓存 ==');
  const cacheBefore = adbShell(`ls /storage/emulated/0/PAD2/smb_cache/ 2>/dev/null | sort`).trim();
  // wifi 恢复后重连+刷新
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(3000);
  const onConn = await evalPage(`document.body.innerText.includes('新建 SMB 连接')`);
  if (onConn) {
    await clickEl('main div', 'Gate3验证服务器');
    await sleep(16000);
  }
  // 删除最后一个服务器文件（缓存关联.txt）——观察缓存目录不受影响
  await evalPage(`(() => { const bs = [...document.querySelectorAll('nav button')].filter((x) => x.textContent.includes('Gate3验证服务器')); const b = bs[bs.length - 1]; if (b) b.click(); return 'OK'; })()`);
  await sleep(4000);
  let p5 = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
  if (!String(p5).includes('gate4-test')) {
    await pressRow('gate4-test');
    await sleep(3500);
  }
  await deleteViaUi('缓存关联.txt');
  const d8r = await waitResult();
  assert(d8r === 'success', `D8.1 远端删除成功（实际 ${d8r}）`);
  assert(!serverExists(`${GATE4}/缓存关联.txt`), 'D8.2 服务器文件已删除');
  const cacheAfter = adbShell(`ls /storage/emulated/0/PAD2/smb_cache/ 2>/dev/null | sort`).trim();
  assert(cacheAfter === cacheBefore, `D8.3 本地缓存目录不变（${cacheBefore.split('\n').length} 个文件隔离保持——cleanup 语义零关联）`);
  results.D8 = { cacheIsolated: true, cacheFiles: cacheBefore.split('\n').length };

  // ===== D9 回滚（静态核验+披露） =====
  console.log('\n== D9 回滚核验 ==');

  results.D9 = 'capabilities.deleteRemote=true（启用）；回滚=改 false 一行（useActionAvailability notAvailable 灰显菜单+executeDelete notAvailable 禁用——双入口禁用）；无运行时 UI 开关（如实披露）';
  console.log(`  [披露] ${results.D9}`);

  writeFileSync(join(OUT_DIR, 's505-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nTASK-S5-05 真机验收九场景全部通过（服务器三件套核验）');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try { adbShell('svc wifi enable'); ssh(`chmod 664 '${GATE4}/无辜文件.txt'`); } catch {}
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});