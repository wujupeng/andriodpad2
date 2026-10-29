import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from './config.mjs';
import { nowIso } from './timestamp.mjs';
import { sshExec } from './ssh-exec.mjs';
import { computeFingerprint } from './redact.mjs';

const ROLLBACK_FILE = join(CONFIG.evidence.dir, 'au004-rollback-state.json');

export function saveRollbackPoint(operation, state) {
  const rollbackData = {
    timestamp: nowIso(),
    operation,
    state,
  };
  writeFileSync(ROLLBACK_FILE, JSON.stringify(rollbackData, null, 2) + '\n', 'utf8');
  return ROLLBACK_FILE;
}

export function loadRollbackPoint() {
  if (!existsSync(ROLLBACK_FILE)) {
    return null;
  }
  return JSON.parse(readFileSync(ROLLBACK_FILE, 'utf8'));
}

export function rollbackCredentialRotation(oldPassword, options = {}) {
  const verbose = options.verbose || false;

  if (verbose) {
    console.log('[ROLLBACK] Restoring old SMB password...');
  }

  const result = sshExec(`sudo smbpasswd -a -s debian <<EOF
${oldPassword}
${oldPassword}
EOF`, { verbose });

  if (!result.success) {
    return { success: false, error: 'ROLLBACK_FAILED', details: result.stderr };
  }

  return { success: true, message: 'Credential rotation rolled back' };
}

export function rollbackPermissionChange(originalConfig, options = {}) {
  const verbose = options.verbose || false;

  if (verbose) {
    console.log('[ROLLBACK] Restoring original SMB permissions...');
  }

  if (!originalConfig) {
    return { success: false, error: 'NO_ORIGINAL_CONFIG' };
  }

  const tmpFile = `/tmp/au004-rollback-smb.conf`;
  const escapedOriginal = originalConfig.replace(/'/g, "'\\''");
  const chattrResult = sshExec(`sudo lsattr ${CONFIG.smb.configPath} 2>/dev/null`, { verbose: false });
  const wasImmutable = chattrResult.stdout && chattrResult.stdout.includes('i');
  if (wasImmutable) sshExec(`sudo chattr -i ${CONFIG.smb.configPath}`, { verbose: false });
  const writeResult = sshExec(`sudo cp ${CONFIG.smb.configPath} ${tmpFile}.bak && echo '${escapedOriginal}' > /tmp/au004-rollback-new.conf && sudo cp /tmp/au004-rollback-new.conf ${CONFIG.smb.configPath} && rm -f /tmp/au004-rollback-new.conf`);
  if (!writeResult.success) {
    if (wasImmutable) sshExec(`sudo chattr +i ${CONFIG.smb.configPath}`, { verbose: false });
    return { success: false, error: 'CONFIG_WRITE_FAILED', details: writeResult.stderr };
  }
  if (wasImmutable) sshExec(`sudo chattr +i ${CONFIG.smb.configPath}`, { verbose: false });

  const reloadResult = sshExec('sudo smbcontrol all reload-config 2>/dev/null || sudo systemctl restart smbd 2>/dev/null');
  if (!reloadResult.success) {
    sshExec(`sudo cp ${tmpFile}.bak ${CONFIG.smb.configPath}`);
    return { success: false, error: 'RELOAD_FAILED', details: reloadResult.stderr };
  }

  return { success: true, message: 'Permission change rolled back' };
}

export function clearRollbackPoint() {
  if (existsSync(ROLLBACK_FILE)) {
    unlinkSync(ROLLBACK_FILE);
  }
}