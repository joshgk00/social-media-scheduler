import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../services/auth.service.js';

describe('hashPassword', () => {
  it('returns a string starting with $argon2id$', async () => {
    const hash = await hashPassword('test-password-123');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('produces different hashes for the same password (unique salts)', async () => {
    const hash1 = await hashPassword('test-password-123');
    const hash2 = await hashPassword('test-password-123');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPassword', () => {
  it('returns true for a correct password', async () => {
    const hash = await hashPassword('correct-password-12');
    const result = await verifyPassword(hash, 'correct-password-12');
    expect(result).toBe(true);
  });

  it('returns false for an incorrect password', async () => {
    const hash = await hashPassword('correct-password-12');
    const result = await verifyPassword(hash, 'wrong-password-1234');
    expect(result).toBe(false);
  });

  it('returns false for a malformed hash (no throw)', async () => {
    const result = await verifyPassword('not-a-valid-hash', 'any-password');
    expect(result).toBe(false);
  });

  it('returns false for an empty hash string', async () => {
    const result = await verifyPassword('', 'any-password');
    expect(result).toBe(false);
  });
});
