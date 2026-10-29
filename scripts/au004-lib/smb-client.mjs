import { sshExec } from './ssh-exec.mjs';
import { CONFIG } from './config.mjs';
import { redactLog } from './redact.mjs';

export function smbTestConnection(credentials, operation = 'ls', options = {}) {
  const verbose = options.verbose || false;
  const { host, share, username, password, path } = credentials;
  const smbPath = path || CONFIG.smb.testPath;

  let smbCmd;
  if (operation === 'ls') {
    smbCmd = `cd ${smbPath};ls`;
  } else if (operation === 'read') {
    smbCmd = `cd ${smbPath};ls`;
  } else if (operation === 'write_test') {
    const testFile = `au004-write-test-${Date.now()}.txt`;
    smbCmd = `cd ${smbPath};put /dev/null ${testFile};ls ${testFile};del ${testFile}`;
  } else {
    smbCmd = operation;
  }

  const remoteCmd = `smbclient //localhost/${share} -U ${username}%${password} -c '${smbCmd}' -t 10 2>&1`;

  if (verbose) {
    console.log(`[SMB] Testing ${operation} on //${host}/${share}/${smbPath}`);
  }

  const result = sshExec(remoteCmd, { verbose });

  if (!result.success) {
    const output = result.stdout + ' ' + result.stderr;
    let errorType = 'CONNECTION_FAILED';

    if (output.includes('NT_STATUS_LOGON_FAILURE') || output.includes('AUTH_FAILED') || output.includes('NT_STATUS_ACCESS_DENIED')) {
      errorType = output.includes('NT_STATUS_ACCESS_DENIED') ? 'PERMISSION_DENIED' : 'AUTH_FAILED';
    } else if (result.errorType === 'TIMEOUT') {
      errorType = 'TIMEOUT';
    }

    return {
      success: false,
      output: redactLog(output),
      errorType,
    };
  }

  const output = result.stdout;
  if (output.includes('NT_STATUS_LOGON_FAILURE') || output.includes('NT_STATUS_ACCESS_DENIED')) {
    return {
      success: false,
      output: redactLog(output),
      errorType: output.includes('NT_STATUS_ACCESS_DENIED') ? 'PERMISSION_DENIED' : 'AUTH_FAILED',
    };
  }

  return {
    success: true,
    output: redactLog(output),
    errorType: null,
  };
}

export function smbTestWrite(credentials, options = {}) {
  const verbose = options.verbose || false;
  const { share, username, password } = credentials;
  const smbPath = credentials.path || CONFIG.smb.testPath;
  const testFile = `au004-write-test-${Date.now()}.txt`;

  const remoteCmd = `echo 'test' > /tmp/${testFile} && smbclient //localhost/${share} -U ${username}%${password} -c 'cd ${smbPath};put /tmp/${testFile} ${testFile}' -t 10 2>&1; rm -f /tmp/${testFile}`;

  if (verbose) {
    console.log(`[SMB] Testing WRITE on //${CONFIG.ssh.host}/${share}/${smbPath}`);
  }

  const result = sshExec(remoteCmd, { verbose });
  const output = result.stdout + (result.stderr ? ' ' + result.stderr : '');

  const writeSucceeded = output.includes('putting file') && !output.includes('NT_STATUS_ACCESS_DENIED');

  if (writeSucceeded) {
    sshExec(`sudo rm -f ${CONFIG.smb.publishPath}${testFile}`);
  }

  return {
    success: writeSucceeded,
    output: redactLog(output),
    errorType: writeSucceeded ? null : 'PERMISSION_DENIED',
  };
}