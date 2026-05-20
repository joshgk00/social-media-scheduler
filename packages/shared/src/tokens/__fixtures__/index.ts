import type {
  EncryptedOAuth2Field,
  EncryptedTwitterFields,
  OAuth2Credentials,
  SafeProfile,
  TokenVault,
  TwitterCredentials,
} from '../types.js';

const defaultTwitterCredentials: TwitterCredentials = {
  kind: 'twitter',
  consumerKey: 'fake-consumer-key',
  consumerSecret: 'fake-consumer-secret',
  accessToken: 'fake-access-token',
  accessTokenSecret: 'fake-access-token-secret',
};

const defaultOAuth2Credentials: OAuth2Credentials = {
  kind: 'oauth2',
  accessToken: 'fake-oauth2-access-token',
};

const fakeEncryptedOAuth2Field: EncryptedOAuth2Field = {
  ciphertext: '00',
  iv: '11',
  authTag: '22',
};

const fakeEncryptedTwitterFields: EncryptedTwitterFields = {
  consumerKeyCiphertext: '00',
  consumerKeyIv: '11',
  consumerKeyAuthTag: '22',
  consumerSecretCiphertext: '33',
  consumerSecretIv: '44',
  consumerSecretAuthTag: '55',
  accessTokenCiphertext: '66',
  accessTokenIv: '77',
  accessTokenAuthTag: '88',
  accessTokenSecretCiphertext: '99',
  accessTokenSecretIv: 'aa',
  accessTokenSecretAuthTag: 'bb',
};

export function createFakeTokenVault(
  options: {
    twitter?: TwitterCredentials;
    oauth2?: OAuth2Credentials;
  } = {},
): TokenVault {
  const twitter = options.twitter ?? defaultTwitterCredentials;
  const oauth2 = options.oauth2 ?? defaultOAuth2Credentials;

  return {
    sealTwitter: () => fakeEncryptedTwitterFields,
    unsealTwitter: () => twitter,
    sealOAuth2: () => fakeEncryptedOAuth2Field,
    unsealOAuth2: () => oauth2,
    unsealForProfile: (profile) => (profile.platform === 'twitter' ? twitter : oauth2),
    toSafeProfile: (profile: SafeProfile) => ({
      platform: profile.platform,
      platformAccountId: profile.platformAccountId,
      linkedinAccountType: profile.linkedinAccountType,
    }),
  };
}
