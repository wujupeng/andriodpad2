/** TASK-S6-05-FIX T4b：release APK 签名（apksigner v1+v2，debug.keystore——受控部署密钥，正式发布须换发布密钥） */
import { execFileSync } from 'node:child_process';

const SSH_KEY = process.env.HOME + '/.ssh/pad2_cred_closure';

function ssh(cmd) {
  return execFileSync('ssh', ['-i', SSH_KEY, 'debian@192.168.2.3', cmd], { encoding: 'utf8', timeout: 300000 });
}

console.log('== apksigner 签名（v1+v2） ==');
const signOut = ssh(`cd ~/android/pad2-build/app/build/outputs/apk/release && ~/android-sdk/build-tools/36.0.0/apksigner sign --ks ~/.android/debug.keystore --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey --out app-release-signed.apk app-release-unsigned.apk 2>&1 && echo SIGN_OK`);
console.log(String(signOut).trim());

console.log('\n== 签名核验（verify --print-certs） ==');
const verifyOut = ssh(`cd ~/android/pad2-build/app/build/outputs/apk/release && ~/android-sdk/build-tools/36.0.0/apksigner verify --print-certs app-release-signed.apk 2>&1 | head -6`);
console.log(String(verifyOut).trim());

console.log('\n== SHA-256 ==');
const shaOut = ssh(`sha256sum ~/android/pad2-build/app/build/outputs/apk/release/app-release-signed.apk`);
console.log(String(shaOut).trim());