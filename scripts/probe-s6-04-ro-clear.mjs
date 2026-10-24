import { execFileSync } from 'node:child_process';
const remote = 'AutoFileBackup/PAD2-S6-01/ws-readonly.txt';
const unc = `\\\\192.168.2.247\\soft\\${remote.replace(/\//g, '\\')}`;
const script = `$f=[System.IO.FileInfo]"${unc}"; $f.IsReadOnly=$false; "CLEAR isRO=" + $f.IsReadOnly`;
try {
  const out = execFileSync('powershell', ['-Command', script], { encoding: 'utf8', timeout: 60000 });
  console.log(out.trim());
} catch (e) {
  console.log('EXEC_ERR=' + String(e.message).substring(0, 120));
}