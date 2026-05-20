import {
  encrypt,
  validateEncryptionKey,
  type EncryptedPayload,
} from '@sms/shared/encryption';

interface TwitterCredentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export interface SealedTwitterCredentials {
  consumerKey: EncryptedPayload;
  consumerSecret: EncryptedPayload;
  accessToken: EncryptedPayload;
  accessTokenSecret: EncryptedPayload;
}

export interface TokenVault {
  sealTwitterCredentials(credentials: TwitterCredentials): SealedTwitterCredentials;
  sealOAuth2AccessToken(token: string): EncryptedPayload;
  sealOAuth2RefreshToken(token: string): EncryptedPayload;
}

export function createTokenVault(rawEncryptionKey: string): TokenVault {
  const encryptionKey = validateEncryptionKey(rawEncryptionKey);

  return {
    sealTwitterCredentials(credentials) {
      return {
        consumerKey: encrypt(credentials.consumerKey, encryptionKey, 1),
        consumerSecret: encrypt(credentials.consumerSecret, encryptionKey, 1),
        accessToken: encrypt(credentials.accessToken, encryptionKey, 1),
        accessTokenSecret: encrypt(credentials.accessTokenSecret, encryptionKey, 1),
      };
    },
    sealOAuth2AccessToken(token) {
      return encrypt(token, encryptionKey, 1);
    },
    sealOAuth2RefreshToken(token) {
      return encrypt(token, encryptionKey, 1);
    },
  };
}
