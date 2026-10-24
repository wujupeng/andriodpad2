/**
 * TASK-S6-04-RC-VERIFY 步骤 4：测试目录收口（PM 授权——只清确认属本次测试的文件）
 * 清单：PAD2-S6-01 目录全部测试产物（S6-01/FIX-01/RC 系列创建）+ 目录本身
 * 红线：预置原件（新建 XLSX 工作表.xlsx / 新建 XLS 工作表.xls）零触碰——路径严格限定 PAD2-S6-01/ 内
 * 附：远程 /tmp 测试中间产物清理 + 预置原件终态 SHA 核验
 */
import { execFileSync } from 'node:child_process';

const SSH_KEY = process.env.HOME + '/.ssh/pad2_cred_closure';
const SMB = `timeout 90 smbclient //192.168.2.247/soft -U guest%`;

function ssh(cmd) {
  return execFileSync('ssh', ['-i', SSH_KEY, 'debian@192.168.2.3', cmd], { encoding: 'utf8', timeout: 180000 });
}

const FILES = [
  'ws-sub-dir/*', 's601-50m.bin', 'ws-50m-copy.bin', 'ws-conflict.xlsx',
  'ws-copy-xls.xls', 'ws-copy-xlsx.xlsx', 'ws-readonly.txt',
  'ws-refresh-new.txt', 'ws-renamed.txt', '测试表.xls', '测试表.xlsx',
];

console.log('== 收口清理 PAD2-S6-01 ==');
const delCmds = FILES.map((f) => `del ${f}`).join('; ');
const out = ssh(`${SMB} -c 'cd AutoFileBackup/PAD2-S6-01; ${delCmds}; rmdir ws-sub-dir; cd ..; rmdir PAD2-S6-01' 2>&1 || true`);
console.log(String(out).trim().split('\n').slice(-2).join('\n'));

const lsAfter = String(ssh(`${SMB} -c 'ls AutoFileBackup/' 2>&1 || true`));
const pad2Gone = !/PAD2-S6-01/.test(lsAfter);
console.log(`PAD2-S6-01 目录${pad2Gone ? '已删除' : '仍存在（登记残留）'}`);
if (!pad2Gone) {
  const remain = String(ssh(`${SMB} -c 'ls AutoFileBackup/PAD2-S6-01/' 2>&1 || true`));
  console.log('残留清单：\n' + remain);
}

console.log('== /tmp 测试中间产物清理 ==');
const tmpOut = ssh(`rm -f /tmp/ws-xlsx.xlsx /tmp/ws-xls.xls /tmp/s601-50m.bin /tmp/ws-a.txt /tmp/rt*.xlsx /tmp/rt*.xls /tmp/rt*.bin /tmp/rt*.txt /tmp/s601v.bin /tmp/preset-xlsx*.xlsx /tmp/preset-xls*.xls /tmp/s604-preset-*.xlsx /tmp/s604-preset-*.xls /tmp/s601-e13.csv /tmp/s601-e13.xlsx /tmp/s601-e14.csv /tmp/s601-e14.xls /tmp/s601c*.csv /tmp/s601c*.xlsx /tmp/s601w.csv /tmp/s601w.xls /tmp/s601w-rt.* /tmp/s601-fix01-assets.tar.gz /tmp/pad2-fix01-assets.tar.gz 2>&1; ls /tmp | grep -cE 'ws-|s601|s604|preset' || echo 0`);
console.log(`残留中间产物计数: ${String(tmpOut).trim().split('\n').pop()}`);

console.log('== 预置原件终态 SHA 核验 ==');
ssh(`cd /tmp`);
const getOut = ssh(`${SMB} -c 'get "AutoFileBackup/新建 XLSX 工作表.xlsx" /tmp/s604-final-x.xlsx; get "AutoFileBackup/新建 XLS 工作表.xls" /tmp/s604-final-x.xls' 2>&1 || true`);
const sha = String(ssh(`sha256sum /tmp/s604-final-x.xlsx /tmp/s604-final-x.xls 2>/dev/null`));
console.log(sha.trim());
ssh(`rm -f /tmp/s604-final-x.xlsx /tmp/s604-final-x.xls`);
const ok1 = sha.includes('4e313e3f65fb3d031a5ecf2a9c2c4d761bbef76428cdbf2217ea4ab31426b47c');
const ok2 = sha.includes('dddea581a85cbcd2d5667b53ab88e19e1ad9619b045dac1055069a8cfe558463');
console.log(`预置原件零触碰核验: xlsx=${ok1 ? 'PASS' : 'FAIL'} xls=${ok2 ? 'PASS' : 'FAIL'}`);
process.exit(ok1 && ok2 ? 0 : 1);