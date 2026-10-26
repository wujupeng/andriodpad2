/** Gate-UI-4 阶段 A 尾段（多选已 2 项）：取消保留 → R7 菜单 → R5 删除 → R4 重命名灰显 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s4';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 60000 });
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
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false,
  });
  if (exceptionDetails) throw new Error(`evaluate 异常: ${exceptionDetails.text}`);
  return result.value;
}

async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT_DIR, name), Buffer.from(data, 'base64'));
  console.log(`  [SHOT] ${name}`);
}

async function clickByText(selector, text) {
  const clicked = await evalPage(`
    (() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els.find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
      if (!el) return 'NOT_FOUND';
      el.click();
      return 'CLICKED';
    })()
  `);
  if (clicked !== 'CLICKED') throw new Error(`点击失败 ${selector} "${text}": ${clicked}`);
}

async function tapFileRow(name) {
  const pos = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('[data-file-row]')];
      const target = rows.find((r) => (r.textContent || '').includes(${JSON.stringify(name)}));
      if (!target) return 'NOT_FOUND';
      const r = target.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()
  `);
  if (pos === 'NOT_FOUND') throw new Error(`文件行未找到 "${name}"`);
  const { x, y } = JSON.parse(pos);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, 95));
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
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

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = {};
  await connectWs();
  await sleep(600);

  console.log('== R6 取消退出（保留列表） ==');
  const before = await evalPage(`document.querySelectorAll('[data-file-row]').length`);
  await clickByText('footer button', '取消');
  await sleep(800);
  const exited = await evalPage(`
    (() => JSON.stringify({
      barGone: !document.body.innerText.includes('已选 2 项'),
      rowsKept: document.querySelectorAll('[data-file-row]').length,
    }))()
  `);
  const exitedV = JSON.parse(exited);
  assert(exitedV.barGone && exitedV.rowsKept === before, `取消多选：列表保留 ${before} 行（R6 退出保留）`);
  results.r6 = { tapAppend: '已选 2 项（前段手动验证）', exitKeep: exitedV };

  console.log('== R7 文件点击 → FileActionSheet ==');
  await tapFileRow('年度报告.docx');
  await sleep(1300);
  const sheet = JSON.parse(await evalPage(`
    (() => {
      const dialog = document.querySelector('[role="dialog"]');
      const t = dialog ? dialog.textContent : '';
      const items = dialog ? [...dialog.querySelectorAll('[role="menuitem"]')] : [];
      const disabled = items.filter((i) => i.getAttribute('aria-disabled') === 'true');
      return JSON.stringify({
        open: !!dialog, count: items.length, disabledCount: disabled.length,
        hasContext: t.includes('年度报告.docx') && t.includes('B'),
        hasOpen: t.includes('打开'), hasInfo: t.includes('属性'),
        deleteRed: (() => { const item = items.find((i) => i.textContent.includes('删除')); return item ? getComputedStyle(item.querySelector('span')).color : 'none'; })(),
      });
    })()
  `));
  assert(sheet.open && sheet.count === 7, `菜单 7 项（实际 ${sheet.count}）`);
  assert(sheet.disabledCount === 4, `能力缺失灰显 4 项（实际 ${sheet.disabledCount}）`);
  assert(sheet.hasContext, 'ContextHeader 名称+大小');
  assert(sheet.deleteRed === 'rgb(220, 38, 38)', `删除项红色（${sheet.deleteRed}）`);
  await screenshot('g4-a-action-sheet.png');
  results.r7 = sheet;

  console.log('== R5 远程删除确认流程（真机实操） ==');
  await clickByText('[role="dialog"] [role="menuitem"]', '删除');
  await sleep(900);
  const delDialog = JSON.parse(await evalPage(`
    (() => {
      const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
      const d = dialogs[dialogs.length - 1];
      const t = d ? d.textContent : '';
      const btn = d ? [...d.querySelectorAll('button')].find((b) => b.textContent.includes('永久删除')) : null;
      const ack = d ? d.querySelector('input[type="checkbox"]') : null;
      return JSON.stringify({
        title: t.includes('删除共享文件'),
        irreversible: t.includes('此操作不可恢复'),
        permanent: t.includes('永久删除') && t.includes('无法通过回收站找回'),
        confirmDisabled: btn ? btn.disabled : true,
        hasAck: !!ack,
      });
    })()
  `));
  assert(delDialog.title, '远程删除标题"删除共享文件"');
  assert(delDialog.irreversible, '"此操作不可恢复"措辞');
  assert(delDialog.permanent, '"永久删除/无法通过回收站找回"措辞');
  assert(delDialog.confirmDisabled && delDialog.hasAck, '未勾选禁用+勾选框存在（R5 真机）');
  await screenshot('g4-a-delete-remote-device.png');
  await evalPage(`
    (() => { const dialogs = [...document.querySelectorAll('[role="alertdialog"]')]; const d = dialogs[dialogs.length - 1]; d.querySelector('input[type="checkbox"]').click(); return 'OK'; })()
  `);
  await sleep(500);
  await clickByText('[role="alertdialog"] button', '永久删除');
  await sleep(3000);
  const delResult = JSON.parse(await evalPage(`
    (() => JSON.stringify({
      failBanner: document.body.innerText.includes('删除失败'),
      reasonVisible: document.body.innerText.includes('暂不可用') || document.body.innerText.includes('未暴露'),
      noSuccess: !document.body.innerText.includes('删除完成'),
    }))()
  `));
  assert(delResult.failBanner, '删除任务失败 Banner 呈现（不伪报成功）');
  assert(delResult.noSuccess, '无成功误报');
  if (delResult.reasonVisible) console.log('  [INFO] 失败原因可见（能力缺失如实）');
  results.r5Delete = delResult;
  await screenshot('g4-a-delete-remote-result.png');
  // 关闭结果 Banner（知道了）
  await clickByText('button', '知道了');
  await sleep(600);

  console.log('== R4 重命名/复制灰显（能力缺失真机） ==');
  await tapFileRow('预算.xlsx');
  await sleep(1300);
  const renameState = JSON.parse(await evalPage(`
    (() => {
      const dialog = document.querySelector('[role="dialog"]');
      const items = dialog ? [...dialog.querySelectorAll('[role="menuitem"]')] : [];
      const rename = items.find((i) => i.textContent.includes('重命名'));
      const copy = items.find((i) => i.textContent.includes('复制'));
      return JSON.stringify({
        renameDisabled: rename ? rename.getAttribute('aria-disabled') === 'true' : 'NO_ITEM',
        copyDisabled: copy ? copy.getAttribute('aria-disabled') === 'true' : 'NO_ITEM',
      });
    })()
  `));
  assert(renameState.renameDisabled, `重命名灰显（${renameState.renameDisabled}）`);
  assert(renameState.copyDisabled, `复制灰显（${renameState.copyDisabled}）`);
  await screenshot('g4-a-rename-copy-disabled.png');
  results.r4Grey = renameState;
  // 关闭菜单
  await evalPage(`
    (() => { const sheet = document.querySelector('[role="dialog"]'); const scrim = sheet ? sheet.parentElement : null; if (scrim) scrim.click(); return 'OK'; })()
  `);
  await sleep(700);

  results.r9Conflict = 'copy 菜单灰显（真机无可用复制路径触发冲突流；四选一完整验证归 web 36 断言 + fas-conflict-four.png，如实披露）';
  console.log(`  [披露] ${results.r9Conflict}`);

  writeFileSync(join(OUT_DIR, 'g4-a3-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nGate-UI-4 阶段 A（尾段）真机验证通过');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});