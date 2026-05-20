export type CipherFieldValue = string | Buffer;
export type NullableCipherFieldValue = CipherFieldValue | null | undefined;

export type TwitterCredentials = {
  kind: 'twitter';
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

export type OAuth2Credentials = {
  kind: 'oauth2';
  accessToken: string;
};

export type Credentials = TwitterCredentials | OAuth2Credentials;

export type TokenPlatform = 'twitter' | 'linkedin' | 'facebook';

export interface SafeProfile {
  platform: TokenPlatform;
  platformAccountId: string | null;
  linkedinAccountType: 'person' | 'organization';
}

export interface EncryptedOAuth2Field {
  ciphertext: CipherFieldValue;
  iv: CipherFieldValue;
  authTag: CipherFieldValue;
}

export interface EncryptedTwitterFields {
  consumerKeyCiphertext: CipherFieldValue;
  consumerKeyIv: CipherFieldValue;
  consumerKeyAuthTag: CipherFieldValue;
  consumerSecretCiphertext: CipherFieldValue;
  consumerSecretIv: CipherFieldValue;
  consumerSecretAuthTag: CipherFieldValue;
  accessTokenCiphertext: CipherFieldValue;
  accessTokenIv: CipherFieldValue;
  accessTokenAuthTag: CipherFieldValue;
  accessTokenSecretCiphertext: CipherFieldValue;
  accessTokenSecretIv: CipherFieldValue;
  accessTokenSecretAuthTag: CipherFieldValue;
}

export type NullableEncryptedOAuth2Field = {
  [Key in keyof EncryptedOAuth2Field]?: NullableCipherFieldValue;
};

export type NullableEncryptedTwitterFields = {
  [Key in keyof EncryptedTwitterFields]?: NullableCipherFieldValue;
};

export interface OAuth2ProfileTokenFields {
  oauth2AccessTokenCiphertext?: NullableCipherFieldValue;
  oauth2AccessTokenIv?: NullableCipherFieldValue;
  oauth2AccessTokenAuthTag?: NullableCipherFieldValue;
}

export type ProfileWithEncryptedTokens = SafeProfile &
  NullableEncryptedTwitterFields &
  OAuth2ProfileTokenFields;

export interface TokenVault {
  sealTwitter(credentials: TwitterCredentials): EncryptedTwitterFields;
  unsealTwitter(fields: NullableEncryptedTwitterFields): TwitterCredentials;
  sealOAuth2(credentials: OAuth2Credentials): EncryptedOAuth2Field;
  unsealOAuth2(field: NullableEncryptedOAuth2Field): OAuth2Credentials;
  unsealForProfile(profile: ProfileWithEncryptedTokens): Credentials;
  toSafeProfile(profile: SafeProfile): SafeProfile;
}
