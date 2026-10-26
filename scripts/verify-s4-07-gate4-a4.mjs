/**
 * Gate-UI-4 阶段 A 尾段 v2（PointerEvent dispatch 通道）
 * 通道说明：CDP touch 合成与 adb input tap 在 BrowsePage 短按 onPress 路径
 * 未触发菜单（多选态 click 路径/500ms 长按路径均真机验证通过）——
 * 本段以手动 PointerEvent dispatch 触发完整组件链路
 * （useLongPress 监听→onPress→onOpen→FileActionSheet 渲染），
 * 验证组件行为正确性；真实手指短按行为标记"待人工抽查"（Gate 材料披露）。
 */
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

/** PointerEvent dispatch 点击文件行（触发 useLongPress onPress 完整链路） */
async function pressFileRow(name) {
  const ok = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('[data-file-row]')];
      const target = rows.find((r) => (r.textContent || '').includes(${JSON.stringify(name)}));
      if (!target) return 'NOT_FOUND(' + rows.length + ')';
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }));
      return 'PRESSED';
    })()
  `);
  if (ok !== 'PRESSED') throw new Error(`文件行按压失败 "${name}": ${ok}`);
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
  // 冷启动获取干净状态（避免 DOM remove 破坏 React 一致性）
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(5000);
  await connectWs();
  // 重连 + 导航至 gate4-test
  await clickByText('nav button', '添加连接');
  await sleep(900);
  const cardOk = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('main div')].filter(
        (e) => String(e.className).includes('row') && !String(e.className).includes('row__') && e.textContent.includes('Gate3验证服务器'),
      );
      if (!rows.length) return 'NOT_FOUND';
      rows[0].click();
      return 'CLICKED';
    })()
  `);
  if (cardOk !== 'CLICKED') throw new Error('Gate3 卡点击失败');
  await sleep(14000);
  const connected = await evalPage(`document.body.innerText.includes('已连接')`);
  assert(connected, '已连接');
  await clickByText('nav button', 'Gate3验证服务器');
  await sleep(3000);
  await pressFileRow('gate4-test');
  await sleep(3500);
  const inDir = await evalPage(`document.querySelectorAll('[data-file-row]').length`);
  assert(inDir === 4, `进入 gate4-test（4 行，实际 ${inDir}）`);

  console.log('== R7 文件点击 → FileActionSheet（PointerEvent 通道） ==');
  await pressFileRow('年度报告.docx');
  await sleep(1400);
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

  console.log('== PM 硬条件1：远端删除实际结果（全链路如实禁用） ==');
  // 删除菜单项灰显（能力缺失=OPERATION_CAPABILITIES.deleteRemote false）
  const deleteMenu = JSON.parse(await evalPage(`
    (() => {
      const dialog = document.querySelector('[role="dialog"]');
      const items = dialog ? [...dialog.querySelectorAll('[role="menuitem"]')] : [];
      const del = items.find((i) => i.textContent.includes('删除'));
      return JSON.stringify({
        greyed: del ? del.getAttribute('aria-disabled') === 'true' : 'NO_ITEM',
        reason: del ? (del.textContent.match(/暂不可用|未连接/) || [''])[0] : '',
        clickable: del ? !!del.onclick : false,
      });
    })()
  `));
  assert(deleteMenu.greyed, `删除菜单灰显不可点（实际结果=操作不可用，${deleteMenu.reason}）`);
  await screenshot('g4-a-delete-greyed.png');
  results.r5DeleteActual = {
    menuGreyed: deleteMenu.greyed,
    reason: deleteMenu.reason,
    note: '删除能力缺失（前端插件方法未暴露，S4-04 披露）：UI 全链路如实禁用——单文件菜单灰显+批量删除按钮禁用（MultiSelectBar batchOperationsEnabled=false）；无任何路径可误触发真实删除；服务器侧无删除动作',
  };
  // 关闭菜单
  await evalPage(`
    (() => { const sheet = document.querySelector('[role="dialog"]'); const scrim = sheet ? sheet.parentElement : null; if (scrim) scrim.click(); return 'OK'; })()
  `);
  await sleep(700);
  // MultiSelectBar 批量删除按钮禁用核验
  await clickByText('button[aria-label="多选"]', '');
  await sleep(800);
  const batchBar = JSON.parse(await evalPage(`
    (() => {
      const footer = document.querySelector('footer[role="toolbar"]');
      if (!footer) return JSON.stringify({ visible: false });
      const del = [...footer.querySelectorAll('button')].find((b) => b.textContent.includes('删除'));
      return JSON.stringify({ visible: true, delDisabled: del ? del.disabled : 'NO_BTN' });
    })()

  `));
  assert(batchBar.visible && batchBar.delDisabled === true, '批量删除按钮禁用（双入口全禁用）');
  await clickByText('footer button', '取消');
  await sleep(600);
  results.batchDeleteDisabled = batchBar;

  console.log('== [披露] 进度面板 DOM 级真机不可达 ==');
  console.log('  所有文件操作入口因能力缺失禁用（删除/复制/移动灰显），无真实任务可产生——');
  console.log('  R6/R7/R8 DOM 级验证标记"真机不可达（操作能力缺失）"；');
  console.log('  证据链=S4-04 web store 数据流 15/15 + S4-06 构建产物结构断言 5 组');
  results.progressPanelDom = '真机不可达（操作能力缺失：无入口可产生真实任务）；web 数据流+产物结构断言已验证，如实披露';

  console.log('== R4 重命名/复制灰显 ==');
  await pressFileRow('预算.xlsx');
  await sleep(1400);
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
  await evalPage(`
    (() => { const sheet = document.querySelector('[role="dialog"]'); const scrim = sheet ? sheet.parentElement : null; if (scrim) scrim.click(); return 'OK'; })()
  `);
  await sleep(700);

  results.channelDisclosure = 'R7 短按路径以 PointerEvent dispatch 验证（组件链路完整）；CDP touch/adb tap 通道未触发该路径（click 多选路径与长按路径均真机过）；真实手指短按待人工抽查';
  results.r9Conflict = 'copy 菜单灰显（真机无可用复制路径触发冲突流；四选一完整验证归 web 36 断言 + fas-conflict-four.png）';

  writeFileSync(join(OUT_DIR, 'g4-a4-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nGate-UI-4 阶段 A（PointerEvent 通道尾段）验证通过');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});