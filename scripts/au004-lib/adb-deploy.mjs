import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { CONFIG } from './config.mjs';

function adb(args, options = {}) {
  const timeout = options.timeout || 15000;
  try {
    const stdout = execFileSync(CONFIG.adb.path, args, {
      timeout,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10,
      windowsHide: true,
      env: { ...process.env, MSYS_NO_PATHCONV: '1' },
    });
    return { stdout: stdout.trim(), stderr: '', exitCode: 0, success: true };
  } catch (err) {
    return {
      stdout: err.stdout ? err.stdout.toString().trim() : '',
      stderr: err.stderr ? err.stderr.toString().trim() : '',
      exitCode: err.status || -1,
      success: false,
    };
  }
}

export function adbPushCredential(credJson, options = {}) {
  const verbose = options.verbose || false;
  const tmpFile = join(homedir(), 'AppData', 'Local', 'Temp', `update_cred_${Date.now()}.json`);

  writeFileSync(tmpFile, JSON.stringify(credJson, null, 2), 'utf8');

  if (verbose) {
    console.log(`[ADB] Pushing credential file to device...`);
  }

  const pushResult = adb(['-s', CONFIG.adb.device, 'push', tmpFile, CONFIG.adb.credFilePath]);
  if (!pushResult.success) {
    unlinkSync(tmpFile);
    return { success: false, error: 'PUSH_FAILED', details: pushResult.stderr };
  }

  const verifyResult = adb(['-s', CONFIG.adb.device, 'shell', 'cat', CONFIG.adb.credFilePath]);
  unlinkSync(tmpFile);

  if (!verifyResult.success) {
    return { success: false, error: 'VERIFY_FAILED', details: verifyResult.stderr };
  }

  try {
    const deployed = JSON.parse(verifyResult.stdout);
    if (deployed.username !== credJson.username || deployed.host !== credJson.host) {
      return { success: false, error: 'CONTENT_MISMATCH' };
    }
  } catch {
    return { success: false, error: 'JSON_PARSE_FAILED' };
  }

  return { success: true, message: 'Credential file deployed and verified' };
}

export function adbReadCredential() {
  const result = adb(['-s', CONFIG.adb.device, 'shell', 'cat', CONFIG.adb.credFilePath]);
  if (!result.success) {
    return { success: false, error: 'READ_FAILED', details: result.stderr };
  }
  try {
    return { success: true, credential: JSON.parse(result.stdout) };
  } catch {
    return { success: false, error: 'JSON_PARSE_FAILED' };
  }
}

export function adbDeviceOnline() {
  const result = adb(['devices']);
  return result.success && result.stdout.includes(CONFIG.adb.device) && result.stdout.includes('device');
}