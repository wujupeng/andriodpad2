/** TASK-AU-001 T12：远程构建+签名（node 经 ssh 通道） */
import { execFileSync, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SSH_KEY = process.env.HOME + '/.ssh/pad2_cred_closure';
const LOCAL = 'C:/Users/DELL/IDEProjects/pad2';
const REMOTE_BASE = '~/android/pad2-build';
const TMP = tmpdir();

function ssh(cmd) { return execFileSync('ssh', ['-i', SSH_KEY, 'debian@192.168.2.3', cmd], { encoding: 'utf8', timeout: 600000 }); }
function scp(local, remote) { execFileSync('scp', ['-i', SSH_KEY, local, `debian@192.168.2.3:${remote}`], { encoding: 'utf8', timeout: 300000 }); }

console.log('== 1. 同步 assets+config ==');
execSync(`cd "${LOCAL}/android/app/src/main/assets" && tar czf /tmp/au-assets.tar.gz public capacitor.config.json`, { encoding: 'utf8' });
scp('/tmp/au-assets.tar.gz', '/tmp/');
ssh(`cd ${REMOTE_BASE}/app/src/main/assets && rm -rf public && tar xzf /tmp/au-assets.tar.gz && grep loggingBehavior capacitor.config.json`);
console.log('  assets 同步完成');

console.log('== 2. 同步 AndroidManifest+MainActivity+update 子包 ==');
scp(`${LOCAL}/android/app/src/main/AndroidManifest.xml`, `${REMOTE_BASE}/app/src/main/AndroidManifest.xml`);
scp(`${LOCAL}/android/app/src/main/java/com/pad2/filemanager/MainActivity.java`, `${REMOTE_BASE}/app/src/main/java/com/pad2/filemanager/MainActivity.java`);
ssh(`mkdir -p ${REMOTE_BASE}/app/src/main/java/com/pad2/filemanager/update`);
for (const f of ['UpdatePlugin', 'UpdateSmbClient', 'InstallTrigger', 'SignatureVerifier', 'CurrentVersionProvider', 'Sha256Calculator']) {
  scp(`${LOCAL}/android/app/src/main/java/com/pad2/filemanager/update/${f}.java`, `${REMOTE_BASE}/app/src/main/java/com/pad2/filemanager/update/${f}.java`);
}
console.log('  Java 文件同步完成');

console.log('== 3. assembleRelease ==');
const buildOut = ssh(`cd ${REMOTE_BASE} && ./gradlew :app:assembleRelease 2>&1 | tail -5`);
console.log(buildOut.trim());

console.log('== 4. apksigner 签名 ==');
const signOut = ssh(`cd ${REMOTE_BASE}/app/build/outputs/apk/release && ~/android-sdk/build-tools/36.0.0/apksigner sign --ks ~/.android/debug.keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey --out app-au-signed.apk app-release-unsigned.apk 2>&1 && echo SIGN_OK`);
console.log(signOut.trim());

console.log('== 5. SHA-256 ==');
const sha = ssh(`sha256sum ${REMOTE_BASE}/app/build/outputs/apk/release/app-au-signed.apk`);
console.log(sha.trim());