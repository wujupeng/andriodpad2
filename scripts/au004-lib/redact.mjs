import { createHash } from 'node:crypto';

export function computeFingerprint(credential) {
  return createHash('sha256').update(String(credential)).digest('hex');
}

const REDACT_PATTERNS = [
  { regex: /password\s*[=:]\s*\S+/gi, replacement: 'password=***' },
  { regex: /pwd\s*[=:]\s*\S+/gi, replacement: 'pwd=***' },
  { regex: /-U\s+(\S+)%\S+/gi, replacement: '-U $1%***' },
  { regex: /token\s*[=:]\s*\S+/gi, replacement: 'token=***' },
  { regex: /secret\s*[=:]\s*\S+/gi, replacement: 'secret=***' },
  { regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, replacement: '***PRIVATE KEY***' },
];

export function redactLog(text) {
  let result = String(text);
  for (const { regex, replacement } of REDACT_PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
}

const CREDENTIAL_FIELDS = new Set([
  'password', 'token', 'secret', 'key', 'oldPassword', 'newPassword',
  'privateKey', 'passphrase', 'credential',
]);

export function redactObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (CREDENTIAL_FIELDS.has(key)) {
      if (value !== null && value !== undefined && value !== '') {
        result[key] = computeFingerprint(value);
      } else {
        result[key] = value;
      }
    } else if (typeof value === 'object') {
      result[key] = redactObject(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}