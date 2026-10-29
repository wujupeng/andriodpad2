import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from './config.mjs';
import { nowIso, generateId } from './timestamp.mjs';
import { redactObject } from './redact.mjs';

export function writeEvidence(gapId, data, options = {}) {
  const dir = CONFIG.evidence.dir;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filename = CONFIG.evidence.gapFiles[gapId] || `${gapId.toLowerCase()}-evidence.json`;
  const filepath = join(dir, filename);

  const operator = process.env[CONFIG.envVars.operator] || 'unknown';
  const evidence = {
    packId: generateId(`AU004-${gapId}`),
    timestamp: nowIso(),
    operator,
    gapId,
    ...redactObject(data),
    reviewerConfirmed: false,
  };

  writeFileSync(filepath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
  return filepath;
}

export function readEvidence(gapId) {
  const dir = CONFIG.evidence.dir;
  const filename = CONFIG.evidence.gapFiles[gapId] || `${gapId.toLowerCase()}-evidence.json`;
  const filepath = join(dir, filename);
  if (!existsSync(filepath)) {
    return null;
  }
  return JSON.parse(readFileSync(filepath, 'utf8'));
}

export function writeClosureSummary(gapResults) {
  const dir = CONFIG.evidence.dir;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filename = CONFIG.evidence.gapFiles['SUMMARY'];
  const filepath = join(dir, filename);
  const operator = process.env[CONFIG.envVars.operator] || 'unknown';

  const summary = {
    packId: generateId('AU004-GAP-CLOSURE'),
    timestamp: nowIso(),
    operator,
    gaps: gapResults.map(g => redactObject(g)),
    notice: 'This summary contains closure SUGGESTIONS, not GAP closures. GAP closure requires PM and Gate Reviewer independent confirmation.',
    reviewerConfirmed: false,
  };

  writeFileSync(filepath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  return filepath;
}

export function writeRawEvidence(filename, content) {
  const dir = CONFIG.evidence.dir;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filepath = join(dir, filename);
  writeFileSync(filepath, content, 'utf8');
  return filepath;
}