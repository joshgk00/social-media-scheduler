import { describe, it } from 'vitest';

describe('profile.service', () => {
  describe('createProfile', () => {
    it.todo('encrypts all 4 credential fields independently using AES-256-GCM');
    it.todo('stores IV and authTag alongside ciphertext for each credential');
    it.todo('sets tokenEncryptionVersion to 1 on new profiles');
    it.todo('calls Twitter GET /2/users/me to validate credentials before storing');
    it.todo('stores displayName, handle, and avatarUrl from Twitter response');
    it.todo('throws descriptive error when Twitter validation fails');
    it.todo('does not insert into DB when Twitter validation fails');
    it.todo('prevents duplicate profiles for same platform_user_id per user');
    it.todo('never logs credential values in any code path');
  });

  describe('getProfiles', () => {
    it.todo('returns profiles without credential ciphertext, IV, or authTag columns');
    it.todo('only returns profiles belonging to the authenticated user');
  });

  describe('deleteProfile', () => {
    it.todo('deletes profile by id and userId');
    it.todo('returns false when profile does not exist');
  });
});
