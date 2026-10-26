/**
 * 凭据加密（design.md D-07、2.6.2-F）
 * Web Crypto：PBKDF2（310k 迭代 + 随机盐）派生密钥 + AES-GCM 加解密。
 * crypto.subtle 特性检测——不可用时返回降级标记（null），
 * 调用方须禁用"记住密码"选项（R-06 缓解），不崩溃。
 * 存储格式：base64(salt) + '.' + base64(iv) + '.' + base64(ciphertext)
 */
import { Preferences } from '@capacitor/preferences';

const MASTER_KEY_PREF = 'pad2.crypto.master.v1';
const PBKDF2_ITERATIONS = 310_000;

/** subtle 可用性（lazy 检测；WebView 需安全上下文） */
export async function isCryptoAvailable(): Promise<boolean> {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  );
}

async function getMasterKeyMaterial(): Promise<Uint8Array> {
  const { value } = await Preferences.get({ key: MASTER_KEY_PREF });
  if (value) {
    const decoded = base64ToBytes(value);
    if (decoded.byteLength === 32) return decoded;
  }
  const fresh = new Uint8Array(32);
  crypto.getRandomValues(fresh);
  await Preferences.set({ key: MASTER_KEY_PREF, value: bytesToBase64(fresh) });
  return fresh;
}

async function deriveKey(
  master: Uint8Array,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    master as unknown as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** 加密密码 → "salt.iv.ciphertext"（base64）；降级时返回 null（调用方禁用记住密码） */
export async function encryptPassword(password: string): Promise<string | null> {
  if (!(await isCryptoAvailable())) return null;
  try {
    const salt = new Uint8Array(16);
    const iv = new Uint8Array(12);
    crypto.getRandomValues(salt);
    crypto.getRandomValues(iv);
    const master = await getMasterKeyMaterial();
    const key = await deriveKey(master, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
      key,
      new TextEncoder().encode(password) as unknown as ArrayBuffer,
    );
    return [
      bytesToBase64(salt),
      bytesToBase64(iv),
      bytesToBase64(new Uint8Array(ciphertext)),
    ].join('.');
  } catch {
    return null;
  }
}

/** 解密 "salt.iv.ciphertext" → 明文密码；失败/降级返回 null */
export async function decryptPassword(encrypted: string): Promise<string | null> {
  if (!(await isCryptoAvailable())) return null;
  try {
    const [saltB64, ivB64, dataB64] = encrypted.split('.');
    if (!saltB64 || !ivB64 || !dataB64) return null;
    const salt = base64ToBytes(saltB64);
    const iv = base64ToBytes(ivB64);
    const data = base64ToBytes(dataB64);
    const master = await getMasterKeyMaterial();
    const key = await deriveKey(master, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
      key,
      data as unknown as ArrayBuffer,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}