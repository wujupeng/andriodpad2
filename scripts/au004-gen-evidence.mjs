#!/usr/bin/env node
import { parseArgs } from './au004-lib/args.mjs';
import { CONFIG } from './au004-lib/config.mjs';
import { readEvidence, writeEvidence, writeClosureSummary, writeRawEvidence } from './au004-lib/evidence.mjs';
import { redactObject, redactLog } from './au004-lib/redact.mjs';
import { nowIso, generateId } from './au004-lib/timestamp.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TOOL_NAME = 'au004-gen-evidence.mjs';
const USAGE = '[--help] [--dry-run] [--verbose]';

async function main() {
  const args = parseArgs(TOOL_NAME, USAGE, process.argv);
  const verbose = args.verbose;
  const operator = process.env[CONFIG.envVars.operator] || 'unknown';

  console.log(`[${nowIso()}] AU-004 WP-C Evidence Generation Tool`);
  console.log(`Mode: ${args.dryRun ? 'DRY-RUN' : 'GENERATE'}`);
  console.log(`Operator: ${operator}`);
  console.log('');

  console.log('=== Step 1: Collect WP-A Rotation Records ===');
  const gap01 = readEvidence('GAP-01');
  const gap02 = readEvidence('GAP-02');
  if (gap01) {
    console.log(`GAP-01 evidence found: ${gap01.packId}`);
    console.log(`  Rotation status: ${gap01.rotationRecord?.rotationStatus || 'N/A'}`);
    console.log(`  New credential verified: ${gap01.rotationRecord?.newCredentialUsable || 'N/A'}`);
  } else {
    console.log('GAP-01 evidence: NOT FOUND (rotation may not have been executed)');
  }
  if (gap02) {
    console.log(`GAP-02 evidence found: ${gap02.packId}`);
    console.log(`  Revocation confirmed: ${gap02.revocationVerification?.revocationConfirmed || 'N/A'}`);
  } else {
    console.log('GAP-02 evidence: NOT FOUND');
  }
  console.log('');

  console.log('=== Step 2: Collect WP-B Permission Records ===');
  const gap03 = readEvidence('GAP-03');
  const gap04 = readEvidence('GAP-04');
  if (gap03) {
    console.log(`GAP-03 evidence found: ${gap03.packId}`);
    console.log(`  Permission diff changes: ${gap03.permissionDiff?.changes?.length || 0} items`);
  } else {
    console.log('GAP-03 evidence: NOT FOUND (permission tightening may not have been executed)');
  }
  if (gap04) {
    console.log(`GAP-04 evidence found: ${gap04.packId}`);
    console.log(`  Server-side verified: ${gap04.serverSideVerification?.readTest?.success && !gap04.serverSideVerification?.writeTest?.success || false}`);
  } else {
    console.log('GAP-04 evidence: NOT FOUND');
  }
  console.log('');

  console.log('=== Step 3: Verify Evidence Completeness ===');
  const gapResults = [];
  const gaps = [
    { id: 'GAP-01', evidence: gap01, description: 'Credential rotation' },
    { id: 'GAP-02', evidence: gap02, description: 'Old credential revocation' },
    { id: 'GAP-03', evidence: gap03, description: 'SMB permission tightening' },
    { id: 'GAP-04', evidence: gap04, description: 'Permission tightening verification' },
  ];

  for (const gap of gaps) {
    let suggestion = 'EVIDENCE_INCOMPLETE';
    let details = {};

    if (gap.evidence) {
      if (gap.id === 'GAP-01') {
        const verified = gap.evidence.rotationRecord?.newCredentialUsable === true;
        suggestion = verified ? 'READY_FOR_REVIEW' : 'VERIFICATION_FAILED';
        details = { newCredentialUsable: verified };
      } else if (gap.id === 'GAP-02') {
        const revoked = gap.evidence.revocationVerification?.revocationConfirmed === true;
        suggestion = revoked ? 'READY_FOR_REVIEW' : 'VERIFICATION_FAILED';
        details = { oldCredentialRevoked: revoked };
      } else if (gap.id === 'GAP-03') {
        const hasDiff = gap.evidence.permissionDiff?.changes?.length > 0;
        const archiveOk = gap.evidence.archiveDirAccess?.success === true;
        suggestion = (hasDiff && archiveOk) ? 'READY_FOR_REVIEW' : 'VERIFICATION_FAILED';
        details = { hasDiff, archiveAccessible: archiveOk };
      } else if (gap.id === 'GAP-04') {
        const readOk = gap.evidence.serverSideVerification?.readTest?.success === true;
        const writeDenied = gap.evidence.serverSideVerification?.writeTest?.success === false;
        suggestion = (readOk && writeDenied) ? 'READY_FOR_REVIEW' : 'VERIFICATION_FAILED';
        details = { readSuccess: readOk, writeDenied };
      }
    }

    gapResults.push({
      gapId: gap.id,
      description: gap.description,
      evidenceFound: !!gap.evidence,
      closureSuggestion: suggestion,
      details,
      reviewerConfirmed: false,
    });

    console.log(`${gap.id} (${gap.description}): ${suggestion}`);
  }
  console.log('');

  console.log('=== Step 4: Generate GAP Closure Summary ===');
  const summaryPath = writeClosureSummary(gapResults);
  console.log(`Closure summary written: ${summaryPath}`);
  console.log('');

  console.log('=== Step 5: List All Evidence Files ===');
  const evidenceDir = CONFIG.evidence.dir;
  if (existsSync(evidenceDir)) {
    const files = readdirSync(evidenceDir).filter(f => f.endsWith('.json') || f.endsWith('.txt'));
    for (const f of files) {
      const stat = readFileSync(join(evidenceDir, f), 'utf8');
      const size = stat.length;
      console.log(`  ${f} (${size} bytes)`);
    }
  }
  console.log('');

  console.log('=== Evidence Generation Complete ===');
  const readyCount = gapResults.filter(g => g.closureSuggestion === 'READY_FOR_REVIEW').length;
  console.log(`GAPs READY_FOR_REVIEW: ${readyCount}/4`);
  console.log(`Summary: ${summaryPath}`);
  console.log('');
  console.log('NOTE: These are closure SUGGESTIONS, not GAP closures.');
  console.log('GAP closure requires PM and Gate Reviewer independent confirmation.');
  console.log('AU-004 tool capability completion ≠ GAP closure ≠ production release authorization.');
}

main().catch(err => {
  console.error(`Fatal error: ${redactLog(err.message)}`);
  process.exit(1);
});