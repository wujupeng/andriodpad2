import { execFileSync } from 'node:child_process';
const remote = 'AutoFileBackup/PAD2-S6-01/ws-readonly.txt';
const unc = `\\\\192.168.2.247\\soft\\${remote.replace(/\//g, '\\')}`;
console.log('unc =', JSON.stringify(unc));
const script = `$f=[System.IO.FileInfo]"${unc}"; $f.IsReadOnly=$true; "SET " + $f.IsReadOnly`;
console.log('script =', JSON.stringify(script));
try {
  const out = execFileSync('powershell', ['-Command', script], { encoding: 'utf8', timeout: 60000 });
  console.log('out =', out.trim());
} catch (e) {
  console.log('EXEC_ERR =', e.message.substring(0, 200));
}