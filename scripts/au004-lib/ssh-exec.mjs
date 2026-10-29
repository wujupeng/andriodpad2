import { execFileSync } from 'node:child_process';
import { CONFIG } from './config.mjs';
import { redactLog } from './redact.mjs';

export function sshExec(command, options = {}) {
  const timeout = options.timeout || CONFIG.ssh.commandTimeout;
  const verbose = options.verbose || false;
  const sshArgs = [
    '-i', CONFIG.ssh.keyPath,
    '-o', `ConnectTimeout=${CONFIG.ssh.connectTimeout}`,
    '-o', 'StrictHostKeyChecking=no',
    `${CONFIG.ssh.user}@${CONFIG.ssh.host}`,
    command,
  ];

  if (verbose) {
    console.log(`[SSH] ${redactLog(command)}`);
  }

  try {
    const stdout = execFileSync('ssh', sshArgs, {
      timeout,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10,
      windowsHide: true,
    });
    return {
      stdout: stdout.trim(),
      stderr: '',
      exitCode: 0,
      success: true,
      errorType: null,
    };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    const stdout = err.stdout ? err.stdout.toString().trim() : '';
    let errorType = 'COMMAND_FAILED';

    if (err.killed || (err.signal === 'SIGTERM')) {
      errorType = 'TIMEOUT';
    } else if (stderr.includes('Permission denied') || stderr.includes('permission denied')) {
      errorType = 'PERMISSION_DENIED';
    } else if (stderr.includes('Connection refused') || stderr.includes('Could not resolve hostname') || stderr.includes('Connection timed out') || stderr.includes('No route to host')) {
      errorType = 'CONNECT_FAILED';
    }

    if (verbose) {
      console.log(`[SSH] FAILED: ${errorType} — ${redactLog(stderr)}`);
    }

    return {
      stdout,
      stderr: redactLog(stderr),
      exitCode: err.status || -1,
      success: false,
      errorType,
    };
  }
}