import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from './config.mjs';
import { sshExec } from './ssh-exec.mjs';
import { computeFingerprint } from './redact.mjs';
import { nowIso } from './timestamp.mjs';

const STATE_FILE = join(CONFIG.evidence.dir, 'au004-state.json');

function loadState() {
  if (!existsSync(STATE_FILE)) {
    return { rotations: [], permissionChanges: [] };
  }
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { rotations: [], permissionChanges: [] };
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function isCredentialRotated() {
  const state = loadState();
  return state.rotations.length > 0 && state.rotations[state.rotations.length - 1].status === 'SUCCESS';
}

export function isPermissionTightened() {
  const state = loadState();
  return state.permissionChanges.length > 0 && state.permissionChanges[state.permissionChanges.length - 1].status === 'SUCCESS';
}

export function recordRotation(rotation) {
  const state = loadState();
  state.rotations.push({
    timestamp: nowIso(),
    ...rotation,
  });
  saveState(state);
}

export function recordPermissionChange(change) {
  const state = loadState();
  state.permissionChanges.push({
    timestamp: nowIso(),
    ...change,
  });
  saveState(state);
}

export function getCurrentSmbConfig() {
  const result = sshExec('sudo testparm -s 2>/dev/null');
  if (!result.success) {
    return { success: false, error: 'TESTPARM_FAILED' };
  }
  return { success: true, config: result.stdout };
}

export function getCredentialFingerprint() {
  const oldPassword = process.env[CONFIG.envVars.oldPassword];
  if (!oldPassword) {
    return null;
  }
  return computeFingerprint(oldPassword);
}