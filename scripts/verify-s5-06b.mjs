/**
 * TASK-S5-06-B 真机验收（PM 授权第 4 条五场景 + 误合并变体）
 * P0 环境准备：UI 路径清理存量重复卡（保留一张——用户真实操作，非代码隐藏）
 * B1 新建配置（新 host）：卡数 +1 + 内容正确
 * B2 同身份保存（同 host/share/username/domain，不同 name）：不新增，既有卡更新
 * B3 编辑已有配置（⋮→编辑→改名）：不新增
 * B4 连续保存（同身份连保存两次）：仍 1 张
 * B5 页面重进+冷启动：卡片数量与配置内容不变（Preferences 持久化核验）
 * B6 不误合并：不同 host / 不同 share / 不同 username → 各自独立卡
 * 断言依据：UI 卡片数 + Preferences JSON（身份四元组唯一性）双通道
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/Android/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s5';
const TMP = 'C:/Users/DELL/AppData/Local/Temp/s506b-prefs.xml';

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 90000 });
}

/** 读持久化 profiles（Preferences XML 解析） */
function readPersisted() {
  execFileSync(ADB, ['-s', DEVICE, 'shell', 'run-as com.pad2.filemanager cat shared_prefs/CapacitorStorage.xml'], { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
  const out = execFileSync(ADB, ['-s', DEVICE, 'shell', 'run-as com.pad2.filemanager cat shared_prefs/CapacitorStorage.xml'], { encoding: 'utf8' });
  const m = out.match(/pad2\.profiles\.v1">([^<]*)</);
  if (!m) return [];
  const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  try {
    return JSON.parse(decoded).profiles || [];
  } catch {
    return [];
  }
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

/** UI 卡片数（连接页列表区 ListRow 根） */
async function uiCardCount() {
  return await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('main div')].filter(
        (e) => String(e.className).includes('row') && !String(e.className).includes('row__'),
      );
      return rows.length;
    })()
  `);
}

/** 表单填字段 */
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
  if (ok !== 'SET') throw new Error(`字段输入失败 "${label}"`);
}

/** 表单保存（保存并连接——连接结果不影响 save 已完成；等待 save 落盘） */
async function formSave({ name, host, share, username, password, remember = true }) {
  await setFieldByLabel('连接名称', name);
  await setFieldByLabel('服务器地址', host);
  await setFieldByLabel('共享名', share);
  await setFieldByLabel('用户名', username);
  await setFieldByLabel('密码', password);
  if (remember) {
    await evalPage(`(() => { const cb = document.querySelector('input[type="checkbox"]'); if (cb && !cb.checked) cb.click(); return 'OK'; })()`);
  }
  await sleep(400);
  await clickEl('main button', '保存并连接');
  await sleep(3500); // save 落盘 + 连接发起/失败窗口
}

/** 回到空表单（新建模式）：刷新连接页（导航切换触发重挂载 → key='new' 空表单） */
async function resetFormToNew() {
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1000);
  await clickEl('nav button', '添加连接');
  await sleep(1400);
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = {};
  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();

  console.log('== P0 环境准备：清理存量重复卡（UI 删除路径） ==');
  await clickEl('nav button', '添加连接');
  await sleep(1500);
  let persisted = readPersisted();
  const dupCount = persisted.length - new Set(persisted.map((p) => `${p.host}|${p.share}|${p.username}|${p.domain ?? ''}`)).size;
  console.log(`  [STAT] 存量 profiles=${persisted.length} 张（身份重复 ${dupCount}——历轮 fallback 表单路径累积，缺陷危害实证）`);
  results.stockDuplicate = { count: persisted.length, dupCount };
  // UI 删除循环（⋮→删除→确认删除（连接配置确认框：取消/删除，无勾选））至剩 1 张
  while (persisted.length > 1) {
    const menuOk = await evalPage(`
      (() => {
        const rows = [...document.querySelectorAll('main div')].filter(
          (e) => String(e.className).includes('row') && !String(e.className).includes('row__'),
        );
        const btn = rows[1]?.querySelector('button[aria-label^="更多操作"]');
        if (!btn) return 'NOT_FOUND';
        btn.click();
        return 'CLICKED';
      })()
    `);
    if (menuOk !== 'CLICKED') throw new Error('存量清理：菜单按钮未找到');
    await sleep(900);
    // 菜单"删除"项（ProfilesListPanel 菜单用 ListRow——无 menuitem role，按 row 根+文本定位）
    const delMenu = await evalPage(`
      (() => {
        const rows = [...document.querySelectorAll('[role="dialog"] div')].filter(
          (e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('删除'),
        );
        if (!rows.length) return 'NOT_FOUND';
        rows[0].click();
        return 'CLICKED';
      })()
    `);
    if (delMenu !== 'CLICKED') throw new Error('存量清理：删除菜单项未找到');
    await sleep(1100);
    await sleep(500);
    await clickEl('[role="alertdialog"] button', '删除');
    await sleep(2200);
    persisted = readPersisted();
  }
  assert(persisted.length === 1 && persisted[0].name === 'Gate3验证服务器', `P0.1 存量清理完成（剩 ${persisted.length} 张）`);
  await screenshot('s506b-p0-cleaned.png');
  const BASE_COUNT = 1;

  // ===== B1 新建配置（新 host） =====
  console.log('\n== B1 新建配置（新 host 192.168.2.99） ==');
  await resetFormToNew();
  await formSave({ name: 'B1新服务器', host: '192.168.2.99', share: 'share', username: 'user1', password: 'pw-b1' });
  persisted = readPersisted();
  assert(persisted.length === BASE_COUNT + 1, `B1.1 卡片数 +1（实际 ${persisted.length}）`);
  const b1 = persisted.find((p) => p.host === '192.168.2.99');
  assert(!!b1 && b1.name === 'B1新服务器' && b1.share === 'share' && b1.username === 'user1', 'B1.2 配置内容正确');
  assert(!!b1.passwordEncrypted, 'B1.3 密文已落盘');
  results.B1 = { count: persisted.length };

  // ===== B2 同身份保存（不同 name） =====
  console.log('\n== B2 同身份保存（同 host/share/username/domain，name=B1改名版） ==');
  await resetFormToNew();
  await formSave({ name: 'B1改名版（同配置）', host: '192.168.2.99', share: 'share', username: 'user1', password: 'pw-b2' });
  persisted = readPersisted();
  assert(persisted.length === BASE_COUNT + 1, `B2.1 不新增卡（仍 ${persisted.length} 张——upsert 更新）`);
  const b2 = persisted.find((p) => p.host === '192.168.2.99');
  assert(b2.name === 'B1改名版（同配置）', 'B2.2 既有卡 name 被更新（同身份改名）');
  assert(b2.id === b1.id, 'B2.3 复用既有条目 id（同一配置，非新建）');
  await screenshot('s506b-b2-upsert.png');
  results.B2 = { upsert: true };

  // ===== B4 连续保存（同身份两次连保存） =====
  console.log('\n== B4 连续保存两次（同身份） ==');
  await resetFormToNew();
  await formSave({ name: 'B1改名版（同配置）', host: '192.168.2.99', share: 'share', username: 'user1', password: 'pw-b4a' });
  await sleep(1500);
  await resetFormToNew();
  await formSave({ name: 'B1改名版（同配置）', host: '192.168.2.99', share: 'share', username: 'user1', password: 'pw-b4b' });
  persisted = readPersisted();
  assert(persisted.length === BASE_COUNT + 1, `B4.1 连续保存仍 1 张（实际 ${persisted.length}）`);
  results.B4 = { count: persisted.length };

  // ===== B6 不误合并（三个身份变体） =====
  console.log('\n== B6 不误合并：不同 host / 不同 share / 不同 username ==');
  await resetFormToNew();
  await formSave({ name: 'B6不同共享', host: '192.168.2.99', share: 'data', username: 'user1', password: 'pw' });
  await sleep(1500);
  await resetFormToNew();
  await formSave({ name: 'B6不同账户', host: '192.168.2.99', share: 'share', username: 'user2', password: 'pw' });
  persisted = readPersisted();
  assert(persisted.length === BASE_COUNT + 3, `B6.1 三个变体各自独立成卡（${persisted.length} 张）`);
  const identities = persisted.map((p) => `${p.host}|${p.share}|${p.username}`);
  assert(new Set(identities).size === persisted.length, 'B6.2 身份四元组全部唯一（零误合并）');
  await screenshot('s506b-b6-variants.png');
  results.B6 = { count: persisted.length, allUnique: true };

  // ===== B3 编辑已有配置（⋮→编辑→改名→保存） =====
  console.log('\n== B3 编辑已有配置 ==');
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1000);
  await clickEl('nav button', '添加连接');
  await sleep(1500);
  // 对第一张卡（Gate3）开菜单→编辑
  const editOk = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('main div')].filter(
        (e) => String(e.className).includes('row') && !String(e.className).includes('row__'),
      );
      const btn = rows[0]?.querySelector('button[aria-label^="更多操作"]');
      if (!btn) return 'NOT_FOUND';
      btn.click();
      return 'CLICKED';
    })()
  `);
  if (editOk !== 'CLICKED') throw new Error('B3 菜单未找到');
  await sleep(900);
  // 菜单"编辑"项（ListRow 无 menuitem role——按 row 根+文本定位）
  const editMenu = await evalPage(`
    (() => {
      const rows = [...document.querySelectorAll('[role="dialog"] div')].filter(
        (e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('编辑'),
      );
      if (!rows.length) return 'NOT_FOUND';
      rows[0].click();
      return 'CLICKED';
    })()
  `);
  if (editMenu !== 'CLICKED') throw new Error('B3 编辑菜单项未找到');
  await sleep(1400);
  // 表单预填（编辑模式）——改 name
  await setFieldByLabel('连接名称', 'Gate3编辑后');
  await setFieldByLabel('密码', process.env.SMB_PW || 'Gate3-Test-2026');
  await clickEl('main button', '保存并连接');
  await sleep(16000); // 真实连接（Gate3 会成功）
  persisted = readPersisted();
  assert(persisted.length === BASE_COUNT + 3, `B3.1 编辑不新增（仍 ${persisted.length} 张）`);
  const b3 = persisted.find((p) => p.username === 'pad2gate3');
  assert(b3.name === 'Gate3编辑后', 'B3.2 既有卡内容被更新（编辑生效）');
  await screenshot('s506b-b3-edited.png');
  results.B3 = { count: persisted.length };

  // ===== B5 页面重进 + 冷启动 =====
  console.log('\n== B5 页面重进+冷启动持久化核验 ==');
  const beforeCount = persisted.length;
  const beforeSnapshot = persisted.map((p) => `${p.id}|${p.name}|${p.host}|${p.share}|${p.username}`).sort().join(';');
  // 页面重进
  await evalPage(`(() => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === '工作台'); b?.click(); return 'OK'; })()`);
  await sleep(1200);
  await clickEl('nav button', '添加连接');
  await sleep(1600);
  let uiCount = await uiCardCount();
  assert(uiCount === beforeCount, `B5.1 页面重进后 UI 卡片数不变（${uiCount}）`);
  // 冷启动
  adbShell('am force-stop com.pad2.filemanager');
  await sleep(1500);
  adbShell('am start -n com.pad2.filemanager/.MainActivity');
  await sleep(8000);
  await connectWs();
  await clickEl('nav button', '添加连接');
  await sleep(1800);
  uiCount = await uiCardCount();
  assert(uiCount === beforeCount, `B5.2 冷启动后 UI 卡片数不变（${uiCount}）`);
  const afterPersisted = readPersisted();
  const afterSnapshot = afterPersisted.map((p) => `${p.id}|${p.name}|${p.host}|${p.share}|${p.username}`).sort().join(';');
  assert(afterSnapshot === beforeSnapshot, 'B5.3 冷启动后配置内容逐字段一致（id/name/host/share/username）');
  assert(new Set(afterPersisted.map((p) => `${p.host}|${p.share}|${p.username}|${p.domain ?? ''}`)).size === afterPersisted.length, 'B5.4 持久化身份唯一（零重复）');
  await screenshot('s506b-b5-coldstart.png');
  results.B5 = { count: afterPersisted.length, stable: true };

  // ===== 清理 B 场景测试卡（保留 Gate3 编辑后） =====
  console.log('\n== 环境还原：删除测试卡 ==');
  for (let i = 0; i < afterPersisted.length - 1; i += 1) {
    const delOk = await evalPage(`
      (() => {
        const rows = [...document.querySelectorAll('main div')].filter(
          (e) => String(e.className).includes('row') && !String(e.className).includes('row__'),
        );
        const btn = rows[1]?.querySelector('button[aria-label^="更多操作"]');
        if (!btn) return 'NOT_FOUND';
        btn.click();
        return 'CLICKED';
      })()
    `);
    if (delOk !== 'CLICKED') break;
    await sleep(900);
    const delMenu = await evalPage(`
      (() => {
        const rows = [...document.querySelectorAll('[role="dialog"] div')].filter(
          (e) => String(e.className).includes('row') && !String(e.className).includes('row__') && (e.textContent || '').includes('删除'),
        );
        if (!rows.length) return 'NOT_FOUND';
        rows[0].click();
        return 'CLICKED';
       })()
    `);
    await sleep(1000);
    await clickEl('[role="alertdialog"] button', '删除');
    await sleep(2200);
  }
  const finalP = readPersisted();
  console.log(`  [STAT] 还原后剩 ${finalP.length} 张（${finalP.map((p) => p.name).join('/')}）`);
  results.finalState = finalP.map((p) => ({ name: p.name, host: p.host }));

  writeFileSync(join(OUT_DIR, 's506b-result.json'), JSON.stringify({ results, ts: new Date().toISOString() }, null, 2));
  console.log('\nTASK-S5-06-B 真机验收全部通过（B1-B6+P0+还原）');
  adbShell('svc power stayon false');
  ws.close();
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  try { adbShell('svc power stayon false'); } catch {}
  process.exit(1);
});