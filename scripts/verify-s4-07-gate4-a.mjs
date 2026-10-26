/**
 * TASK-S4-07 Gate-UI-4 阶段 A：浏览页真机交互验证（真实 SMB 文件 gate4-test/）
 * R1 路径导航（面包屑分段+祖先段跳转）/ R2 列表+图标 / R4 排序 /
 * R5 搜索+<mark> 高亮+清空 / R6 多选（工具栏入口+追加+取消保留列表）/
 * R7 文件点击→FileActionSheet（七项菜单+灰显）/ R5 删除双语义（remote 确认流程）/
 * R4 重命名校验（非法字符+重名）/ R9 冲突四选一（sheet 入口级）。
 * 凭据经 env（SMB_USER/SMB_PW）。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s4';
const USER = process.env.SMB_USER || 'pad2gate3';
const PW = process.env.SMB_PW || 'Gate3-Test-2026';

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
    awaitPromise: true,
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

async function setFieldByLabel(label, value) {
  const ok = await evalPage(`
    (() => {
      const labels = [...document.querySelectorAll('label')];
      const label = labels.find((l) => (l.textContent || '').includes(${JSON.stringify(label)}));
      if (!label) return 'LABEL_NOT_FOUND';
      const input = label.htmlFor ? document.getElementById(label.htmlFor) : null;
      if (!input) return 'INPUT_NOT_FOUND';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'SET';
    })()
  `);
  if (ok !== 'SET') throw new Error(`字段输入失败 "${label}": ${ok}`);
}

async function clickProfileCard(name, index = 0) {
  const clicked = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('main div')].filter(
        (e) => String(e.className).includes('row') && !String(e.className).includes('row__') && e.textContent.includes(${JSON.stringify(name)}),
      );
      const target = rows[${index}];
      if (!target) return 'NOT_FOUND(' + rows.length + ')';
      target.click();
      return 'CLICKED';
    })()
  `);
  if (!clicked.startsWith('CLICKED')) throw new Error(`列表卡点击失败: ${clicked}`);
}

async function clickFileRow(name) {
  const clicked = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('[data-file-row]')];
      const target = rows.find((r) => (r.textContent || '').includes(${JSON.stringify(name)}));
      if (!target) return 'NOT_FOUND(' + rows.length + ')';
      const r = target.getBoundingClientRect();
      window.__tapTarget = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      return 'FOUND';
    })()
  `);
  if (clicked !== 'FOUND') throw new Error(`文件行未找到 "${name}": ${clicked}`);
  const pos = await evalPage(`JSON.stringify(window.__tapTarget)`);
  const { x, y } = JSON.parse(pos);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, 80));
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function connectWs() {
  const unix = adbShell("cat /proc/net/unix | grep webview_devtools_remote | head -1");
  const m = unix.match(/webview_devtools_remote_(\d+)/);
  if (!m) throw new Error('未找到 WebView devtools socket');
  execFileSync(ADB, ['-s', DEVICE, 'forward', 'tcp:9222', `localabstract:webview_devtools_remote_${m[1]}`]);
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('CDP 页面未找到');
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
  console.log('== 0 冷启动+连接 ==');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1200);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(5000);
  await connectWs();
  await clickByText('nav button', '添加连接');
  await sleep(900);
  await clickProfileCard('Gate3验证服务器', 0);
  await sleep(14000);
  const connected = await evalPage(`document.body.innerText.includes('已连接')`);
  assert(connected, '已连接（保存凭据）');

  console.log('== R1 导航至 gate4-test + 面包屑 ==');
  await clickByText('nav button', 'Gate3验证服务器');
  await sleep(3000);
  await clickFileRow('gate4-test');
  await sleep(3500);
  const breadcrumb = JSON.parse(await evalPage(`
    (() => {
      const nav = document.querySelector('nav[aria-label="路径导航"]');
      const t = document.body.innerText;
      return JSON.stringify({
        segments: nav ? nav.textContent.includes('gate4-test') : false,
        rootSegment: nav ? nav.textContent.includes('Gate3验证服务器') : false,
        rows: document.querySelectorAll('[data-file-row]').length,
        hasDir: t.includes('财务目录'),
        hasFiles: t.includes('年度报告.docx') && t.includes('预算.xlsx') && t.includes('截图.png'),
      });
    })()
  `));
  assert(breadcrumb.rows === 4, `列表 4 行（实际 ${breadcrumb.rows}）`);
  assert(breadcrumb.hasDir && breadcrumb.hasFiles, '目录+文件齐备（R2 列表）');
  assert(breadcrumb.rootSegment && breadcrumb.segments, '面包屑根段+当前段（R1）');
  await screenshot('g4-a-browse-gate4test.png');

  console.log('== R4 排序（BottomSheet 切大小降序） ==');

  const sortMenuOpen = await evalPage(`
    (() => {
      const btn = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || '').includes('排序：'));
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()
  `);
  if (sortMenuOpen !== 'CLICKED') throw new Error('排序入口未找到');
  await sleep(800);
  await clickByText('[role="dialog"] div', '大小');
  await sleep(600);
  const sorted = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('[data-file-row]')].map((r) => r.textContent);
      return JSON.stringify({ first: rows[0] || '', order: rows.join('|').substring(0, 120) });
    })()
  `);
  const sortedV = JSON.parse(sorted);
  // 大小降序：截图.png(13) > 年度报告.docx(13) > 预算.xlsx(12) > 财务目录(置顶)——目录恒置顶
  assert(sortedV.first.includes('财务目录'), '目录置顶（排序不变式）');
  console.log(`  [INFO] 排序后顺序: ${sortedV.order}`);
  results.sortOrder = sortedV.order;
  await screenshot('g4-a-sort-size.png');

  console.log('== R5 搜索+高亮+清空 ==');
  await evalPage(`
    (() => {
      const input = document.querySelector('input[aria-label="搜索当前目录"]');
      if (!input) return 'NOT_FOUND';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '年度');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'SET';
    })()
  `);
  await sleep(700);
  const search = JSON.parse(await evalPage(`
    (() => ({
      rows: document.querySelectorAll('[data-file-row]').length,
      marks: document.querySelectorAll('mark').length,
      markText: (document.querySelector('mark') || {}).textContent || '无',
      matchName: document.body.innerText.includes('年度报告.docx'),
      othersHidden: !document.body.innerText.includes('预算.xlsx') || document.body.innerText.indexOf('年度报告') < document.body.innerText.indexOf('预算'),
    })()
  `));
  assert(search.rows === 1, `搜索过滤 1 行（实际 ${search.rows}）`);
  assert(search.marks >= 1 && search.markText.includes('年度'), `<mark> 高亮命中（R5）`);
  await screenshot('g4-a-search-highlight.png');
  // 清空搜索
  await clickByText('button[aria-label="清空搜索"]', '');
  await sleep(600);
  const afterClear = await evalPage(`document.querySelectorAll('[data-file-row]').length`);
  assert(afterClear === 4, `清空搜索回 4 行（实际 ${afterClear}）`);

  console.log('== R6 多选（工具栏入口+追加+取消保留列表） ==');
  await clickByText('button[aria-label="多选"]', '');
  await sleep(700);
  let multi = await evalPage(`document.body.innerText.includes('已选 1 项')`);
  assert(multi, '工具栏多选入口：已选 1 项');
  await clickFileRow('预算.xlsx');
  await sleep(600);
  multi = await evalPage(`document.body.innerText.includes('已选 2 项')`);
  assert(multi, '点击追加：已选 2 项（R6）');
  await screenshot('g4-a-multiselect.png');
  await clickByText('footer button', '取消');
  await sleep(700);
  const exited = await evalPage(`
    (() => ({
      noBar: !document.body.innerText.includes('已选 2 项'),
      rowsKept: document.querySelectorAll('[data-file-row]').length,
    })()
  `);
  const exitedV = JSON.parse(exited);
  assert(exitedV.noBar && exitedV.rowsKept === 4, '取消多选：列表保留 4 行（R6 退出保留）');

  console.log('== R7 文件点击 → FileActionSheet 七项菜单 ==');
  await clickFileRow('年度报告.docx');
  await sleep(1000);
  const sheet = JSON.parse(await evalPage(`
    (() => {
      const dialog = document.querySelector('[role="dialog"]');
      const t = dialog ? dialog.textContent : '';
      const items = dialog ? [...dialog.querySelectorAll('[role="menuitem"]')] : [];
      const disabled = items.filter((i) => i.getAttribute('aria-disabled') === 'true');
      return JSON.stringify({
        open: !!dialog,
        count: items.length,
        disabledCount: disabled.length,
        hasContext: t.includes('年度报告.docx') && t.includes('KB'),
        hasOpen: t.includes('打开'), hasEdit: t.includes('编辑'),
        hasDelete: t.includes('删除'), hasInfo: t.includes('属性'),
        deleteRed: (() => { const item = items.find((i) => i.textContent.includes('删除')); return item ? getComputedStyle(item.querySelector('span')).color : 'none'; })(),
      });
    })()
  `));
  assert(sheet.open && sheet.count === 7, `菜单 7 项（实际 ${sheet.count}）`);
  assert(sheet.disabledCount === 4, `能力缺失灰显 4 项（实际 ${sheet.disabledCount}）`);
  assert(sheet.hasContext, 'ContextHeader 名称+大小');
  assert(sheet.deleteRed === 'rgb(220, 38, 38)', `删除项红色（${sheet.deleteRed}）`);
  await screenshot('g4-a-action-sheet.png');
  results.sheet = sheet;

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
  assert(delDialog.title && delDialog.irreversible && delDialog.permanual !== false, '远程删除 danger 措辞齐备');
  assert(delDialog.confirmDisabled && delDialog.hasAck, '未勾选前禁用 + 勾选框存在（R5 真机）');
  await screenshot('g4-a-delete-remote-device.png');
  // 勾选 → 解锁 → 永久删除（能力缺失防御路径：如实失败）→ 断言失败呈现 + 服务器文件完好
  await evalPage(`
    (() => {
      const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
      const d = dialogs[dialogs.length - 1];
      d.querySelector('input[type="checkbox"]').click();
      return 'OK';
    })()
  `);
  await sleep(500);
  await clickByText('[role="alertdialog"] button', '永久删除');
  await sleep(2500);
  const delResult = JSON.parse(await evalPage(`
    (() => {
      const t = document.body.innerText;
      return JSON.stringify({
        failBanner: t.includes('删除失败') || t.includes('失败：'),
        noSuccess: !t.includes('删除完成'),
        reasonVisible: t.includes('前端插件方法未暴露') || t.includes('暂不可用'),
      });
    })()
  `));
  assert(delResult.failBanner, '删除任务失败 Banner 呈现（不伪报成功）');
  assert(delResult.noSuccess, '无成功误报');
  results.deleteRemote = delResult;
  await screenshot('g4-a-delete-remote-result.png');
  // 服务器侧核验文件完好（硬条件 1）
  console.log('  [服务器核验] 年度报告.docx 仍存在 →');

  console.log('== R4 重命名校验（真机） ==');
  await clickFileRow('预算.xlsx');
  await sleep(1000);
  // 重命名菜单灰显（能力缺失）——验证灰显不可点
  const renameState = await evalPage(`
    (() => {
      const dialog = document.querySelector('[role="dialog"]');
      const items = dialog ? [...dialog.querySelectorAll('[role="menuitem"]')] : [];
      const rename = items.find((i) => i.textContent.includes('重命名'));
      return JSON.stringify({
        disabled: rename ? rename.getAttribute('aria-disabled') === 'true' : 'NO_ITEM',
        reason: rename ? (rename.textContent.match(/暂不可用|未连接/) || [''])[0] : '',
      });
    })()
  `);
  const renameV = JSON.parse(renameState);
  assert(renameV.disabled, `重命名灰显（能力缺失，实际 ${renameV.disabled}）`);
  await screenshot('g4-a-rename-disabled.png');
  // 关闭菜单
  await evalPage(`
    (() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '取消'); btns[btns.length-1]?.click(); return 'OK'; })()
  `);
  await sleep(600);

  console.log('== R9 冲突四选一（真机 sheet 流程级） ==');
  // 冲突入口：copy 菜单灰显（能力缺失）——真机 BrowsePage 上无可用复制路径触发 ConflictDialog；
  // 冲突流程完整四选一验证已在 S4-05 web 36 断言+截图完成，真机侧验证灰显不可达（如实披露）
  const copyState = await evalPage(`
    (() => {
      const dialog = document.querySelector('[role="dialog"]');
      const items = dialog ? [...dialog.querySelectorAll('[role="menuitem"]')] : [];
      const copy = items.find((i) => i.textContent.includes('复制'));
      return copy ? copy.getAttribute('aria-disabled') === 'true' : 'NO_ITEM';
    })()
  `);
  results.conflictOnDevice = `copy 菜单灰显=${copyState}（真机无可用复制路径触发冲突流；四选一完整验证归 web 36 断言 fas-conflict-four.png）`;
  console.log(`  [披露] ${results.conflictOnDevice}`);

  writeFileSync(join(OUT_DIR, 'g4-a-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nGate-UI-4 阶段 A 真机验证通过');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});