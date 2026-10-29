import { randomBytes } from 'node:crypto';

export function nowIso() {
  return new Date().toISOString();
}

export function generateId(prefix) {
  const ts = nowIso().replace(/[-:.]/g, '').replace('T', 'T');
  const rand = randomBytes(3).toString('hex');
  return `${prefix}-${ts}-${rand}`;
}