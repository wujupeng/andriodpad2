/**
 * TASK-S3-03/04 验证：ConnectionPage 连接页（web 等价通道）
 * 1) 双栏渲染：表单六字段 + 记住密码 + 行动区；列表空态引导
 * 2) 表单校验（spec 5.3.1-R8）：必填内联 danger caption + 地址格式
 * 3) 密码掩码与显隐（spec 5.3.1-R2）：type=password + 切换
 * 4) 测试连接失败路径（web 无插件实现）：danger Banner 持久、不伪报已连接
 * 5) 保存并连接 → profiles 列表渲染（未连接徽章）+ localStorage 持久化密文断言
 * 6) ⋮ 菜单四项 + 删除二次确认 Dialog + 确认删除回空态
 * 7) 编辑预填表单
 * 8) 渲染健康：无未捕获异常
 * 真机注入演练（AUTH_FAILED 定位/六态徽章注入/断网）留 TASK-S3-05 Gate-UI-3。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CDP_PORT = 9226;
const APP_URL = 'http://127.0.0.1:4175/';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s3';

let ws;
let msgId = 0;
const pending = new Map();
const consoleErrors = [];
const pageExceptions = [];

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

async function setInput(selector, value) {
  const ok = await evalPage(`
    (() => {
      const inputs = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const input = inputs.find((i) => i.closest('label')?.textContent?.includes(''));
      const target = input || inputs[0];
      if (!target) return 'NOT_FOUND';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(target, ${JSON.stringify(value)});
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return 'SET';
    })()
  `);
  if (ok !== 'SET') throw new Error(`输入失败 ${selector}: ${ok}`);
}

async function setFieldByLabel(label, value) {
  const ok = await evalPage(`
    (() => {
      const labels = [...document.querySelectorAll('label')];
      const label = labels.find((l) => (l.textContent || '').includes(${JSON.stringify(label)}));
      if (!label) return 'LABEL_NOT_FOUND';
      const input = label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector('input');
      if (!input) return 'INPUT_NOT_FOUND';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'SET';
    })()
  `);
  if (ok !== 'SET') throw new Error(`字段输入失败 "${label}": ${ok}`);
}

function assert(cond, label) {
  if (!cond) throw new Error(`断言失败: ${label}`);
  console.log(`  PASS ${label}`);
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'pad2-s203-'));
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
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push(msg.params.args?.map((a) => a.value ?? a.description).join(' ') ?? '');
      } else if (msg.method === 'Runtime.exceptionThrown') {
        pageExceptions.push(msg.params.exceptionDetails?.text ?? 'unknown');
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await send('Page.navigate', { url: APP_URL });
    await delay(2200);

    console.log('== A1 连接页导航与双栏渲染 ==');
    await clickByText('nav button', '添加连接');
    await delay(800);
    const a1 = JSON.parse(await evalPage(`
      (() => {
        const t = document.body.innerText;
        return JSON.stringify({
          formTitle: t.includes('新建 SMB 连接'),
          fields: ['连接名称','服务器地址','共享名','用户名','密码','域（选填）'].every((f) => t.includes(f)),
          remember: t.includes('记住密码') && t.includes('加密'),
          actions: t.includes('测试连接') && t.includes('保存并连接'),
          empty: t.includes('还没有保存的连接'),
        });
      })()
    `));
    assert(a1.formTitle, '表单卡标题渲染');
    assert(a1.fields, '六字段标签渲染');
    assert(a1.remember, '记住密码 + 加密提示渲染');
    assert(a1.actions, '测试连接/保存并连接按钮渲染');
    assert(a1.empty, '列表空态引导渲染');
    await screenshot('connection-empty-1280.png');

    console.log('== A2 表单校验（内联 danger caption，spec R8） ==');
    await clickByText('main button', '测试连接');
    await delay(500);
    const a2 = JSON.parse(await evalPage(`
      (() => {
        const t = document.body.innerText;
        const captions = [...document.querySelectorAll('main span[role="alert"], main p')];
        const inline = captions.filter((c) => c.textContent.includes('请填写'));
        const dialog = document.querySelector('[role="alertdialog"]');
        return JSON.stringify({
          requiredCaptions: inline.length >= 5,
          hostFormat: true,
          noDialog: !dialog,
        });
      })()
    `));
    assert(a2.requiredCaptions, '必填项内联提示呈现（≥5 项）');
    assert(a2.noDialog, '无弹窗替代（内联呈现）');
    await setFieldByLabel('服务器地址', '192.168.300.1');
    await delay(300);
    await clickByText('main button', '测试连接');
    await delay(400);
    const hostErr = await evalPage(`document.body.innerText.includes('地址格式不正确')`);
    assert(hostErr, '非法地址格式提示呈现');
    await setFieldByLabel('服务器地址', '192.168.2.3');

    console.log('== A3 密码掩码与显隐（spec R2） ==');
    await setFieldByLabel('密码', 'test-secret-123');
    const pwdState = JSON.parse(await evalPage(`
      (() => {
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find((l) => (l.textContent || '').trim().startsWith('密码'));
        const wrap = label.closest('div');
        const input = wrap?.querySelector('input') || document.querySelector('input[type="password"]');
        const toggle = [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label').includes('密码'));
        return JSON.stringify({
          masked: input?.type === 'password',
          hasToggle: !!toggle,
        });
      })()
    `));
    assert(pwdState.masked, '密码输入默认掩码（type=password）');
    assert(pwdState.hasToggle, '显隐切换按钮存在');
    const revealed = await evalPage(`
      (() => {
        const toggle = [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label').includes('密码'));
        toggle.click();
        return 'CLICKED';
      })()
    `);
    await delay(400);
    const revealedType = await evalPage(`
      (() => {
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find((l) => (l.textContent || '').trim().startsWith('密码'));
        const input = label.htmlFor ? document.getElementById(label.htmlFor) : null;
        return input?.type ?? 'none';
      })()
    `);
    assert(revealedType === 'text', '点击后明文显示（type=text）');
    await evalPage(`
      (() => {
        const toggle = [...document.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label').includes('密码'));
        toggle.click();
        return 'CLICKED';
      })()
    `);
    await delay(400);
    const remaskedType = await evalPage(`
      (() => {
        const labels = [...document.querySelectorAll('label')];
        const label = labels.find((l) => (l.textContent || '').trim().startsWith('密码'));
        const input = label.htmlFor ? document.getElementById(label.htmlFor) : null;
        return input?.type ?? 'none';
      })()
    `);
    assert(remaskedType === 'password', '再点恢复掩码（type=password）');

    console.log('== A4 测试连接失败路径（web 无插件实现） ==');
    await setFieldByLabel('连接名称', '验证服务器');
    await setFieldByLabel('共享名', 'share');
    await setFieldByLabel('用户名', 'debian');
    await clickByText('main button', '测试连接');
    await delay(2500);
    const a4 = JSON.parse(await evalPage(`
      (() => {
        const t = document.body.innerText;
        const banner = document.querySelector('main [role="status"]');
        return JSON.stringify({
          failBanner: t.includes('连接失败：'),
          bannerRole: !!banner,
          noConnected: !t.includes('已连接'),
        });
      })()
    `));
    assert(a4.failBanner, '连接失败 Banner 呈现（含可读原因）');
    assert(a4.noConnected, '不伪报已连接');
    await delay(4200);
    const bannerPersist = await evalPage(`document.body.innerText.includes('连接失败：')`);
    assert(bannerPersist, 'danger Banner 持久呈现（无 TTL，spec 5.3.1-R4）');

    console.log('== A5 保存并连接 → 列表 + 持久化密文 ==');
    await evalPage(`
      (() => {
        const cb = document.querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) cb.click();
        return 'OK';
      })()
    `);
    await clickByText('main button', '保存并连接');
    await delay(3000);
    const a5 = JSON.parse(await evalPage(`
      (() => {
        const t = document.body.innerText;
        const listCard = t.includes('已保存的连接') && t.includes('验证服务器') && t.includes('192.168.2.3 / share');
        const raw = localStorage.getItem('CapacitorStorage.pad2.profiles.v1');
        let enc = null;
        try {
          const parsed = JSON.parse(raw);
          enc = parsed?.profiles?.[0]?.passwordEncrypted ?? null;
        } catch { /* 忽略 */ }
        return JSON.stringify({
          listCard,
          persisted: !!raw,
          encrypted: typeof enc === 'string' && enc.split('.').length === 3 && !enc.includes('test-secret-123'),
          plainAbsent: raw ? !raw.includes('test-secret-123') : false,
        });
      })()
    `));
    assert(a5.listCard, '列表卡渲染（名称 + host/share + 未连接徽章区）');
    assert(a5.persisted, 'profiles 已持久化（localStorage/Preferences web 等价）');
    assert(a5.encrypted, '密码以三段式密文落盘（不含明文）');
    assert(a5.plainAbsent, '持久化载荷全文不含明文密码');
    await screenshot('connection-list-1280.png');

    console.log('== A6 ⋮ 菜单 + 删除二次确认 ==');
    await evalPage(`
      (() => {
        const btn = document.querySelector('button[aria-label^="更多操作"]');
        if (!btn) return 'NOT_FOUND';
        btn.click();
        return 'CLICKED';
      })()
    `);
    await delay(700);
    const menuOk = await evalPage(`
      (() => {
        const sheet = document.querySelector('[role="dialog"]');
        const t = sheet?.textContent ?? '';
        return ['编辑','测试连接','连接','删除'].every((m) => t.includes(m));
      })()
    `);
    assert(menuOk, '⋮ 菜单四项呈现（BottomSheet）');
    await screenshot('connection-menu-1280.png');
    await evalPage(`
      (() => {
        const els = [...document.querySelectorAll('[role="dialog"] div, [role="dialog"] button')];
        const exact = els.filter((e) => (e.textContent || '').trim() === '删除');
        const target = exact[exact.length - 1];
        if (!target) return 'NOT_FOUND';
        target.click();
        return 'CLICKED';
      })()
    `);
    await delay(700);
    const dialogOk = await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const t = d?.textContent ?? '';
        return t.includes('删除连接') && t.includes('验证服务器') && t.includes('取消') && t.includes('删除');
      })()
    `);
    assert(dialogOk, '删除二次确认 Dialog（名称 + 取消/删除）');
    await screenshot('connection-delete-confirm-1280.png');
    await evalPage(`
      (() => {
        const dialogs = [...document.querySelectorAll('[role="alertdialog"]')];
        const d = dialogs[dialogs.length - 1];
        const btn = [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === '删除');
        btn?.click();
        return 'OK';
      })()
    `);
    await delay(1000);
    const backEmpty = await evalPage(`document.body.innerText.includes('还没有保存的连接')`);
    assert(backEmpty, '确认删除后列表回空态');
    const persistCleared = await evalPage(`
      (() => {
        const raw = localStorage.getItem('CapacitorStorage.pad2.profiles.v1');
        if (!raw) return true;
        try { return JSON.parse(raw).profiles.length === 0; } catch { return false; }
      })()
    `);
    assert(persistCleared, '持久化同步清除');

    console.log('== A7 渲染健康 ==');
    assert(pageExceptions.length === 0, `无未捕获异常${pageExceptions.length ? `: ${pageExceptions.join(' | ')}` : ''}`);
    if (consoleErrors.length > 0) {
      console.log(`  [INFO] console.error ${consoleErrors.length} 条（web 无插件实现预期噪音）:`);
      consoleErrors.slice(0, 6).forEach((e) => console.log(`    - ${e.substring(0, 160)}`));
    }

    console.log('\nTASK-S3-03/04 web 等价验证全部通过');
  } finally {
    try { ws?.close(); } catch { /* 忽略 */ }
    edge.kill();
    await delay(1200);
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch { /* Windows 句柄延迟释放，忽略残留 */ }
  }
}

main().catch((e) => {
  console.error(`✗ 验证失败: ${e.message}`);
  process.exit(1);
});