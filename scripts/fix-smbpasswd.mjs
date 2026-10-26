/** 修复 pad2gate3 smbpasswd + 验证 SMB 访问 */
import { execFileSync } from 'node:child_process';
const SSH_KEY = process.env.HOME + '/.ssh/pad2_cred_closure';
function ssh(cmd) { return execFileSync('ssh', ['-i', SSH_KEY, 'debian@192.168.2.3', cmd], { encoding: 'utf8', timeout: 120000 }); }

console.log('== sudo 权限检查 ==');
const sudo = ssh('sudo -n true 2>&1 && echo SUDO_OK || echo SUDO_NEED_PW');
console.log(sudo.trim());

if (sudo.includes('SUDO_OK')) {
  console.log('\n== 重新设置 smbpasswd ==');
  const pw = ssh('cat ~/pad2_cred_next.txt').trim();
  const setOut = ssh(`printf '%s\\n%s\\n' '${pw}' '${pw}' | sudo smbpasswd -s pad2gate3 2>&1`);
  console.log(setOut.trim());

  console.log('\n== 验证 SMB 访问 ==');
  const verify = ssh(`timeout 10 smbclient //192.168.2.3/share -U 'pad2gate3%${pw}' -c 'ls apk/' 2>&1 | head -6`);
  console.log(verify.trim());
} else {
  console.log('sudo 需要密码——无法自动修复 smbpasswd');
  console.log('替代方案：直接在 Debian 服务器本地访问 /mnt/share/apk/（已复制 APK）');
  // 检查 guest 访问是否可用
  const guest = ssh(`timeout 10 smbclient //192.168.2.3/share -U guest% -c 'ls apk/' 2>&1 | head -6`);
  console.log('\nguest 访问: ' + guest.trim());
}