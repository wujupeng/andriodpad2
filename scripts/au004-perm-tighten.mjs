#!/usr/bin/env node
import { parseArgs } from './au004-lib/args.mjs';
import { CONFIG } from './au004-lib/config.mjs';
import { sshExec } from './au004-lib/ssh-exec.mjs';
import { smbTestConnection, smbTestWrite } from './au004-lib/smb-client.mjs';
import { redactLog, redactObject } from './au004-lib/redact.mjs';
import { writeEvidence } from './au004-lib/evidence.mjs';
import { isPermissionTightened, recordPermissionChange } from './au004-lib/state-check.mjs';
import { saveRollbackPoint, rollbackPermissionChange } from './au004-lib/rollback.mjs';
import { nowIso } from './au004-lib/timestamp.mjs';

const TOOL_NAME = 'au004-perm-tighten.mjs';
const USAGE = '[--help] [--dry-run] [--execute] [--verbose]';

async function main() {
  const args = parseArgs(TOOL_NAME, USAGE, process.argv);
  const verbose = args.verbose;
  const operator = process.env[CONFIG.envVars.operator] || 'unknown';

  console.log(`[${nowIso()}] AU-004 WP-B SMB Permission Tightening Tool`);
  console.log(`Mode: ${args.execute ? 'EXECUTE' : args.dryRun ? 'DRY-RUN' : 'READ-ONLY AUDIT'}`);
  console.log(`Operator: ${operator}`);
  console.log('');

  if (isPermissionTightened() && !args.dryRun) {
    console.log('Permission tightening already completed. (Idempotent — skipping)');
    console.log('To re-run, clear the state file: docs/au004/au004-state.json');
    return;
  }

  console.log('=== Step 1: Read-only Permission Detection ===');
  const configResult = sshExec(`sudo cat ${CONFIG.smb.configPath}`, { verbose });
  if (!configResult.success) {
    console.error(`Failed to read SMB config: ${configResult.errorType}`);
    process.exit(1);
  }

  const testparmResult = sshExec('sudo testparm -s 2>/dev/null', { verbose });
  console.log('Current smb.conf:');
  console.log(configResult.stdout.split('\n').map(l => '  ' + l).join('\n'));
  console.log('');

  const shareSection = extractShareSection(configResult.stdout);
  console.log('Current [share] permissions:');
  console.log(`  path: ${shareSection.path}`);
  console.log(`  writable: ${shareSection.writable}`);
  console.log(`  read only: ${shareSection.readOnly}`);
  console.log(`  valid users: ${shareSection.validUsers}`);
  console.log('');

  const targetConfig = {
    path: shareSection.path,
    writable: 'no',
    readOnly: 'yes',
    validUsers: 'debian',
    browseable: 'yes',
    guestOk: 'no',
    forceUser: 'debian',
    createMask: '0666',
    directoryMask: '0777',
  };

  console.log('=== Step 2: Permission Diff Preview ===');
  console.log('Changes:');
  console.log(`  writable: ${shareSection.writable} → ${targetConfig.writable}`);
  console.log(`  read only: ${shareSection.readOnly} → ${targetConfig.readOnly}`);
  console.log(`  valid users: ${shareSection.validUsers} → ${targetConfig.validUsers}`);
  console.log('');

  if (!args.execute && !args.dryRun) {
    console.log('=== Read-only Audit Complete ===');
    console.log('No changes made. Use --execute to tighten permissions, or --dry-run to preview.');
    return;
  }

  if (args.dryRun) {
    console.log('=== Dry Run Preview ===');
    console.log('Would perform:');
    console.log('  1. Backup current smb.conf');
    console.log('  2. Set [share] read only = yes, writable = no');
    console.log('  3. Reload SMB config (smbcontrol all reload-config)');
    console.log('  4. Server-side verification (read success + write fail)');
    console.log('  5. Archive directory access verification');
    console.log('  6. Main flow regression smoke test');
    return;
  }

  const oldPassword = process.env[CONFIG.envVars.oldPassword];
  if (!oldPassword) {
    console.error('ERROR: PAD2_SMB_OLD_PASSWORD environment variable not set.');
    console.error('Required for server-side verification after tightening.');
    process.exit(1);
  }

  console.log('=== Step 3: Backup and Apply Permission Tightening ===');
  const backupResult = sshExec(`sudo cp ${CONFIG.smb.configPath} ${CONFIG.smb.configPath}.au004-bak`, { verbose });
  if (!backupResult.success) {
    console.error(`Backup failed: ${backupResult.errorType}`);
    process.exit(1);
  }
  console.log('Backup created.');

  saveRollbackPoint('permission-tightening', { originalConfig: configResult.stdout });

  const newShareConfig = `[share]
   path = ${shareSection.path}
   browseable = yes
   writable = no
   guest ok = no
   valid users = debian
   force user = debian
   read only = yes
   create mask = 0666
   directory mask = 0777
   force create mode = 0666
   force directory mode = 0777`;

  const originalShareBlock = extractShareBlock(configResult.stdout);
  const newConfig = configResult.stdout.replace(originalShareBlock, newShareConfig);
  const escapedConfig = newConfig.replace(/'/g, "'\\''");

  const chattrCheck = sshExec(`sudo lsattr ${CONFIG.smb.configPath} 2>/dev/null`, { verbose: false });
  const isImmutable = chattrCheck.stdout && chattrCheck.stdout.includes('i');
  if (isImmutable) {
    console.log('Detected immutable attribute on smb.conf, removing temporarily...');
    sshExec(`sudo chattr -i ${CONFIG.smb.configPath}`, { verbose });
  }

  const applyResult = sshExec(`echo '${escapedConfig}' > /tmp/au004-smb-new.conf && sudo cp /tmp/au004-smb-new.conf ${CONFIG.smb.configPath} && rm -f /tmp/au004-smb-new.conf`, { verbose });
  if (!applyResult.success) {
    console.error(`Config write failed: ${applyResult.errorType}`);
    sshExec(`sudo cp ${CONFIG.smb.configPath}.au004-bak ${CONFIG.smb.configPath}`);
    if (isImmutable) sshExec(`sudo chattr +i ${CONFIG.smb.configPath}`, { verbose: false });
    process.exit(1);
  }
  console.log('Permission config applied.');

  if (isImmutable) {
    console.log('Restoring immutable attribute on smb.conf...');
    sshExec(`sudo chattr +i ${CONFIG.smb.configPath}`, { verbose });
  }

  const reloadResult = sshExec('sudo smbcontrol all reload-config 2>/dev/null || sudo systemctl restart smbd 2>/dev/null', { verbose });
  if (!reloadResult.success) {
    console.error(`Config reload failed: ${reloadResult.errorType}`);
    console.log('Rolling back...');
    rollbackPermissionChange(configResult.stdout, { verbose });
    recordPermissionChange({ status: 'FAILED', error: 'RELOAD_FAILED' });
    process.exit(1);
  }
  console.log('SMB config reloaded.');
  console.log('');

  console.log('=== Step 4: Server-side Permission Verification ===');
  const readTest = smbTestConnection({
    host: CONFIG.ssh.host, share: CONFIG.smb.share,
    username: 'debian', password: oldPassword, path: CONFIG.smb.testPath,
  }, 'ls', { verbose });

  console.log(`Read test: ${readTest.success ? 'SUCCESS (can read)' : 'FAILED'}`);

  const writeTest = smbTestWrite({
    host: CONFIG.ssh.host, share: CONFIG.smb.share,
    username: 'debian', password: oldPassword, path: CONFIG.smb.testPath,
  }, { verbose });

  console.log(`Write test: ${writeTest.success ? 'SUCCESS (write still allowed!)' : 'FAILED (write denied — correct!)'}`);

  if (!readTest.success || writeTest.success) {
    console.error('Permission verification FAILED — rolling back');
    rollbackPermissionChange(configResult.stdout, { verbose });
    recordPermissionChange({ status: 'FAILED', error: 'VERIFICATION_FAILED', readSuccess: readTest.success, writeDenied: !writeTest.success });
    process.exit(1);
  }
  console.log('');

  console.log('=== Step 5: Archive Directory Access Verification ===');
  const archiveTest = smbTestConnection({
    host: CONFIG.ssh.host, share: CONFIG.smb.share,
    username: 'debian', password: oldPassword, path: 'apk/dazongli',
  }, 'ls', { verbose });

  console.log(`Archive directory access: ${archiveTest.success ? 'SUCCESS' : 'FAILED'}`);
  if (!archiveTest.success) {
    console.error('Archive directory not accessible — rolling back');
    rollbackPermissionChange(configResult.stdout, { verbose });
    recordPermissionChange({ status: 'FAILED', error: 'ARCHIVE_ACCESS_FAILED' });
    process.exit(1);
  }
  console.log('');

  console.log('=== Step 6: Evidence Archive ===');
  const diffReport = {
    before: {
      writable: shareSection.writable,
      readOnly: shareSection.readOnly,
      validUsers: shareSection.validUsers,
    },
    after: {
      writable: 'no',
      readOnly: 'yes',
      validUsers: 'debian',
    },
    changes: [
      { field: 'writable', from: shareSection.writable, to: 'no' },
      { field: 'read only', from: shareSection.readOnly, to: 'yes' },
      { field: 'valid users', from: shareSection.validUsers, to: 'debian' },
    ],
  };

  const gap03Path = writeEvidence('GAP-03', {
    permissionDiff: diffReport,
    archiveDirAccess: { success: archiveTest.success },
    closureSuggestion: 'READY_FOR_REVIEW',
    notice: 'This is a closure SUGGESTION, not a GAP closure.',
  });
  console.log(`GAP-03 evidence: ${gap03Path}`);

  const gap04Path = writeEvidence('GAP-04', {
    serverSideVerification: {
      readTest: { success: readTest.success, output: readTest.output },
      writeTest: { success: writeTest.success, expectedFailure: !writeTest.success, output: writeTest.output },
    },
    verifiedByActualSmbOperation: true,
    closureSuggestion: 'READY_FOR_REVIEW',
    notice: 'This is a closure SUGGESTION, not a GAP closure.',
  });
  console.log(`GAP-04 evidence: ${gap04Path}`);

  recordPermissionChange({ status: 'SUCCESS', readVerified: true, writeDenied: true, archiveAccessible: true });
  console.log('');

  console.log('=== Permission Tightening Complete ===');
  console.log('Status: SUCCESS');
  console.log(`Evidence: ${gap03Path}, ${gap04Path}`);
  console.log('');
  console.log('GAP-03/GAP-04 closure suggestion: READY_FOR_REVIEW');
  console.log('NOTE: This is a suggestion, not a closure. PM and Gate Reviewer must independently confirm.');
}

function extractShareSection(config) {
  const lines = config.split('\n');
  let inShare = false;
  const section = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '[share]') { inShare = true; continue; }
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && inShare) break;
    if (!inShare) continue;
    const match = trimmed.match(/^(\w[\w\s]*)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (key === 'path') section.path = value;
      if (key === 'writable') section.writable = value;
      if (key === 'read only') section.readOnly = value;
      if (key === 'valid users') section.validUsers = value;
      if (key === 'browseable') section.browseable = value;
      if (key === 'guest ok') section.guestOk = value;
      if (key === 'force user') section.forceUser = value;
    }
  }
  return section;
}

function extractShareBlock(config) {
  const lines = config.split('\n');
  let start = -1, end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '[share]') { start = i; continue; }
    if (start >= 0 && lines[i].trim().startsWith('[') && lines[i].trim().endsWith(']')) { end = i; break; }
  }
  if (start < 0) return '';
  if (end < 0) end = lines.length;
  return lines.slice(start, end).join('\n');
}

main().catch(err => {
  console.error(`Fatal error: ${redactLog(err.message)}`);
  process.exit(1);
});