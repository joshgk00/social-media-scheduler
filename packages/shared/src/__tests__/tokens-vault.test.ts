import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  TokenVaultError,
  createTokenVault,
  type EncryptedOAuth2Field,
  type EncryptedTwitterFields,
  type ProfileWithEncryptedTokens,
} from '../tokens/index.js';
import { createFakeTokenVault } from '../tokens/__fixtures__/index.js';

const encryptionKey = randomBytes(32);

function baseProfile(platform: ProfileWithEncryptedTokens['platform']): ProfileWithEncryptedTokens {
  return {
    platform,
    platformAccountId: platform === 'twitter' ? null : 'acct-1',
    linkedinAccountType: 'person',
  };
}

function twitterProfile(fields: EncryptedTwitterFields): ProfileWithEncryptedTokens {
  return {
    ...baseProfile('twitter'),
    ...fields,
  };
}

function oauth2Profile(
  platform: 'linkedin' | 'facebook',
  field: EncryptedOAuth2Field,
): ProfileWithEncryptedTokens {
  return {
    ...baseProfile(platform),
    oauth2AccessTokenCiphertext: field.ciphertext,
    oauth2AccessTokenIv: field.iv,
    oauth2AccessTokenAuthTag: field.authTag,
  };
}

describe('TokenVault', () => {
  it('round-trips Twitter credentials and returns all four plaintext fields', () => {
    const vault = createTokenVault(encryptionKey);
    const sealed = vault.sealTwitter({
      kind: 'twitter',
      consumerKey: 'ck-value',
      consumerSecret: 'cs-value',
      accessToken: 'at-value',
      accessTokenSecret: 'ats-value',
    });

    expect(vault.unsealTwitter(sealed)).toEqual({
      kind: 'twitter',
      consumerKey: 'ck-value',
      consumerSecret: 'cs-value',
      accessToken: 'at-value',
      accessTokenSecret: 'ats-value',
    });
  });

  it('round-trips OAuth 2.0 access tokens', () => {
    const vault = createTokenVault(encryptionKey);
    const sealed = vault.sealOAuth2({
      kind: 'oauth2',
      accessToken: 'oauth2-access-token',
    });

    expect(vault.unsealOAuth2(sealed)).toEqual({
      kind: 'oauth2',
      accessToken: 'oauth2-access-token',
    });
  });

  it('dispatches unsealForProfile by platform', () => {
    const vault = createTokenVault(encryptionKey);
    const twitter = vault.sealTwitter({
      kind: 'twitter',
      consumerKey: 'ck',
      consumerSecret: 'cs',
      accessToken: 'at',
      accessTokenSecret: 'ats',
    });
    const linkedin = vault.sealOAuth2({
      kind: 'oauth2',
      accessToken: 'li-token',
    });
    const facebook = vault.sealOAuth2({
      kind: 'oauth2',
      accessToken: 'fb-token',
    });

    expect(vault.unsealForProfile(twitterProfile(twitter))).toMatchObject({
      kind: 'twitter',
      accessTokenSecret: 'ats',
    });
    expect(vault.unsealForProfile(oauth2Profile('linkedin', linkedin))).toEqual({
      kind: 'oauth2',
      accessToken: 'li-token',
    });
    expect(vault.unsealForProfile(oauth2Profile('facebook', facebook))).toEqual({
      kind: 'oauth2',
      accessToken: 'fb-token',
    });
  });

  it('throws on missing Twitter and OAuth 2.0 cipher fields', () => {
    const vault = createTokenVault(encryptionKey);
    const twitter = vault.sealTwitter({
      kind: 'twitter',
      consumerKey: 'ck',
      consumerSecret: 'cs',
      accessToken: 'at',
      accessTokenSecret: 'ats',
    });
    const oauth2 = vault.sealOAuth2({
      kind: 'oauth2',
      accessToken: 'oauth2-token',
    });

    expect(() => {
      vault.unsealTwitter({ ...twitter, consumerSecretAuthTag: null });
    }).toThrow('Missing encrypted token field: consumerSecret.authTag');
    expect(() => {
      vault.unsealOAuth2({ ...oauth2, authTag: undefined });
    }).toThrow('Missing encrypted token field: oauth2AccessToken.authTag');
    expect(() => {
      vault.unsealOAuth2({ ...oauth2, ciphertext: '' });
    }).toThrow('Missing encrypted token field: oauth2AccessToken.ciphertext');
  });

  it('normalizes Buffer cipher fields to hex strings before unsealing', () => {
    const vault = createTokenVault(encryptionKey);
    const sealed = vault.sealOAuth2({
      kind: 'oauth2',
      accessToken: 'buffer-backed-token',
    });

    expect(
      vault.unsealOAuth2({
        ciphertext: Buffer.from(sealed.ciphertext, 'hex'),
        iv: Buffer.from(sealed.iv, 'hex'),
        authTag: Buffer.from(sealed.authTag, 'hex'),
      }),
    ).toEqual({
      kind: 'oauth2',
      accessToken: 'buffer-backed-token',
    });
  });

  it('normalizes Buffer-backed Twitter cipher fields before unsealing', () => {
    const vault = createTokenVault(encryptionKey);
    const credentials = {
      kind: 'twitter' as const,
      consumerKey: 'buffer-ck',
      consumerSecret: 'buffer-cs',
      accessToken: 'buffer-at',
      accessTokenSecret: 'buffer-ats',
    };
    const sealed = vault.sealTwitter(credentials);

    expect(
      vault.unsealTwitter({
        consumerKeyCiphertext: Buffer.from(sealed.consumerKeyCiphertext, 'hex'),
        consumerKeyIv: Buffer.from(sealed.consumerKeyIv, 'hex'),
        consumerKeyAuthTag: Buffer.from(sealed.consumerKeyAuthTag, 'hex'),
        consumerSecretCiphertext: Buffer.from(sealed.consumerSecretCiphertext, 'hex'),
        consumerSecretIv: Buffer.from(sealed.consumerSecretIv, 'hex'),
        consumerSecretAuthTag: Buffer.from(sealed.consumerSecretAuthTag, 'hex'),
        accessTokenCiphertext: Buffer.from(sealed.accessTokenCiphertext, 'hex'),
        accessTokenIv: Buffer.from(sealed.accessTokenIv, 'hex'),
        accessTokenAuthTag: Buffer.from(sealed.accessTokenAuthTag, 'hex'),
        accessTokenSecretCiphertext: Buffer.from(sealed.accessTokenSecretCiphertext, 'hex'),
        accessTokenSecretIv: Buffer.from(sealed.accessTokenSecretIv, 'hex'),
        accessTokenSecretAuthTag: Buffer.from(sealed.accessTokenSecretAuthTag, 'hex'),
      }),
    ).toEqual(credentials);
  });

  it('throws contextual TokenVaultError for invalid, tampered, and unsupported inputs', () => {
    const vault = createTokenVault(encryptionKey);
    const sealed = vault.sealOAuth2({
      kind: 'oauth2',
      accessToken: 'oauth2-token',
    });

    expect(() => vault.unsealOAuth2({ ...sealed, iv: 'not-hex' })).toThrow(
      'Invalid encrypted token field: oauth2AccessToken.iv',
    );
    expect(() => vault.unsealOAuth2({ ...sealed, iv: 'zz' })).toThrow(
      'Invalid encrypted token field: oauth2AccessToken.iv',
    );
    expect(() => vault.unsealOAuth2({ ...sealed, authTag: '00'.repeat(16) })).toThrow(
      'Could not decrypt encrypted token field: oauth2AccessToken',
    );
    expect(() =>
      vault.unsealForProfile({
        ...baseProfile('twitter'),
        platform: 'mastodon' as ProfileWithEncryptedTokens['platform'],
      }),
    ).toThrow('Unsupported token platform: mastodon');
  });

  it('projects SafeProfile without cipher fields', () => {
    const vault = createTokenVault(encryptionKey);
    const sealed = vault.sealOAuth2({
      kind: 'oauth2',
      accessToken: 'oauth2-token',
    });

    expect(vault.toSafeProfile(oauth2Profile('linkedin', sealed))).toEqual({
      platform: 'linkedin',
      platformAccountId: 'acct-1',
      linkedinAccountType: 'person',
    });
  });
});

describe('createFakeTokenVault', () => {
  it('returns configured credentials without requiring crypto setup', () => {
    const vault = createFakeTokenVault({
      twitter: {
        kind: 'twitter',
        consumerKey: 'fake-ck',
        consumerSecret: 'fake-cs',
        accessToken: 'fake-at',
        accessTokenSecret: 'fake-ats',
      },
      oauth2: {
        kind: 'oauth2',
        accessToken: 'fake-oauth2',
      },
    });

    expect(vault.unsealForProfile(baseProfile('twitter'))).toMatchObject({
      kind: 'twitter',
      consumerKey: 'fake-ck',
    });
    expect(vault.unsealForProfile(baseProfile('facebook'))).toEqual({
      kind: 'oauth2',
      accessToken: 'fake-oauth2',
    });
    expect(vault.unsealOAuth2({})).toEqual({
      kind: 'oauth2',
      accessToken: 'fake-oauth2',
    });
    expect(vault.sealOAuth2({ kind: 'oauth2', accessToken: 'ignored' })).toEqual({
      ciphertext: '00',
      iv: '11',
      authTag: '22',
    });
    expect(vault.toSafeProfile(baseProfile('linkedin'))).toEqual({
      platform: 'linkedin',
      platformAccountId: 'acct-1',
      linkedinAccountType: 'person',
    });
    expect(vault.sealTwitter({
      kind: 'twitter',
      consumerKey: 'ignored',
      consumerSecret: 'ignored',
      accessToken: 'ignored',
      accessTokenSecret: 'ignored',
    })).toMatchObject({
      consumerKeyCiphertext: '00',
    });
    expect(vault.unsealTwitter({})).toMatchObject({
      kind: 'twitter',
      accessTokenSecret: 'fake-ats',
    });
    expect(() =>
      vault.unsealForProfile({
        ...baseProfile('twitter'),
        platform: 'mastodon' as ProfileWithEncryptedTokens['platform'],
      }),
    ).toThrow('Unsupported token platform: mastodon');
  });

  it('uses default fake credentials', () => {
    const vault = createFakeTokenVault();

    expect(vault.unsealForProfile(baseProfile('twitter'))).toMatchObject({
      kind: 'twitter',
      consumerKey: 'fake-consumer-key',
    });
    expect(vault.unsealForProfile(baseProfile('linkedin'))).toEqual({
      kind: 'oauth2',
      accessToken: 'fake-oauth2-access-token',
    });
  });

  it('exports a TokenVaultError class for caller-safe error mapping', () => {
    expect(new TokenVaultError('message')).toBeInstanceOf(Error);
  });
});
