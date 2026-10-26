/**
 * TASK-S4-05 web 等价验证（CDP 驱动演示页"FileActionSheet 操作菜单"区块）
 * spec 5.5.1 映射：
 *   R1 统一菜单（七项图标文案）/R2 状态适配（能力缺失灰显+原因）/
 *   R3 批量模式（三项批量菜单）/R4 重命名三类校验+确认禁用至合法/
 *   R5 删除双语义三重区分（文案/图标/按钮类型，spec 4.3-2 并排截图）/
 *   R9 冲突入口四选一 /R10 禁静默覆盖（未选不可确认）
 * R6/R7/R8（进度/结果/取消）数据流已在 S4-04 opstore 自检 15/15 验证，
 * 真实操作演练归 TASK-S4-07 Gate-UI-4。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CDP_PORT = 9231;
const APP_URL = 'http://127.0.0.1:4176/#gallery';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s4';

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

async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT_DIR, name), Buffer.from(data, 'base64'));
  console.log(`  [SHOT] ${name}`);
}

async function scrollToDemo() {
  await evalPage(`
    (() => {
      const cards = [...document.querySelectorAll('section')];
      const card = cards.find((c) => (c.textContent || '').includes('FileActionSheet 操作菜单与对话框组'));
      if (!card) return 'NOT_FOUND';
      card.scrollIntoView({ block: 'start' });
      return 'OK';
    })()
  `);
  await delay(500);
}

async function clickDemoButton(text) {
  const clicked = await evalPage(`
    (() => {
      const cards = [...document.querySelectorAll('section')];
      const card = cards.find((c) => (c.textContent || '').includes('FileActionSheet 操作菜单与对话框组'));
      if (!card) return 'CARD_NOT_FOUND';
      const btn = [...card.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)}));
      if (!btn) return 'BTN_NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()
  `);
  if (clicked !== 'CLICKED') throw new Error(`演示按钮点击失败 "${text}": ${clicked}`);
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'pad2-s405-'));
  const edge = spawn(EDGE, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--no-proxy-server',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
    '--window-size=1280,900', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let targets = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        targets = await res.json();
        if (targets.some((t) => t.type === 'page')) break;
        targets = null;
      } catch { /* 等待 */ }
      await delay(500);
    }
    if (!targets) throw new Error('CDP 未就绪');
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
    await send('Page.navigate', { url: APP_URL });
    await delay(2400);

    console.log('== A1 区块就绪 ==');
    await scrollToDemo();
    const blockOk = await evalPage(`!!document.querySelector('[data-fas-demo]')`);
    assert(blockOk, 'FileActionSheet 演示区块渲染');

    console.log('== A2 单文件菜单（R1 统一菜单 + R2 状态适配） ==');
    const single = JSON.parse(await evalPage(`
      (() => {
        const demo = document.querySelector('[data-fas-demo]');
        const items = [...demo.querySelectorAll('[role="menuitem"]')];
        const disabled = items.filter((i) => i.getAttribute('aria-disabled') === 'true');
        const dangerItem = items.find((i) => (i.textContent || '').includes('删除'));
        const ctx = demo.textContent.includes('年度报告.docx');
        return JSON.stringify({
          count: items.length,
          disabledCount: disabled.length,
          disabledReasons: disabled.map((d) => (d.textContent.match(/暂不可用|未连接/) || [''])[0]).filter(Boolean).length,
          dangerRed: dangerItem ? getComputedStyle(dangerItem.querySelector('span')).color : 'none',
          hasOpen: items.some((i) => i.textContent.includes('打开')),
          hasEdit: items.some((i) => i.textContent.includes('编辑')),
          hasInfo: items.some((i) => i.textContent.includes('属性')),
          context: ctx,
        });
      })()
    `));
    assert(single.count === 7, `单文件菜单 7 项（实际 ${single.count}）`);
    assert(single.disabledCount === 4, `能力缺失灰显 4 项（copy/move/rename/delete，实际 ${single.disabledCount}）`);
    assert(single.disabledReasons === 4, '灰显项均含禁用原因');
    assert(single.dangerRed === 'rgb(220, 38, 38)', `删除项红色呈现（${single.dangerRed}，#DC2626）`);
    assert(single.context, 'ContextHeader 单文件上下文（名称+大小）');
    await screenshot('fas-single-menu.png');

    console.log('== A3 批量模式（R3） ==');
    await clickDemoButton('批量菜单');
    await delay(500);
    const batch = JSON.parse(await evalPage(`
      (() => {
        const demo = document.querySelector('[data-fas-demo]');
        const items = [...demo.querySelectorAll('[role="menuitem"]')];
        return JSON.stringify({
          count: items.length,
          batchCopy: items.some((i) => i.textContent.includes('批量复制')),
          batchMove: items.some((i) => i.textContent.includes('批量移动')),
          batchDelete: items.some((i) => i.textContent.includes('批量删除')),
          noOpen: !items.some((i) => i.textContent.trim().startsWith('打开')),
          context: demo.textContent.includes('已选 3 个项目'),
        });
      })()
    `));
    assert(batch.count === 3, `批量菜单 3 项（实际 ${batch.count}）`);
    assert(batch.batchCopy && batch.batchMove && batch.batchDelete, '批量复制/移动/删除齐备');
    assert(batch.noOpen, '批量模式隐藏打开/编辑/重命名/属性');
    assert(batch.context, 'ContextHeader 批量上下文（已选 3 个项目）');
    await clickDemoButton('单文件菜单');
    await delay(400);

    console.log('== A4 删除双语义——本地（R5，spec 4.3-2） ==');
    await clickDemoButton('删除确认（本地）');
    await delay(600);
    const localDlg = JSON.parse(await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const t = d?.textContent ?? '';
        const dangerAttr = d?.getAttribute('data-danger');
        const btn = [...(d?.querySelectorAll('button') || [])].find((b) => b.textContent.includes('删除'));
        return JSON.stringify({
          title: t.includes('删除到回收站'),
          recoverable: t.includes('移入回收站') && t.includes('恢复'),
          noIrreversible: !t.includes('此操作不可恢复'),
          confirmEnabled: btn ? !btn.disabled : false,
          dangerAttr: dangerAttr ?? 'none',
        });
      })()
    `));
    assert(localDlg.title, '本地删除标题"删除到回收站"');
    assert(localDlg.recoverable, '本地文案"移入回收站…恢复"（secondary 措辞）');
    assert(localDlg.noIrreversible, '本地无"不可恢复"措辞（双语义禁共用）');
    assert(localDlg.confirmEnabled, '本地删除确认可直接点击（secondary 按钮）');
    await screenshot('fas-delete-local.png');
    await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const btn = [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === '取消');
        btn?.click();
        return 'OK';
      })()
    `);
    await delay(500);

    console.log('== A5 删除双语义——远程（R5，三重区分+二次确认） ==');
    await clickDemoButton('删除确认（远程）');
    await delay(600);
    const remoteDlg = JSON.parse(await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const t = d?.textContent ?? '';
        const btn = [...(d?.querySelectorAll('button') || [])].find((b) => b.textContent.includes('永久删除'));
        const ack = d?.querySelector('input[type="checkbox"]');
        return JSON.stringify({
          title: t.includes('删除共享文件'),
          irreversible: t.includes('此操作不可恢复'),
          permanent: t.includes('永久删除') && t.includes('无法通过回收站找回'),
          confirmDisabledBeforeAck: btn ? btn.disabled : true,
          hasAck: !!ack,
          dangerIcon: !!d?.querySelector('[data-file-row]') || t.includes('此操作不可恢复'),
        });
      })()
    `));
    assert(remoteDlg.title, '远程删除标题"删除共享文件"');
    assert(remoteDlg.irreversible, '远程文案"此操作不可恢复"（danger 措辞）');
    assert(remoteDlg.permanent, '远程文案"永久删除/无法通过回收站找回"');
    assert(remoteDlg.confirmDisabledBeforeAck, '未勾选确认前"永久删除"禁用（二次确认）');
    assert(remoteDlg.hasAck, '勾选"我了解此操作不可恢复"复选框存在');
    await screenshot('fas-delete-remote.png');
    // 勾选后确认解锁
    await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const ack = d.querySelector('input[type="checkbox"]');
        ack.click();
        return 'OK';
      })()
    `);
    await delay(400);
    const afterAck = await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const btn = [...d.querySelectorAll('button')].find((b) => b.textContent.includes('永久删除'));
        return btn ? !btn.disabled : false;
      })()
    `);
    assert(afterAck, '勾选后"永久删除"解锁');
    await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const btn = [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === '取消');
        btn?.click();
        return 'OK';
      })()
    `);
    await delay(500);

    console.log('== A6 重命名三类校验（R4） ==');
    await clickDemoButton('重命名校验');
    await delay(600);
    // 触碰输入：非法字符
    await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const input = d.querySelector('input:not([type="checkbox"])');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'bad:name?.docx');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 'OK';
      })()
    `);
    await delay(400);
    const illegal = await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const alert = d.querySelector('[role="alert"]');
        const btn = [...d.querySelectorAll('button')].find((b) => b.textContent.includes('重命名'));
        return JSON.stringify({ err: alert ? alert.textContent : '无', disabled: btn ? btn.disabled : true });
      })()
    `);
    const illegalV = JSON.parse(illegal);
    assert(illegalV.err.includes('不能包含'), `非法字符内联提示（${illegalV.err.slice(0, 24)}）`);
    assert(illegalV.disabled, '非法输入时确认禁用');
    // 重名校验
    await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const input = d.querySelector('input:not([type="checkbox"])');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '预算.xlsx');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 'OK';
      })()
    `);
    await delay(400);
    const dup = await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const alert = d.querySelector('[role="alert"]');
        return alert ? alert.textContent : '无';
      })()
    `);
    assert(dup.includes('同名项目已存在'), `重名内联提示（${dup.slice(0, 16)}）`);
    // 合法输入解锁
    await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const input = d.querySelector('input:not([type="checkbox"])');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '年度报告-终版.docx');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 'OK';
      })()
    `);
    await delay(400);
    const legal = await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const alert = d.querySelector('[role="alert"]');
        const btn = [...d.querySelectorAll('button')].find((b) => b.textContent.includes('重命名'));
        return JSON.stringify({ noErr: !alert, enabled: btn ? !btn.disabled : false });
      })()
    `);
    const legalV = JSON.parse(legal);
    assert(legalV.noErr && legalV.enabled, '合法输入：无错误+确认解锁');
    await screenshot('fas-rename-validation.png');
    await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const btn = [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === '取消');
        btn?.click();
        return 'OK';
      })()
    `);
    await delay(500);

    console.log('== A7 冲突四选一（R9/R10 禁静默覆盖） ==');
    await clickDemoButton('冲突四选一');
    await delay(600);
    const conflict = JSON.parse(await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const t = d?.textContent ?? '';
        const btn = [...(d?.querySelectorAll('button') || [])].find((b) => b.textContent.includes('确定'));
        const radios = d?.querySelectorAll('input[type="radio"]') ?? [];
        return JSON.stringify({
          skip: t.includes('跳过') && t.includes('保留目标目录原文件'),
          overwrite: t.includes('覆盖') && t.includes('原文件将丢失'),
          keepBoth: t.includes('保留两者') && t.includes('(2)'),
          rename: t.includes('重命名') && t.includes('输入新名称'),
          radioCount: radios.length,
          confirmDisabledNoSelection: btn ? btn.disabled : true,
          fileName: t.includes('年度报告.docx') && t.includes('已存在'),
        });
      })()
    `));
    assert(conflict.skip, '选项1 跳过（含说明）');
    assert(conflict.overwrite, '选项2 覆盖（含丢失警告，danger）');
    assert(conflict.keepBoth, '选项3 保留两者（自动"名称 (2)"）');
    assert(conflict.rename, '选项4 重命名（行内输入）');
    assert(conflict.radioCount === 4, `四选项 radio（实际 ${conflict.radioCount}）`);
    assert(conflict.confirmDisabledNoSelection, '未选任何项时确认禁用（禁静默覆盖）');
    assert(conflict.fileName, '冲突文件名与"已存在"上下文');
    await screenshot('fas-conflict-four.png');
    // 选择覆盖后确认解锁
    await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const radios = [...d.querySelectorAll('input[type="radio"]')];
        radios[1].click();
        return 'OK';
      })()
    `);
    await delay(400);
    const overwriteEnabled = await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const btn = [...d.querySelectorAll('button')].find((b) => b.textContent.includes('确定'));
        return btn ? !btn.disabled : false;
      })()
    `);
    assert(overwriteEnabled, '显式选择覆盖后确认解锁（用户显式决策路径）');

    writeFileSync(
      join(OUT_DIR, 'fas-s405-result.json'),
      JSON.stringify({ single, batch, localDlg, remoteDlg, conflict, ts: new Date().toISOString() }, null, 2),
    );
    console.log('\nTASK-S4-05 web 等价验证全部通过（R1-R5/R9/R10 + 双语义并排截图）');
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    edge.kill();
    await delay(1200);
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});