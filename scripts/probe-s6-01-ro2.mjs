import { execFileSync } from 'node:child_process';
const SSH_KEY = process.env.HOME + '/.ssh/pad2_cred_closure';
const SMB = `timeout 90 smbclient //192.168.2.247/soft -U guest%`;
const D = 'AutoFileBackup/PAD2-S6-01';

function ssh(cmd) {
  return execFileSync('ssh', ['-i', SSH_KEY, 'debian@192.168.2.3', cmd], { encoding: 'utf8', timeout: 180000 });
}
function setReadOnly(remote, ro) {
  const unc = `\\\\192.168.2.247\\soft\\${remote.replace(/\//g, '\\')}`;
  const script = `$f=[System.IO.FileInfo]"${unc}"; $f.IsReadOnly=${ro ? 'true' : 'false'}; "SET " + $f.IsReadOnly`;
  try {
    const out = execFileSync('powershell', ['-Command', script], { encoding: 'utf8', timeout: 60000 });
    console.log(`  [RO ${ro}] out="${String(out).trim()}"`);
    return true;
  } catch (e) {
    console.log(`  [RO ${ro}] EXEC_ERR="${String(e.message).substring(0, 150)}"`);
    return false;
  }
}

const put = ssh(`${SMB} -c 'put /tmp/ws-a.txt ${D}/ws-readonly.txt' 2>&1 || true`);
console.log('put =', String(put).trim().split('\n')[0]);
await new Promise((r) => setTimeout(r, 3000));
setReadOnly(`${D}/ws-readonly.txt`, true);
const ls1 = ssh(`${SMB} -c 'ls ${D}/' 2>&1 || true`);
console.log('attr after setRO =', (String(ls1).match(/ws-readonly\.txt\s+\S+/) || ['NOT_MATCHED'])[0]);
await new Promise((r) => setTimeout(r, 3000));
const ls2 = ssh(`${SMB} -c 'ls ${D}/' 2>&1 || true`);
console.log('attr after +3s   =', (String(ls2).match(/ws-readonly\.txt\s+\S+/) || ['NOT_MATCHED'])[0]);
setReadOnly(`${D}/ws-readonly.txt`, true);
const ls3 = ssh(`${SMB} -c 'ls ${D}/' 2>&1 || true`);
console.log('attr after 2nd RO =', (String(ls3).match(/ws-readonly\.txt\s+\S+/) || ['NOT_MATCHED'])[0]);