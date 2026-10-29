#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { parseArgs } from './au004-lib/args.mjs';
import { CONFIG } from './au004-lib/config.mjs';
import { sshExec } from './au004-lib/ssh-exec.mjs';
import { smbTestConnection, smbTestWrite } from './au004-lib/smb-client.mjs';
import { computeFingerprint, redactLog, redactObject } from './au004-lib/redact.mjs';
import { writeEvidence, writeRawEvidence } from './au004-lib/evidence.mjs';
import { adbPushCredential, adbReadCredential } from './au004-lib/adb-deploy.mjs';
import { isCredentialRotated, recordRotation, getCredentialFingerprint } from './au004-lib/state-check.mjs';
import { saveRollbackPoint, rollbackCredentialRotation } from './au004-lib/rollback.mjs';
import { nowIso } from './au004-lib/timestamp.mjs';

const TOOL_NAME = 'au004-rotate-cred.mjs';
const USAGE = '[--help] [--dry-run] [--execute] [--verbose]';

async function main() {
  const args = parseArgs(TOOL_NAME, USAGE, process.argv);
  const verbose = args.verbose;

  const newPassword = process.env[CONFIG.envVars.newPassword];
  const oldPassword = process.env[CONFIG.envVars.oldPassword];
  const operator = process.env[CONFIG.envVars.operator] || 'unknown';

  console.log(`[${nowIso()}] AU-004 WP-A Credential Rotation Tool`);
  console.log(`Mode: ${args.execute ? 'EXECUTE' : args.dryRun ? 'DRY-RUN' : 'READ-ONLY AUDIT'}`);
  console.log(`Operator: ${operator}`);
  console.log('');

  if (isCredentialRotated() && !args.dryRun) {
    console.log('Credential rotation already completed. (Idempotent — skipping)');
    console.log('To re-run, clear the state file: docs/au004/au004-state.json');
    return;
  }

  console.log('=== Step 1: Read-only Audit ===');
  const credFingerprint = getCredentialFingerprint();
  console.log(`Current credential fingerprint: ${credFingerprint || '(old password not provided)'}`);

  let leakFound = false;
  try {
    const gitResult = execFileSync('git', ['log', '--all', '--oneline'], { encoding: 'utf8', timeout: 5000 });
    leakFound = gitResult.includes(CONFIG.git.leakCommit);
  } catch {}
  console.log(`Historical leak commit ${CONFIG.git.leakCommit}: ${leakFound ? 'found in local history' : 'not found'}`);

  const deviceCred = adbReadCredential();
  if (deviceCred.success) {
    console.log(`Device credential file: exists (username: ${deviceCred.credential.username})`);
  } else {
    console.log(`Device credential file: not found or unreadable`);
  }
  console.log('');

  if (!args.execute && !args.dryRun) {
    console.log('=== Read-only Audit Complete ===');
    console.log('No changes made. Use --execute to perform rotation, or --dry-run to preview.');
    return;
  }

  if (args.dryRun) {
    console.log('=== Dry Run Preview ===');
    console.log('Would perform:');
    console.log('  1. SSH remote password rotation (smbpasswd)');
    console.log('  2. New credential SMB connection verification');
    console.log('  3. Old credential SMB connection verification (expect failure)');
    if (newPassword) {
      console.log(`  4. Device update_cred.json deployment (ADB push)`);
    } else {
      console.log(`  4. Device deployment SKIPPED (PAD2_SMB_NEW_PASSWORD not set)`);
    }
    console.log('  5. Evidence archive generation');
    return;
  }

  if (!newPassword) {
    console.error('ERROR: PAD2_SMB_NEW_PASSWORD environment variable not set.');
    console.error('Set it before running with --execute:');
    console.error('  export PAD2_SMB_NEW_PASSWORD=<new_password>');
    process.exit(1);
  }

  if (!oldPassword) {
    console.error('ERROR: PAD2_SMB_OLD_PASSWORD environment variable not set.');
    console.error('Set it before running with --execute:');
    console.error('  export PAD2_SMB_OLD_PASSWORD=<current_password>');
    process.exit(1);
  }

  console.log('=== Step 2: Diff Preview ===');
  console.log(`Old credential fingerprint: ${computeFingerprint(oldPassword)}`);
  console.log(`New credential fingerprint: ${computeFingerprint(newPassword)}`);
  console.log('');

  console.log('=== Step 3: SSH Remote Password Rotation ===');
  saveRollbackPoint('credential-rotation', { oldPasswordFingerprint: computeFingerprint(oldPassword) });

  const rotateCmd = `sudo smbpasswd -a -s ${CONFIG.git.leakUsername} <<EOF\n${newPassword}\n${newPassword}\nEOF`;
  const rotateResult = sshExec(rotateCmd, { verbose });

  if (!rotateResult.success) {
    console.error(`Rotation FAILED: ${rotateResult.errorType}`);
    console.log('Attempting rollback...');
    const rollbackResult = rollbackCredentialRotation(oldPassword, { verbose });
    if (rollbackResult.success) {
      console.log('Rollback successful — old password restored.');
    } else {
      console.error('Rollback FAILED — manual intervention required!');
    }
    recordRotation({ status: 'FAILED', error: rotateResult.errorType, rollback: rollbackResult.success });
    process.exit(1);
  }

  console.log('Password rotation command succeeded.');
  console.log('');

  console.log('=== Step 4: New Credential Verification ===');
  const newCredTest = smbTestConnection({
    host: CONFIG.ssh.host, share: CONFIG.smb.share,
    username: CONFIG.git.leakUsername, password: newPassword, path: CONFIG.smb.testPath,
  }, 'ls', { verbose });

  if (!newCredTest.success) {
    console.error(`New credential verification FAILED: ${newCredTest.errorType}`);
    console.log('Attempting rollback...');
    const rollbackResult = rollbackCredentialRotation(oldPassword, { verbose });
    recordRotation({ status: 'FAILED', error: 'NEW_CRED_VERIFY_FAILED', rollback: rollbackResult.success });
    process.exit(1);
  }

  console.log('New credential verified — SMB connection successful.');
  console.log('');

  console.log('=== Step 5: Old Credential Revocation Verification ===');
  const oldCredTest = smbTestConnection({
    host: CONFIG.ssh.host, share: CONFIG.smb.share,
    username: CONFIG.git.leakUsername, password: oldPassword, path: CONFIG.smb.testPath,
  }, 'ls', { verbose });

  if (oldCredTest.success) {
    console.error('WARNING: Old credential is STILL ACTIVE — revocation not confirmed!');
    console.error('This may be due to SMB session caching. Try:');
    console.error('  sudo smbcontrol all close-share');
    recordRotation({ status: 'PARTIAL', error: 'OLD_CRED_STILL_ACTIVE', newCredVerified: true, oldCredRevoked: false });
  } else {
    console.log('Old credential revoked — SMB connection with old password failed as expected.');
    recordRotation({ status: 'SUCCESS', newCredVerified: true, oldCredRevoked: true });
  }
  console.log('');

  console.log('=== Step 6: Device Credential Deployment ===');
  const newDeviceCred = {
    host: CONFIG.ssh.host,
    share: CONFIG.smb.share,
    path: 'apk',
    username: CONFIG.git.leakUsername,
    password: newPassword,
    domain: '',
  };

  const deployResult = adbPushCredential(newDeviceCred, { verbose });
  if (deployResult.success) {
    console.log('Device credential file deployed and verified.');
  } else {
    console.error(`Device deployment FAILED: ${deployResult.error}`);
    console.error('Rotation succeeded but device not updated. Manual deployment required:');
    console.error(`  adb push update_cred.json ${CONFIG.adb.credFilePath}`);
  }
  console.log('');

  console.log('=== Step 7: Evidence Archive ===');
  const evidenceData = {
    rotationRecord: {
      oldCredentialFingerprint: computeFingerprint(oldPassword),
      newCredentialFingerprint: computeFingerprint(newPassword),
      rotationStatus: oldCredTest.success ? 'PARTIAL' : 'SUCCESS',
      newCredentialUsable: true,
      oldCredentialRevoked: !oldCredTest.success,
    },
    verificationResults: {
      newCredentialTest: { success: newCredTest.success, output: newCredTest.output },
      oldCredentialTest: { success: oldCredTest.success, output: oldCredTest.output, expectedFailure: !oldCredTest.success },
    },
    deviceDeployment: {
      success: deployResult.success,
      error: deployResult.error || null,
    },
    closureSuggestion: oldCredTest.success ? 'EVIDENCE_INCOMPLETE' : 'READY_FOR_REVIEW',
    notice: 'This is a closure SUGGESTION, not a GAP closure. GAP closure requires PM and Gate Reviewer independent confirmation.',
  };

  const evidencePath = writeEvidence('GAP-01', evidenceData);
  console.log(`GAP-01 evidence written: ${evidencePath}`);

  const revocationPath = writeEvidence('GAP-02', {
    revocationVerification: {
      oldCredentialConnectionAttempt: oldCredTest.success ? 'SUCCESS' : 'FAILED',
      revocationConfirmed: !oldCredTest.success,
      attemptLog: oldCredTest.output,
    },
    closureSuggestion: oldCredTest.success ? 'EVIDENCE_INCOMPLETE' : 'READY_FOR_REVIEW',
    notice: 'This is a closure SUGGESTION, not a GAP closure.',
  });
  console.log(`GAP-02 evidence written: ${revocationPath}`);
  console.log('');

  console.log('=== Rotation Complete ===');
  console.log(`Status: ${oldCredTest.success ? 'PARTIAL (old credential still active)' : 'SUCCESS'}`);
  console.log(`Evidence: ${evidencePath}, ${revocationPath}`);
  if (!oldCredTest.success) {
    console.log('');
    console.log('GAP-01/GAP-02 closure suggestion: READY_FOR_REVIEW');
    console.log('NOTE: This is a suggestion, not a closure. PM and Gate Reviewer must independently confirm.');
  }
}

main().catch(err => {
  console.error(`Fatal error: ${redactLog(err.message)}`);
  process.exit(1);
});