import { describe, it, expect } from 'vitest';
import * as OTPAuth from 'otpauth';
import { generateTotpSecret, verifyTotpCode } from '../services/totp.service.js';

describe('generateTotpSecret', () => {
  it('returns an object with secret and uri', () => {
    const result = generateTotpSecret('test@example.com');
    expect(result).toHaveProperty('secret');
    expect(result).toHaveProperty('uri');
    expect(typeof result.secret).toBe('string');
    expect(typeof result.uri).toBe('string');
  });

  it('uri starts with otpauth://totp/', () => {
    const result = generateTotpSecret('test@example.com');
    expect(result.uri).toMatch(/^otpauth:\/\/totp\//);
  });

  it('uri contains the issuer', () => {
    const result = generateTotpSecret('test@example.com');
    expect(result.uri).toContain('Social%20Media%20Scheduler');
  });

  it('secret is base32 encoded', () => {
    const result = generateTotpSecret('test@example.com');
    expect(result.secret).toMatch(/^[A-Z2-7]+=*$/);
  });
});

describe('verifyTotpCode', () => {
  function generateValidCode(secret: string): string {
    const totp = new OTPAuth.TOTP({
      issuer: 'Social Media Scheduler',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    return totp.generate();
  }

  it('returns true for a valid code at current time', () => {
    const { secret } = generateTotpSecret('test@example.com');
    const validCode = generateValidCode(secret);
    expect(verifyTotpCode(secret, validCode)).toBe(true);
  });

  it('returns false for a wrong code', () => {
    const { secret } = generateTotpSecret('test@example.com');
    expect(verifyTotpCode(secret, '000000')).toBe(false);
  });

  it('returns false for an empty string', () => {
    const { secret } = generateTotpSecret('test@example.com');
    expect(verifyTotpCode(secret, '')).toBe(false);
  });
});
