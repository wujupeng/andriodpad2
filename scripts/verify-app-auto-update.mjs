/**
 * AU-001 + AU-002 自动更新验证脚本
 * AU-TC-01~15 场景矩阵执行载体（design 2.10.1 + AU-002 design §2.13）
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
  const remote = `/sdcard/scr_${Date.now()}.png`;
  try {
    execFileSync(ADB, ['-s', DEVICE, 'shell', `screencap -p ${remote}`], { encoding: 'utf8', timeout: 30000 });
    execFileSync(ADB, ['-s', DEVICE, 'pull', remote, join(OUT_DIR, name)], { encoding: 'utf8', timeout: 30000 });
    execFileSync(ADB, ['-s', DEVICE, 'shell', `rm ${remote}`], { encoding: 'utf8', timeout: 10000 });
  } catch (e) {
    console.log(`  [warn] screenshot failed: ${e.message}`);
  }
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
  const state = await evalPage(`(() => {
    try {
      const store = window.__updateStore;
      if (!store) return null;
      return JSON.stringify(store.getState());
    } catch(e) { return null; }
  })()`);
  return state ? JSON.parse(state) : null;
}

async function getBodyText() {
  return evalPage(`document.body.innerText`);
}

async function clickByDataAttr(attr) {
  return evalPage(`(() => {
    const el = document.querySelector('[${attr}]');
    if (el) { el.click(); return true; }
    return false;
  })()`);
}

async function queryByDataAttr(attr) {
  return evalPage(`!!document.querySelector('[${attr}]')`);
}

async function pollUntil(predicate, timeoutMs = 30000, intervalMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await sleep(intervalMs);
  }
  return false;
}

function writeUpdateJson(versionCode, versionName, fileName, sha256, releaseNotes, forceUpdate, minVersionCode = 1, size) {
  const manifest = {
    versionCode,
    versionName,
    fileName,
    sha256,
    minVersionCode,
    releaseNotes,
    publishedAt: new Date().toISOString(),
  };
  if (size) manifest.size = size;
  if (forceUpdate) manifest.forceUpdate = true;
  sshRun(`cat > ${REMOTE_UPDATE_JSON} << 'ENDJSON'\n${JSON.stringify(manifest, null, 2)}\nENDJSON`);
}

const BASELINE_APK = `${REMOTE_APK_DIR}/pad2-p005-v14.apk`;
const BASELINE_SHA = '9857732d05f91416aecff06f41b47103e7f8747a8f22cfff4f3b7bdc2fc03138';
const V99_APK = `${REMOTE_APK_DIR}/pad2-v99.apk`;
const V99_SHA = sshRun(`sha256sum ${V99_APK} 2>/dev/null | awk '{print $1}'`) || 'unknown';

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
  console.log('[debug] TC02 before screenshot');
  await screenshot('au001-tc02-update-available.png');
  console.log('[debug] TC02 after screenshot');
  ws.close();
  console.log('[debug] TC02 after ws.close');
}

async function TC03() {
  console.log('== AU-TC-03: 完整更新流程 ==');
  writeUpdateJson(99, '2.0', 'pad2-v99.apk', V99_SHA, 'AU-002 完整流程测试', false);
  adbShell(`pm clear ${PACKAGE}`);
  await restartApp();
  await connectWs();
  await sleep(5000);
  assert('AU-TC-03', await queryByDataAttr('data-update-banner'), 'Banner 显示');
  const clicked = await clickByDataAttr('data-update-banner-confirm');
  assert('AU-TC-03', clicked, '点击立即更新');
  const downloaded = await pollUntil(async () => {
    const s = await getUpdateStoreState();
    return s && (s.status === 'verifying' || s.status === 'ready' || s.status === 'failed');
  }, 60000, 2000);
  assert('AU-TC-03', downloaded, '下载完成进入校验/就绪');
  const readyState = await getUpdateStoreState();
  assert('AU-TC-03', readyState.status === 'ready', `状态 ready（实际: ${readyState.status}）`);
  const installClicked = await clickByDataAttr('data-update-dialog-install');
  assert('AU-TC-03', installClicked, '点击安装');
  await sleep(2000);
  adbShell('input tap 764 1048');
  await sleep(1000);
  adbShell('input tap 600 1627');
  await sleep(500);
  adbShell('input tap 811 1784');
  const installed = await pollUntil(() => {
    const vc = adbShell(`dumpsys package ${PACKAGE} 2>/dev/null | grep versionCode | head -1`);
    return vc.includes('99');
  }, 60000, 3000);
  const versionCode = adbShell(`dumpsys package ${PACKAGE} | grep versionCode | head -1`);
  assert('AU-TC-03', versionCode.includes('99'), `安装后 versionCode=99（实际: ${versionCode.trim()}）`);
  await screenshot('au002-tc03-complete-flow.png');
  ws.close();
}

async function TC04() {
  console.log('== AU-TC-04: SHA-256 校验失败 ==');
  writeUpdateJson(99, '2.0', 'pad2-v99.apk', '0'.repeat(64), '错误哈希测试', false);
  adbShell(`pm clear ${PACKAGE}`);
  await restartApp();
  await connectWs();
  await sleep(5000);
  await clickByDataAttr('data-update-banner-confirm');
  const failed = await pollUntil(async () => {
    const s = await getUpdateStoreState();
    return s && s.status === 'failed';
  }, 60000, 2000);
  assert('AU-TC-04', failed, '校验失败进入 failed 态');
  const s = await getUpdateStoreState();
  console.log('  [debug] full state:', JSON.stringify(s));
  console.log('  [debug] error detail:', s.error?.detail ?? 'N/A');
  assert('AU-TC-04', s.error?.category === 'verify_failed', `error.category=verify_failed（实际: ${s.error?.category}）`);
  await screenshot('au002-tc04-sha-fail.png');
  ws.close();
}

async function TC05() {
  console.log('== AU-TC-05: 签名不一致 ==');
  const diffSignSha = sshRun(`sha256sum ${REMOTE_APK_DIR}/pad2-v99-diffsign.apk 2>/dev/null | awk '{print $1}'`);
  writeUpdateJson(99, '2.0', 'pad2-v99-diffsign.apk', diffSignSha, '签名不一致测试', false);
  adbShell(`pm clear ${PACKAGE}`);
  await restartApp();
  await connectWs();
  await sleep(5000);
  await clickByDataAttr('data-update-banner-confirm');
  const failed = await pollUntil(async () => {
    const s = await getUpdateStoreState();
    return s && s.status === 'failed';
  }, 30000, 2000);
  assert('AU-TC-05', failed, '签名校验失败进入 failed 态');
  const s = await getUpdateStoreState();
  assert('AU-TC-05', s.error?.category === 'signature_mismatch', `error.category=signature_mismatch（实际: ${s.error?.category}）`);
  await screenshot('au002-tc05-sig-mismatch.png');
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

async function TC07() {
  console.log('== AU-TC-07: 强制更新 ==');
  writeUpdateJson(99, '2.0', 'pad2-v99.apk', V99_SHA, '强制更新测试', true, 99);
  adbShell(`pm clear ${PACKAGE}`);
  await restartApp();
  await connectWs();
  await sleep(5000);
  assert('AU-TC-07', await queryByDataAttr('data-update-banner-confirm'), '立即更新按钮存在');
  assert('AU-TC-07', !await queryByDataAttr('data-update-banner-cancel'), '稍后按钮不存在（强制更新）');
  const s = await getUpdateStoreState();
  assert('AU-TC-07', s?.updateInfo?.forceUpdate === true, 'forceUpdate=true');
  await screenshot('au002-tc07-force-update.png');
  ws.close();
}

async function TC08() {
  console.log('== AU-TC-08: 下载中断恢复 ==');
  writeUpdateJson(99, '2.0', 'pad2-v99.apk', V99_SHA, '中断恢复测试', false);
  adbShell(`pm clear ${PACKAGE}`);
  await restartApp();
  await connectWs();
  await sleep(5000);
  await clickByDataAttr('data-update-banner-confirm');
  await sleep(3000);
  adbShell('svc wifi disable');
  await sleep(3000);
  adbShell('svc wifi enable');
  await sleep(3000);
  const failed = await pollUntil(async () => {
    const s = await getUpdateStoreState();
    return s && s.status === 'failed';
  }, 15000, 1000);
  if (failed) {
    await clickByDataAttr('data-update-banner-confirm');
  }
  const restored = await pollUntil(async () => {
    const s = await getUpdateStoreState();
    return s && (s.status === 'ready' || s.status === 'failed');
  }, 60000, 2000);
  assert('AU-TC-08', restored, '网络恢复后重试下载完成');
  const s = await getUpdateStoreState();
  console.log('  [debug] final state:', JSON.stringify(s));
  assert('AU-TC-08', s.status === 'ready', `断点续传后 status=ready（实际: ${s.status}）`);
  await screenshot('au002-tc08-resume.png');
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

async function TC10() {
  console.log('== AU-TC-10: 荣耀安装确认 ==');
  writeUpdateJson(99, '2.0', 'pad2-v99.apk', V99_SHA, '荣耀安装确认测试', false);
  adbShell(`pm clear ${PACKAGE}`);
  await restartApp();
  await connectWs();
  await sleep(5000);
  await clickByDataAttr('data-update-banner-confirm');
  const ready = await pollUntil(async () => {
    const s = await getUpdateStoreState();
    return s && s.status === 'ready';
  }, 60000, 2000);
  assert('AU-TC-10', ready, '下载校验完成进入 ready');
  await clickByDataAttr('data-update-dialog-install');
  await sleep(2000);
  await screenshot('au002-tc10-honor-dialog.png');
  adbShell('input tap 764 1048');
  await sleep(1000);
  adbShell('input tap 600 1627');
  await sleep(500);
  adbShell('input tap 811 1784');
  const installed10 = await pollUntil(() => {
    const vc = adbShell(`dumpsys package ${PACKAGE} 2>/dev/null | grep versionCode | head -1`);
    return vc.includes('99');
  }, 60000, 3000);
  const versionCode = adbShell(`dumpsys package ${PACKAGE} | grep versionCode | head -1`);
  assert('AU-TC-10', versionCode.includes('99'), `荣耀确认安装后 versionCode=99（实际: ${versionCode.trim()}）`);
  ws.close();
}

async function TC11() {
  console.log('== AU-TC-11: 取消更新 ==');
  writeUpdateJson(99, '2.0', 'pad2-v99.apk', V99_SHA, '取消更新测试', false);
  adbShell(`pm clear ${PACKAGE}`);
  await restartApp();
  await connectWs();
  await sleep(5000);
  await clickByDataAttr('data-update-banner-confirm');
  await sleep(2000);
  const downloading = await getUpdateStoreState();
  console.log('  [debug] after confirm, state:', JSON.stringify(downloading));
  assert('AU-TC-11', downloading?.status === 'downloading', '下载中');
  const cancelClicked = await clickByDataAttr('data-update-banner-cancel');
  console.log('  [debug] cancel button clicked:', cancelClicked);
  const idle = await pollUntil(async () => {
    const s = await getUpdateStoreState();
    return s && s.status === 'idle';
  }, 10000, 500);
  const s = await getUpdateStoreState();
  console.log('  [debug] after cancel, state:', JSON.stringify(s));
  assert('AU-TC-11', cancelClicked, '取消按钮存在且已点击');
  assert('AU-TC-11', idle, `取消后 status=idle（实际: ${s.status}）`);
  assert('AU-TC-11', !await queryByDataAttr('data-update-banner'), 'Banner 已消失');
  await screenshot('au002-tc11-cancel.png');
  ws.close();
}

async function TC12() {
  console.log('== AU-TC-12: 更新源独立连接 ==');
  writeUpdateJson(99, '2.0', 'pad2-v99.apk', V99_SHA, '独立连接测试', false);
  adbShell(`pm clear ${PACKAGE}`);
  await restartApp();
  await connectWs();
  await sleep(5000);
  const s = await getUpdateStoreState();
  assert('AU-TC-12', s?.status === 'available', `更新检查完成 status=available（实际: ${s?.status}）`);
  const smbConnected = await evalPage(`(() => {
    try {
      const store = window.__smbConnectionStore;
      if (!store) return 'N/A';
      return JSON.stringify(store.getState());
    } catch(e) { return 'ERR'; }
  })()`);
  console.log('  [info] SMB store:', smbConnected);
  await screenshot('au002-tc12-independent.png');
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
  1: TC01, 2: TC02, 3: TC03, 4: TC04, 5: TC05, 6: TC06, 7: TC07,
  8: TC08, 9: TC09, 10: TC10, 11: TC11, 12: TC12,
  13: TC13, 14: TC14, 15: TC15,
};

const AU001_SCENARIOS = [1, 2, 6, 9, 13, 14, 15];
const AU002_SCENARIOS = [3, 4, 5, 7, 8, 10, 11, 12];

async function main() {
  console.log('=== AU-001 + AU-002 验证脚本 ===');
  console.log(`设备: ${DEVICE}`);
  console.log(`场景: ${SCENARIO ? `仅 TC-${String(SCENARIO).padStart(2,'0')}` : '全部 15 场景'}`);
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

  const au001Results = results.filter(r => AU001_SCENARIOS.some(n => r.tc.includes(`TC-${String(n).padStart(2,'0')}`)));
  const au002Results = results.filter(r => AU002_SCENARIOS.some(n => r.tc.includes(`TC-${String(n).padStart(2,'0')}`)));

  console.log('[debug] Writing results...');
  const timestamp = new Date().toISOString();
  const au001Summary = { timestamp, device: DEVICE, scenarios: au001Results, allPass: au001Results.every(r => r.pass) };
  const au002Summary = { timestamp, device: DEVICE, scenarios: au002Results, allPass: au002Results.every(r => r.pass) };

  writeFileSync(join(OUT_DIR, 'au001-result.json'), JSON.stringify(au001Summary, null, 2));
  writeFileSync(join(OUT_DIR, 'au002-result.json'), JSON.stringify(au002Summary, null, 2));
  console.log('[debug] Results written');

  console.log('');
  console.log(`=== 结果: ${allPass ? 'ALL PASS' : 'HAS FAILURES'} (${results.length} 断言) ===`);

  const summaryText = `AU-001 + AU-002 验证结果
时间: ${timestamp}
设备: ${DEVICE}
断言数: ${results.length}
结果: ${allPass ? 'ALL PASS' : 'HAS FAILURES'}

AU-001 场景:
${au001Results.map(r => `  ${r.pass ? 'PASS' : 'FAIL'} ${r.tc}: ${r.message}`).join('\n')}

AU-002 场景:
${au002Results.map(r => `  ${r.pass ? 'PASS' : 'FAIL'} ${r.tc}: ${r.message}`).join('\n')}`;

  writeFileSync(join(OUT_DIR, 'au002-result-summary.txt'), summaryText);
  writeFileSync(join(OUT_DIR, 'au001-result-summary.txt'), summaryText);
  console.log('[debug] Summary written');

  console.log('[debug] Cleaning up...');
  try { adbShell('svc power stayon false'); } catch {}
  console.log('[debug] Power stayon false done');
  if (ws) try { ws.close(); } catch {}
  console.log('[debug] WebSocket closed');
  console.log('[debug] Exiting...');
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal: ' + e.message);
  try { adbShell('svc power stayon false'); } catch {}
  if (ws) try { ws.close(); ws.terminate?.(); } catch {}
  process.exit(1);
});

setTimeout(() => { console.error('FORCE EXIT after 300s'); process.exit(2); }, 300000);