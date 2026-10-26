/**
 * TASK-S2-06 V1-V7 真机验证 CDP 驱动工具
 * 用法：node scripts/v1v7-cdp.mjs <action> [args]
 *   action:
 *     setpwd <密码>       - 设置 M2 页密码框值（React native setter 触发 onChange）
 *     connect             - 点击"连接"按钮
 *     status              - 读取页面状态（V1-V7 表格行 + 日志尾部 + 错误横幅）
 *     clicktext <文本>    - 点击包含指定文本的按钮/文件行
 *     eval <js表达式>     - 执行任意 JS 并返回结果
 */
async function discoverPage() {
  const res = await fetch('http://127.0.0.1:9222/json/list');
  const pages = await res.json();
  const page = pages.find((p) => p.type === 'page');
  if (!page) throw new Error('未发现 WebView 调试页面（检查 adb forward 与应用是否运行）');
  return page.webSocketDebuggerUrl;
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

async function evalPage(expression, awaitPromise = false) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise,
  });
  if (exceptionDetails) throw new Error(`evaluate 异常: ${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ''}`);
  return result.value;
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  if (!action) { console.error('缺少 action'); process.exit(1); }

  ws = new WebSocket(await discoverPage());
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
  await send('Runtime.enable');

  try {
    if (action === 'setpwd') {
      const pwd = args[0];
      const r = await evalPage(`(() => {
        const inputs = [...document.querySelectorAll('main input[type="password"]')];
        if (inputs.length === 0) return 'NO_PWD_INPUT';
        const input = inputs[0];
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(pwd)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 'PWD_SET len=' + input.value.length;
      })()`);
      console.log(r);
    } else if (action === 'connect') {
      const r = await evalPage(`(() => {
        const btns = [...document.querySelectorAll('main button')];
        const btn = btns.find((b) => b.textContent.trim() === '连接');
        if (!btn) return 'NO_CONNECT_BTN; buttons=' + btns.map(b => b.textContent.trim()).join('|');
        btn.click();
        return 'CONNECT_CLICKED';
      })()`);
      console.log(r);
    } else if (action === 'status') {
      const r = await evalPage(`(() => {
        const t = document.body.innerText;
        // V1-V7 表格行状态
        const rows = [...document.querySelectorAll('main table tbody tr')].map((tr) => {
          const cells = [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
          return cells.join(' | ');
        });
        const banner = document.querySelector('[role="alert"]');
        const logBox = [...document.querySelectorAll('main div')].find((d) => d.textContent.includes('[') && d.children.length > 3);
        return JSON.stringify({
          connected: t.includes('已连接'),
          hasBrowse: t.includes('文件浏览'),
          banner: banner ? banner.textContent.trim() : null,
          vRows: rows,
          logTail: (window.__pad2log ?? '').split('\\n').slice(-8),
        }, null, 1);
      })()`);
      console.log(r);
    } else if (action === 'clicktext') {
      const text = args.join(' ');
      const r = await evalPage(`(() => {
        const candidates = [...document.querySelectorAll('main button, main [role="button"], main .fileRow, main div[class*="fileRow"]')];
        const el = candidates.find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
        if (!el) return 'NOT_FOUND';
        el.click();
        return 'CLICKED: ' + el.textContent.trim().substring(0, 60);
      })()`);
      console.log(r);
    } else if (action === 'eval') {
      const r = await evalPage(args.join(' '));
      console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1));
    } else {
      console.error('未知 action: ' + action);
      process.exit(1);
    }
  } finally {
    ws.close();
  }
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });