import { validateEncryptionKey } from '@sms/shared';
import {
  createTokenVault as createSharedTokenVault,
} from '@sms/shared/tokens';

interface SealedTokenField {
  ciphertext: string;
  iv: string;
  authTag: string;
}

function asSealedTokenField(field: {
  ciphertext: string | Buffer;
  iv: string | Buffer;
  authTag: string | Buffer;
}): SealedTokenField {
  return {
    ciphertext: typeof field.ciphertext === 'string'
      ? field.ciphertext
      : field.ciphertext.toString('hex'),
    iv: typeof field.iv === 'string' ? field.iv : field.iv.toString('hex'),
    authTag: typeof field.authTag === 'string' ? field.authTag : field.authTag.toString('hex'),
  };
}

interface TwitterCredentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export interface SealedTwitterCredentials {
  consumerKey: SealedTokenField;
  consumerSecret: SealedTokenField;
  accessToken: SealedTokenField;
  accessTokenSecret: SealedTokenField;
}

export interface TokenVault {
  sealTwitterCredentials(credentials: TwitterCredentials): SealedTwitterCredentials;
  sealOAuth2AccessToken(token: string): SealedTokenField;
  sealOAuth2RefreshToken(token: string): SealedTokenField;
}

export function createTokenVault(rawEncryptionKey: string): TokenVault {
  const sharedVault = createSharedTokenVault(validateEncryptionKey(rawEncryptionKey));

  return {
    sealTwitterCredentials(credentials) {
      const sealed = sharedVault.sealTwitter({ kind: 'twitter', ...credentials });
      return {
        consumerKey: asSealedTokenField({
          ciphertext: sealed.consumerKeyCiphertext,
          iv: sealed.consumerKeyIv,
          authTag: sealed.consumerKeyAuthTag,
        }),
        consumerSecret: asSealedTokenField({
          ciphertext: sealed.consumerSecretCiphertext,
          iv: sealed.consumerSecretIv,
          authTag: sealed.consumerSecretAuthTag,
        }),
        accessToken: asSealedTokenField({
          ciphertext: sealed.accessTokenCiphertext,
          iv: sealed.accessTokenIv,
          authTag: sealed.accessTokenAuthTag,
        }),
        accessTokenSecret: asSealedTokenField({
          ciphertext: sealed.accessTokenSecretCiphertext,
          iv: sealed.accessTokenSecretIv,
          authTag: sealed.accessTokenSecretAuthTag,
        }),
      };
    },
    sealOAuth2AccessToken(token) {
      return asSealedTokenField(sharedVault.sealOAuth2AccessToken(token));
    },
    sealOAuth2RefreshToken(token) {
      return asSealedTokenField(sharedVault.sealOAuth2RefreshToken(token));
    },
  };
}
