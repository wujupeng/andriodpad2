/**
 * AU-001 自动更新验证脚本（T13）
 * AU-TC-01~15 场景矩阵执行载体（design 2.10.1）
 * 用法：node scripts/verify-app-auto-update.mjs [场景号]
 *   不传场景号 → 执行全部
 *   传入数字 → 仅执行该场景
 */
import { execFileSync, execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ADB = 'C:/Users/DELL/IDEProjects/pad2/local-sdk/platform-tools/adb.exe';
const DEVICE = 'AJ7XJV6904H00320';
const OUT_DIR = 'C:/Users/DELL/IDEProjects/pad2/docs/p003-ui/shots/s6';
const SSH_KEY = `${process.env.HOME}/.ssh/pad2_cred_closure`;
const SSH_HOST = 'debian@192.168.2.3';
const REMOTE_UPDATE_JSON = '/mnt/share/apk/update.json';
const REMOTE_APK_DIR = '/mnt/share/apk/dazongli';
const PROJECT_DIR = 'C:/Users/DELL/IDEProjects/pad2';
const PACKAGE = 'com.pad2.filemanager';
const SCENARIO = process.argv[2] ? parseInt(process.argv[2], 10) : null;

const results = [];
let ws, msgId = 0;
const pending = new Map();

function adbShell(cmd) {
  return execFileSync(ADB, ['-s', DEVICE, 'shell', cmd], { encoding: 'utf8', timeout: 120000 }).trim();
}
function sshRun(cmd) {
  return execFileSync('ssh', ['-i', SSH_KEY, SSH_HOST, cmd], { encoding: 'utf8', timeout: 60000 }).trim();
}
function localRun(cmd) {
  return execSync(cmd, { encoding: 'utf8', cwd: PROJECT_DIR, timeout: 120000 }).trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
}
async function connectWs() {
  const unix = adbShell("cat /proc/net/unix | grep webview_devtools_remote | head -1");
  const m = unix.match(/webview_devtools_remote_(\d+)/);
  if (!m) throw new Error('WebView DevTools 未找到');
  execFileSync(ADB, ['-s', DEVICE, 'forward', 'tcp:9222', `localabstract:webview_devtools_remote_${m[1]}`]);
  const targets = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('CDP page 未找到');
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

function assert(tc, condition, message) {
  const pass = !!condition;
  results.push({ tc, pass, message });
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${tc}: ${message}`);
  if (!pass) throw new Error(`${tc} FAILED: ${message}`);
}

async function restartApp(waitMs = 8000) {
  adbShell(`am force-stop ${PACKAGE}`);
  await sleep(1500);
  adbShell(`am start -n ${PACKAGE}/.MainActivity`);
  await sleep(waitMs);
}

async function getUpdateStoreState() {
  return evalPage(`(() => {
    try { return JSON.stringify(window.__updateStore || 'N/A'); } catch(e) { return 'ERR:' + e.message; }
  })()`);
}

async function getBodyText() {
  return evalPage(`document.body.innerText`);
}

function writeUpdateJson(versionCode, versionName, fileName, sha256, releaseNotes, forceUpdate) {
  const manifest = {
    versionCode,
    versionName,
    fileName,
    sha256,
    minVersionCode: 1,
    releaseNotes,
    publishedAt: new Date().toISOString(),
  };
  if (forceUpdate) manifest.forceUpdate = true;
  sshRun(`cat > ${REMOTE_UPDATE_JSON} << 'ENDJSON'\n${JSON.stringify(manifest, null, 2)}\nENDJSON`);
}

const BASELINE_APK = `${REMOTE_APK_DIR}/pad2-p005-v14.apk`;
const BASELINE_SHA = '9857732d05f91416aecff06f41b47103e7f8747a8f22cfff4f3b7bdc2fc03138';

async function TC01() {
  console.log('== AU-TC-01: 启动自动检查-无更新 ==');
  writeUpdateJson(5, '1.4', 'pad2-p005-v14.apk', BASELINE_SHA, '当前版本', false);
  adbShell(`pm clear ${PACKAGE}`);
  await restartApp();
  await connectWs();
  await sleep(3000);
  const text = await getBodyText();
  assert('AU-TC-01', !text.includes('发现新版本'), '无更新 Banner 显示');
  await screenshot('au001-tc01-no-update.png');
  ws.close();
}

async function TC02() {
  console.log('== AU-TC-02: 启动自动检查-有更新 ==');
  writeUpdateJson(99, '2.0', 'pad2-p005-v14.apk', BASELINE_SHA, '测试更新版本', false);
  adbShell(`pm clear ${PACKAGE}`);
  await restartApp();
  await connectWs();
  await sleep(5000);
  const text = await getBodyText();
  assert('AU-TC-02', text.includes('发现新版本'), '更新 Banner 显示');
  assert('AU-TC-02', text.includes('2.0'), '版本号 2.0 呈现');
  await screenshot('au001-tc02-update-available.png');
  ws.close();
}

async function TC06() {
  console.log('== AU-TC-06: 防降级 ==');
  writeUpdateJson(1, '0.9', 'pad2-p005-v14.apk', BASELINE_SHA, '旧版本', false);
  adbShell(`pm clear ${PACKAGE}`);
  await restartApp();
  await connectWs();
  await sleep(3000);
  const text = await getBodyText();
  assert('AU-TC-06', !text.includes('发现新版本'), '降级版本不提示更新');
  await screenshot('au001-tc06-no-downgrade.png');
  ws.close();
}

async function TC09() {
  console.log('== AU-TC-09: 检查失败不阻塞 ==');
  writeUpdateJson(99, '2.0', 'pad2-p005-v14.apk', BASELINE_SHA, '测试', false);
  adbShell(`svc wifi disable`);
  adbShell(`pm clear ${PACKAGE}`);
  await restartApp();
  await sleep(3000);
  adbShell(`svc wifi enable`);
  await sleep(2000);
  await connectWs();
  const text = await getBodyText();
  assert('AU-TC-09', text.length > 0, 'App 正常进入主功能（非白屏）');
  await screenshot('au001-tc09-check-fail-no-block.png');
  ws.close();
}

async function TC13() {
  console.log('== AU-TC-13: 冻结区边界审查 ==');
  const coreDiff = localRun('git diff --name-only a5d3a67..HEAD -- src/core/');
  assert('AU-TC-13', coreDiff.trim() === '', 'src/core/ 零变更（无 FRZ-EX 授权）');
  const updateImports = localRun('grep -r "import.*smb" src/adapter/update/ src/orchestration/update/ src/state/updateStore.ts 2>/dev/null || true');
  assert('AU-TC-13', updateImports.trim() === '', 'AU-001 update 包不依赖 smb 包（独立连接）');
  const manifestDiff = localRun('git diff a5d3a67..HEAD -- android/app/src/main/AndroidManifest.xml');
  const manifestLines = manifestDiff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
  assert('AU-TC-13', manifestLines <= 5, `AndroidManifest 变更行数 ${manifestLines} <= 5（FRZ-EX 授权范围）`);
}

async function TC14() {
  console.log('== AU-TC-14: 零新增 npm 依赖 ==');
  const diff = localRun('git diff a5d3a67..HEAD -- package.json');
  const addedDeps = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++') && l.includes('"')).length;
  const removedDeps = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---') && l.includes('"')).length;
  assert('AU-TC-14', addedDeps === removedDeps, `package.json 无新增依赖（+${addedDeps} -${removedDeps}）`);
}

async function TC15() {
  console.log('== AU-TC-15: 三项静态检查 ==');
  try {
    localRun('npx tsc --noEmit');
    assert('AU-TC-15', true, 'tsc --noEmit 通过');
  } catch {
    assert('AU-TC-15', false, 'tsc --noEmit 通过');
  }
  try {
    localRun('node scripts/check-design-tokens.mjs');
    assert('AU-TC-15', true, '设计令牌检查通过');
  } catch {
    assert('AU-TC-15', false, '设计令牌检查通过');
  }
  try {
    localRun('node scripts/check-contrast.mjs');
    assert('AU-TC-15', true, '对比度检查通过');
  } catch {
    assert('AU-TC-15', false, '对比度检查通过');
  }
}

const ALL_SCENARIOS = {
  1: TC01, 2: TC02, 6: TC06, 9: TC09,
  13: TC13, 14: TC14, 15: TC15,
};

async function main() {
  console.log('=== AU-001 验证脚本 ===');
  console.log(`设备: ${DEVICE}`);
  console.log(`场景: ${SCENARIO ? `仅 TC-${String(SCENARIO).padStart(2,'0')}` : '全部已实现场景'}`);
  console.log('');

  adbShell('svc power stayon true');
  adbShell('input keyevent KEYCODE_WAKEUP');

  const scenarios = SCENARIO ? [SCENARIO] : Object.keys(ALL_SCENARIOS).map(Number);
  let allPass = true;

  for (const num of scenarios) {
    const fn = ALL_SCENARIOS[num];
    if (!fn) { console.log(`  SKIP TC-${String(num).padStart(2,'0')}: 未实现`); continue; }
    try {
      await fn();
    } catch (e) {
      allPass = false;
      console.error(`  ERROR: ${e.message}`);
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    device: DEVICE,
    scenarios: results,
    allPass,
  };
  writeFileSync(join(OUT_DIR, 'au001-result.json'), JSON.stringify(summary, null, 2));
  console.log('');
  console.log(`=== 结果: ${allPass ? 'ALL PASS' : 'HAS FAILURES'} (${results.length} 断言) ===`);
  writeFileSync(join(OUT_DIR, 'au001-result-summary.txt'),
    `AU-001 验证结果\n时间: ${summary.timestamp}\n设备: ${DEVICE}\n断言数: ${results.length}\n结果: ${allPass ? 'ALL PASS' : 'HAS FAILURES'}\n\n${results.map(r => `${r.pass ? 'PASS' : 'FAIL'} ${r.tc}: ${r.message}`).join('\n')}`);

  try { adbShell('svc power stayon false'); } catch {}
  if (ws) try { ws.close(); } catch {}
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal: ' + e.message);
  try { adbShell('svc power stayon false'); } catch {}
  if (ws) try { ws.close(); } catch {}
  process.exit(1);
});