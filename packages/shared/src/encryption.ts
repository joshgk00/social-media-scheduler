import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  version: number;
}

export function encrypt(
  plaintext: string,
  key: Buffer,
  version: number = 1,
): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
    version,
  };
}

export function decrypt(
  ciphertext: string,
  iv: string,
  authTag: string,
  key: Buffer,
): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'hex'),
    { authTagLength: AUTH_TAG_LENGTH },
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export function validateEncryptionKey(hexKey: string): Buffer {
  if (typeof hexKey !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return Buffer.from(hexKey, 'hex');
}
