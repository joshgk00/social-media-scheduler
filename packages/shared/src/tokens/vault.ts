import { decrypt, encrypt } from '../encryption.js';
import type {
  CipherFieldValue,
  Credentials,
  EncryptedOAuth2Field,
  EncryptedTwitterFields,
  NullableEncryptedOAuth2Field,
  NullableEncryptedTwitterFields,
  OAuth2Credentials,
  ProfileWithEncryptedTokens,
  SafeProfile,
  TokenVault,
  TwitterCredentials,
} from './types.js';

const HEX_PATTERN = /^[0-9a-fA-F]+$/;

export class TokenVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenVaultError';
  }
}

function asRequiredHexString(value: CipherFieldValue | null | undefined, fieldName: string): string {
  if (value === null || value === undefined) {
    throw new TokenVaultError(`Missing encrypted token field: ${fieldName}`);
  }

  const hex = typeof value === 'string' ? value : value.toString('hex');
  if (hex.length === 0) {
    throw new TokenVaultError(`Missing encrypted token field: ${fieldName}`);
  }
  if (hex.length % 2 !== 0 || !HEX_PATTERN.test(hex)) {
    throw new TokenVaultError(`Invalid encrypted token field: ${fieldName}`);
  }
  return hex;
}

function sealField(plaintext: string, encryptionKey: Buffer): EncryptedOAuth2Field {
  const sealed = encrypt(plaintext, encryptionKey);
  return {
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    authTag: sealed.authTag,
  };
}

function unsealField(
  field: NullableEncryptedOAuth2Field,
  encryptionKey: Buffer,
  fieldName: string,
): string {
  const ciphertext = asRequiredHexString(field.ciphertext, `${fieldName}.ciphertext`);
  const iv = asRequiredHexString(field.iv, `${fieldName}.iv`);
  const authTag = asRequiredHexString(field.authTag, `${fieldName}.authTag`);

  try {
    return decrypt(ciphertext, iv, authTag, encryptionKey);
  } catch {
    throw new TokenVaultError(`Could not decrypt encrypted token field: ${fieldName}`);
  }
}

export function createTokenVault(encryptionKey: Buffer): TokenVault {
  function sealTwitter(credentials: TwitterCredentials): EncryptedTwitterFields {
    const consumerKey = sealField(credentials.consumerKey, encryptionKey);
    const consumerSecret = sealField(credentials.consumerSecret, encryptionKey);
    const accessToken = sealField(credentials.accessToken, encryptionKey);
    const accessTokenSecret = sealField(credentials.accessTokenSecret, encryptionKey);

    return {
      consumerKeyCiphertext: consumerKey.ciphertext,
      consumerKeyIv: consumerKey.iv,
      consumerKeyAuthTag: consumerKey.authTag,
      consumerSecretCiphertext: consumerSecret.ciphertext,
      consumerSecretIv: consumerSecret.iv,
      consumerSecretAuthTag: consumerSecret.authTag,
      accessTokenCiphertext: accessToken.ciphertext,
      accessTokenIv: accessToken.iv,
      accessTokenAuthTag: accessToken.authTag,
      accessTokenSecretCiphertext: accessTokenSecret.ciphertext,
      accessTokenSecretIv: accessTokenSecret.iv,
      accessTokenSecretAuthTag: accessTokenSecret.authTag,
    };
  }

  function unsealTwitter(fields: NullableEncryptedTwitterFields): TwitterCredentials {
    return {
      kind: 'twitter',
      consumerKey: unsealField(
        {
          ciphertext: fields.consumerKeyCiphertext,
          iv: fields.consumerKeyIv,
          authTag: fields.consumerKeyAuthTag,
        },
        encryptionKey,
        'consumerKey',
      ),
      consumerSecret: unsealField(
        {
          ciphertext: fields.consumerSecretCiphertext,
          iv: fields.consumerSecretIv,
          authTag: fields.consumerSecretAuthTag,
        },
        encryptionKey,
        'consumerSecret',
      ),
      accessToken: unsealField(
        {
          ciphertext: fields.accessTokenCiphertext,
          iv: fields.accessTokenIv,
          authTag: fields.accessTokenAuthTag,
        },
        encryptionKey,
        'accessToken',
      ),
      accessTokenSecret: unsealField(
        {
          ciphertext: fields.accessTokenSecretCiphertext,
          iv: fields.accessTokenSecretIv,
          authTag: fields.accessTokenSecretAuthTag,
        },
        encryptionKey,
        'accessTokenSecret',
      ),
    };
  }

  function sealOAuth2(credentials: OAuth2Credentials): EncryptedOAuth2Field {
    return sealField(credentials.accessToken, encryptionKey);
  }

  function sealOAuth2AccessToken(token: string): EncryptedOAuth2Field {
    return sealField(token, encryptionKey);
  }

  function sealOAuth2RefreshToken(token: string): EncryptedOAuth2Field {
    return sealField(token, encryptionKey);
  }

  function unsealOAuth2(field: NullableEncryptedOAuth2Field): OAuth2Credentials {
    return {
      kind: 'oauth2',
      accessToken: unsealField(field, encryptionKey, 'oauth2AccessToken'),
    };
  }

  function unsealOAuth2RefreshToken(profile: ProfileWithEncryptedTokens): string {
    return unsealField(
      {
        ciphertext: profile.oauth2RefreshTokenCiphertext,
        iv: profile.oauth2RefreshTokenIv,
        authTag: profile.oauth2RefreshTokenAuthTag,
      },
      encryptionKey,
      'oauth2RefreshToken',
    );
  }

  function unsealForProfile(profile: ProfileWithEncryptedTokens): Credentials {
    if (profile.platform === 'twitter') {
      return unsealTwitter(profile);
    }
    if (profile.platform === 'linkedin' || profile.platform === 'facebook') {
      return unsealOAuth2({
        ciphertext: profile.oauth2AccessTokenCiphertext,
        iv: profile.oauth2AccessTokenIv,
        authTag: profile.oauth2AccessTokenAuthTag,
      });
    }
    throw new TokenVaultError(`Unsupported token platform: ${String(profile.platform)}`);
  }

  function toSafeProfile(profile: SafeProfile): SafeProfile {
    return {
      platform: profile.platform,
      platformAccountId: profile.platformAccountId,
      linkedinAccountType: profile.linkedinAccountType,
    };
  }

  return {
    sealTwitter,
    unsealTwitter,
    sealOAuth2,
    sealOAuth2AccessToken,
    sealOAuth2RefreshToken,
    unsealOAuth2,
    unsealOAuth2RefreshToken,
    unsealForProfile,
    toSafeProfile,
  };
}
