import { randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, validateEncryptionKey, type EncryptedPayload } from '../encryption.js';

const validKey = randomBytes(32);
const validHexKey = randomBytes(32).toString('hex');

describe('AES-256-GCM Encryption Module', () => {
  it('round-trips encrypt and decrypt correctly', () => {
    const payload = encrypt('my-secret-token', validKey);

    expect(payload.ciphertext).toBeTruthy();
    expect(payload.iv).toBeTruthy();
    expect(payload.authTag).toBeTruthy();
    expect(payload.version).toBe(1);

    const decrypted = decrypt(payload.ciphertext, payload.iv, payload.authTag, validKey);
    expect(decrypted).toBe('my-secret-token');
  });

  it('passes version parameter through to payload', () => {
    const payload = encrypt('token', validKey, 3);
    expect(payload.version).toBe(3);
  });

  it('throws on decrypt with wrong key', () => {
    const keyA = randomBytes(32);
    const keyB = randomBytes(32);
    const payload = encrypt('token', keyA);

    expect(() => {
      decrypt(payload.ciphertext, payload.iv, payload.authTag, keyB);
    }).toThrow();
  });

  it('generates unique IV for each encryption call', () => {
    const payload1 = encrypt('same-text', validKey);
    const payload2 = encrypt('same-text', validKey);

    expect(payload1.iv).not.toBe(payload2.iv);
    expect(payload1.ciphertext).not.toBe(payload2.ciphertext);
  });

  it('validates encryption key length and format', () => {
    expect(() => validateEncryptionKey('too-short')).toThrow(
      'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)',
    );

    const keyBuffer = validateEncryptionKey(validHexKey);
    expect(keyBuffer).toBeInstanceOf(Buffer);
    expect(keyBuffer.length).toBe(32);
  });

  it('round-trips empty plaintext', () => {
    const payload = encrypt('', validKey);
    const decrypted = decrypt(payload.ciphertext, payload.iv, payload.authTag, validKey);
    expect(decrypted).toBe('');
  });

  it('round-trips unicode plaintext', () => {
    const payload = encrypt('Hello World', validKey);
    const decrypted = decrypt(payload.ciphertext, payload.iv, payload.authTag, validKey);
    expect(decrypted).toBe('Hello World');
  });

  it('exports only stateless functions with no caching or memoization', async () => {
    const mod = await import('../encryption.js');
    const exportedKeys = Object.keys(mod);

    for (const key of exportedKeys) {
      const value = mod[key as keyof typeof mod];
      expect(typeof value === 'function' || typeof value === 'undefined').toBe(true);
    }

    expect(exportedKeys).not.toContain('cache');
    expect(exportedKeys).not.toContain('store');
    expect(exportedKeys).not.toContain('map');
    expect(exportedKeys).not.toContain('memoize');
  });

  describe('validateEncryptionKey', () => {
    const expectedError = 'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)';

    it('rejects 63-character hex string (off-by-one short)', () => {
      const short = 'a'.repeat(63);
      expect(() => validateEncryptionKey(short)).toThrow(expectedError);
    });

    it('rejects 65-character hex string (off-by-one long)', () => {
      const long = 'a'.repeat(65);
      expect(() => validateEncryptionKey(long)).toThrow(expectedError);
    });

    it('rejects invalid hex characters (64 g characters)', () => {
      const invalidHex = 'g'.repeat(64);
      expect(() => validateEncryptionKey(invalidHex)).toThrow(expectedError);
    });

    it('rejects empty string', () => {
      expect(() => validateEncryptionKey('')).toThrow(expectedError);
    });
  });
});
