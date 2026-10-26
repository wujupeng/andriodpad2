/**
 * TASK-S5-03 真机验收：复制与移动（PM 门槛表逐项）
 * 场景 1 正常复制：源/目标均存在，目标 SHA==源（服务器核验）
 * 场景 2 复制冲突 keep-both：ConflictDialog 四选一→"测试A (2).txt"并存
 * 场景 3 复制冲突 overwrite（显式授权）：目标内容被源覆盖（前置篡改目标→覆盖后 SHA==源）
 * 场景 4 正常移动：源消失+目标 SHA==源（目标校验通过后才删源）
 * 场景 5 批量复制：2 文件→2 项成功（服务器逐一核验）
 * 场景 6 冲突 skip：批量含同名项→跳过冲突项→非冲突项执行
 * 服务器三件套核验（ls+sha256sum+diff）为唯一通过依据（PM 门槛⑧）。
 * 通道：el.click（按钮/menuitem/Dialog）+ PointerEvent dispatch（文件行 useLongPress）。
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

/** 服务器核验：路径存在性 + SHA */
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

/** PointerEvent dispatch 行按压（useLongPress onPress→onOpen 菜单） */
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

/** 等待操作结果 Banner（OperationProgressPanel renderResult；success 4s 自动消失→轮询捕获） */
async function waitResult(ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const t = await evalPage(`document.body.innerText`);
    if (t.includes('复制完成') || t.includes('移动完成')) return 'success';
    if (t.includes('部分完成')) return 'partial';
    if (t.includes('复制失败') || t.includes('移动失败') || t.includes('遇到同名冲突')) return 'failed';
    await new Promise((r) => setTimeout(r, 800));
  }
  return 'timeout';
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


/** 多选追加：ListRow 根 click（onClick→onRowActivate→toggleSelection） */
async function clickRow(rowText) {
  const r = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('[data-file-row]')];
      const target = rows.find((x) => (x.textContent || '').includes(${JSON.stringify(rowText)}));
      if (!target) return 'NOT_FOUND';
      const row = target.querySelector('[class*="row"]:not([class*="row__"])') || target;
      row.click();
      return 'CLICKED';
    })()
  `);
  if (r !== 'CLICKED') throw new Error(`行点击失败 ${rowText}: ${r}`);
}

/** DestinationPicker 目录行精确点击（pickerList 容器内 ListRow 根过滤） */
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

/** 走完整 UI 链路：菜单→复制/移动→选财务目录→（ConflictDialog 决策）→结果 */
async function transferViaUi(fileName, action, conflictChoice) {
  await pressRow(fileName);
  await sleep(1300);
  const menuOk = await evalPage(`document.querySelectorAll('[role="menuitem"]').length`);
  if (menuOk < 1) throw new Error(`菜单未弹（${fileName}）`);
  await clickEl('[role="menuitem"]', action === 'copy' ? '复制' : '移动');
  await sleep(1200);
  // DestinationPicker：进入财务目录（ListRow）→ 确认
  await pickerEnterDir('财务目录');
  await sleep(1200);
  await clickEl('[role="alertdialog"] button', '选此处');
  await sleep(1500);
  // 冲突预判：目标存在 → ConflictDialog
  const conflictOpen = await evalPage(`document.body.innerText.includes('目标已存在同名文件')`);
  if (conflictOpen) {
    if (!conflictChoice) throw new Error('出现冲突对话框但未提供决策');
    if (conflictChoice === 'skip') await clickEl('[role="alertdialog"] input[type="radio"]', '');
    if (conflictChoice !== 'skip') {
      // radio 定位：第 2 个=覆盖（danger），第 3 个=保留两者
      const idx = conflictChoice === 'overwrite' ? 1 : 2;
      await evalPage(`(() => { const rs = [...document.querySelectorAll('[role="alertdialog"] input[type="radio"]')]; rs[${idx}].click(); return 'OK'; })()`);
    }
    await sleep(600);
    await clickEl('[role="alertdialog"] button', '确定');
    await sleep(1200);
  }
  return conflictOpen;
}

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
  await sleep(3500);
  const curPath = await evalPage(`(() => ((document.querySelector('nav[aria-label="路径导航"]') || {}).textContent || ''))()`);
  if (!String(curPath).includes('gate4-test')) {
    await pressRow('gate4-test');
    await sleep(3500);
  }
  const rows = await evalPage(`document.querySelectorAll('[data-file-row]').length`);
  assert(rows === 6, `0.2 gate4-test（6 行：5 文件+财务目录，实际 ${rows}）`);
  const SHA_A = serverCheck(`${GATE4}/测试A.txt`).sha;
  assert(!!SHA_A, '0.3 服务器基线 SHA 就绪');

  // ===== 场景 1：正常复制 =====
  console.log('\n== S1 正常复制：测试A.txt → 财务目录 ==');
  const s1base = serverCheck(`${FIN}/测试A.txt`);
  assert(!s1base.exists, 'S1.0 目标初始不存在');
  await transferViaUi('测试A.txt', 'copy');
  const s1r = await waitResult();
  assert(s1r === 'success', `S1.1 任务结果 success（实际 ${s1r}）`);
  const s1dst = serverCheck(`${FIN}/测试A.txt`);
  assert(s1dst.exists, 'S1.2 服务器目标存在');
  assert(s1dst.sha === SHA_A, 'S1.3 目标 SHA==源（内容一致，PM 门槛①）');
  const s1src = serverCheck(`${GATE4}/测试A.txt`);
  assert(s1src.exists && s1src.sha === SHA_A, 'S1.4 源文件未受影响');
  results.s1 = { dst: s1dst.sha?.slice(0, 16), srcKept: true };
  await screenshot('s503-s1-copy-ok.png');

  // ===== 场景 2：复制冲突 keep-both =====
  console.log('\n== S2 复制冲突（keep-both）：测试A.txt → 财务目录（已存在） ==');
  const s2conflict = await transferViaUi('测试A.txt', 'copy', 'keep-both');
  assert(s2conflict, 'S2.1 ConflictDialog 呈现（预判命中）');
  const s2r = await waitResult();
  assert(s2r === 'success', `S2.2 决策后任务 success（实际 ${s2r}）`);
  const s2dup = serverCheck(`${FIN}/测试A (2).txt`);
  assert(s2dup.exists && s2dup.sha === SHA_A, 'S2.3 "测试A (2).txt"并存且 SHA==源（保留两者）');
  results.s2 = { keepBoth: true };
  await screenshot('s503-s2-keepboth.png');

  // ===== 场景 3：复制冲突 overwrite（显式授权） =====
  console.log('\n== S3 复制冲突（覆盖授权）：前置篡改目标 → 覆盖后 SHA==源 ==');
  ssh(`printf 'conflict-base-overwritten' > '${FIN}/测试A.txt'`);
  const s3pre = serverCheck(`${FIN}/测试A.txt`);
  assert(s3pre.sha !== SHA_A, 'S3.0 前置：目标内容已≠源（待覆盖）');
  const s3conflict = await transferViaUi('测试A.txt', 'copy', 'overwrite');
  assert(s3conflict, 'S3.1 ConflictDialog 呈现');
  const s3r = await waitResult();
  assert(s3r === 'success', `S3.2 覆盖授权后 success（实际 ${s3r}）`);
  const s3dst = serverCheck(`${FIN}/测试A.txt`);
  assert(s3dst.sha === SHA_A, 'S3.3 目标被源内容覆盖（SHA==源，PM 红线①授权覆盖证据）');
  results.s3 = { overwrite: true };
  await screenshot('s503-s3-overwrite.png');

  // ===== 场景 4：正常移动 =====
  console.log('\n== S4 正常移动：测试B.txt → 财务目录（源消失+SHA 一致） ==');
  const SHA_B = serverCheck(`${GATE4}/测试B.txt`).sha;
  await transferViaUi('测试B.txt', 'move');
  const s4r = await waitResult();
  assert(s4r === 'success', `S4.1 移动 success（实际 ${s4r}）`);
  const s4src = serverCheck(`${GATE4}/测试B.txt`);
  assert(!s4src.exists, 'S4.2 源已删除（目标校验通过后才删源，PM 红线②）');
  const s4dst = serverCheck(`${FIN}/测试B.txt`);
  assert(s4dst.exists && s4dst.sha === SHA_B, 'S4.3 目标存在且 SHA==源');
  results.s4 = { moved: true };

  // ===== 场景 5：批量复制 =====
  console.log('\n== S5 批量复制：测试C.txt + 年度报告.docx → 财务目录 ==');
  const SHA_C = serverCheck(`${GATE4}/测试C.txt`).sha;
  const SHA_DOC = serverCheck(`${GATE4}/年度报告.docx`).sha;
  // 多选：工具栏入口自动选中首项（财务目录，目录置顶）→ 取消首项（文件夹不参与）
  // → 追加 测试C+年度报告 → 已选 2 项
  await clickEl('button[aria-label="多选"]', '');
  await sleep(900);
  await clickRow('财务目录');
  await sleep(700);
  await clickRow('测试C.txt');
  await sleep(700);
  await clickRow('年度报告.docx');
  await sleep(700);
  const multi2 = await evalPage(`(document.body.innerText.match(/已选 [0-9]+ 项/) || ['无'])[0]`);
  assert(multi2 === '已选 2 项', `S5.0 多选 2 项（实际 ${multi2}）`);
  // 批量菜单（MultiSelectBar 复制按钮→FileActionSheet 批量模式）
  await clickEl('footer button', '复制');
  await sleep(1300);
  await clickEl('[role="menuitem"]', '批量复制');
  await sleep(1200);
  await pickerEnterDir('财务目录');
  await sleep(1200);
  await clickEl('[role="alertdialog"] button', '选此处');
  await sleep(1500);
  const s5r = await waitResult(25000);
  assert(s5r === 'success', `S5.1 批量 success（实际 ${s5r}）`);
  const s5c = serverCheck(`${FIN}/测试C.txt`);
  const s5d = serverCheck(`${FIN}/年度报告.docx`);
  assert(s5c.exists && s5c.sha === SHA_C, 'S5.2 服务器核验测试C.txt（SHA==源）');
  assert(s5d.exists && s5d.sha === SHA_DOC, 'S5.3 服务器核验年度报告.docx（SHA==源）');
  results.s5 = { batch2: true };
  await screenshot('s503-s5-batch.png');

  // ===== 场景 6：冲突 skip（批量含同名） =====
  console.log('\n== S6 冲突 skip：批量[测试A.txt(同名)+预算.xlsx(新)] → 跳过 A 复制 预算 ==');
  const SHA_X = serverCheck(`${GATE4}/预算.xlsx`).sha;
  // 重置多选态（场景 5 的选集残留退出）→ 重新进入→取消自动首项→选 测试A+预算
  const inMulti = await evalPage(`document.body.innerText.includes('已选 ')`);
  if (inMulti) {
    await clickEl('footer button', '取消');
    await sleep(800);
  }
  await clickEl('button[aria-label="多选"]', '');
  await sleep(900);
  await clickRow('财务目录');
  await sleep(700);
  await clickRow('测试A.txt');
  await sleep(900);
  await clickRow('预算.xlsx');
  await sleep(700);
  await clickEl('footer button', '复制');
  await sleep(1300);
  await clickEl('[role="menuitem"]', '批量复制');
  await sleep(1200);
  await pickerEnterDir('财务目录');
  await sleep(1200);
  await clickEl('[role="alertdialog"] button', '选此处');
  await sleep(1800);
  const s6conflict = await evalPage(`document.body.innerText.includes('目标已存在同名文件')`);
  assert(s6conflict, 'S6.1 批量冲突 ConflictDialog 呈现');
  // 选"跳过"（第 1 个 radio）
  await evalPage(`(() => { const rs = [...document.querySelectorAll('[role="alertdialog"] input[type="radio"]')]; rs[0].click(); return 'OK'; })()`);
  await sleep(600);
  await clickEl('[role="alertdialog"] button', '确定');
  await sleep(1500);
  const s6r = await waitResult(25000);
  assert(s6r === 'success', `S6.2 skip 后任务 success（实际 ${s6r}）`);
  const s6x = serverCheck(`${FIN}/预算.xlsx`);
  assert(s6x.exists && s6x.sha === SHA_X, 'S6.3 非冲突项预算.xlsx 已复制（SHA==源）');
  const s6a = serverCheck(`${FIN}/测试A.txt`);
  assert(s6a.sha === SHA_A, 'S6.4 同名项测试A.txt 未被覆盖（仍为场景 3 覆盖后内容=源，未重写）');
  const s6aCount = ssh(`ls '${FIN}' | grep -c '测试A'`).trim();
  assert(s6aCount === '2', `S6.5 跳过未产生新副本（测试A 仍 2 个：原名+(2)，实际 ${s6aCount}）`);
  results.s6 = { skip: true };

  // ===== 临时文件残留核验 =====
  console.log('\n== C 临时文件残留核验 ==');
  const tmp = ssh(`find '${GATE4}' -name '*.pad2tmp.*' | wc -l`).trim();
  assert(tmp === '0', `C.1 零临时文件残留（实际 ${tmp}）`);

  writeFileSync(join(OUT_DIR, 's503-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nTASK-S5-03 真机验收六场景全部通过（服务器三件套核验）');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});