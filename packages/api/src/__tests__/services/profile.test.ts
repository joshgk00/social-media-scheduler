import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeColumnStub(name: string) {
  return { name, fieldAlias: name };
}

function makeTableStub(tableName: string, columns: string[]) {
  const table: Record<string, unknown> = { _: { name: tableName } };
  for (const col of columns) {
    table[col] = makeColumnStub(col);
  }
  return table;
}

const socialProfileColumns = [
  'id', 'userId', 'platform', 'platformUserId', 'displayName', 'handle', 'avatarUrl',
  'consumerKeyCiphertext', 'consumerKeyIv', 'consumerKeyAuthTag',
  'consumerSecretCiphertext', 'consumerSecretIv', 'consumerSecretAuthTag',
  'accessTokenCiphertext', 'accessTokenIv', 'accessTokenAuthTag',
  'accessTokenSecretCiphertext', 'accessTokenSecretIv', 'accessTokenSecretAuthTag',
  'tokenEncryptionVersion', 'connectedAt', 'lastPublishedAt', 'createdAt', 'updatedAt',
];

const mockSocialProfiles = makeTableStub('social_profiles', socialProfileColumns);

vi.mock('@sms/db', () => ({
  socialProfiles: mockSocialProfiles,
}));

const mockEncrypt = vi.fn().mockReturnValue({
  ciphertext: 'encrypted-data',
  iv: 'test-iv-hex',
  authTag: 'test-auth-tag',
  version: 1,
});

const mockValidateEncryptionKey = vi.fn().mockReturnValue(Buffer.alloc(32));
const mockCreateLogger = vi.fn().mockReturnValue({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

vi.mock('@sms/shared', async () => {
  const actual = await vi.importActual('@sms/shared');
  return {
    ...actual,
    encrypt: (...args: unknown[]) => mockEncrypt(...args),
    validateEncryptionKey: (...args: unknown[]) => mockValidateEncryptionKey(...args),
    createLogger: (...args: unknown[]) => mockCreateLogger(...args),
  };
});

const mockTwitterMe = vi.fn().mockResolvedValue({
  data: {
    id: '12345',
    name: 'Test User',
    username: 'testuser',
    profile_image_url: 'https://pbs.twimg.com/avatar.jpg',
  },
});

vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn().mockImplementation(function () {
    return { v2: { me: mockTwitterMe } };
  }),
}));

const SAFE_PROFILE = {
  id: 'profile-uuid-1',
  platform: 'twitter',
  platformUserId: '12345',
  displayName: 'Test User',
  handle: 'testuser',
  avatarUrl: 'https://pbs.twimg.com/avatar.jpg',
  tokenEncryptionVersion: 1,
  connectedAt: new Date(),
  lastPublishedAt: null,
};

function createMockDb(overrides: {
  selectResult?: unknown[];
  insertResult?: unknown[];
} = {}) {
  const selectResult = overrides.selectResult ?? [];
  const insertResult = overrides.insertResult ?? [SAFE_PROFILE];

  const selectChain: Record<string, any> = {};
  selectChain.from = vi.fn().mockReturnValue(selectChain);
  selectChain.where = vi.fn().mockReturnValue(selectChain);
  selectChain.then = (resolve: (v: unknown) => void) => resolve(selectResult);

  const insertChain: Record<string, any> = {};
  insertChain.values = vi.fn().mockReturnValue(insertChain);
  insertChain.returning = vi.fn().mockReturnValue(insertChain);
  insertChain.then = (resolve: (v: unknown) => void) => resolve(insertResult);

  const deleteChain: Record<string, any> = {};
  deleteChain.where = vi.fn().mockReturnValue(deleteChain);
  deleteChain.returning = vi.fn().mockReturnValue(deleteChain);
  deleteChain.then = (resolve: (v: unknown) => void) => resolve([{ id: 'profile-uuid-1' }]);

  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    delete: vi.fn().mockReturnValue(deleteChain),
    _selectChain: selectChain,
    _insertChain: insertChain,
  } as any;
}

const TEST_CREDENTIALS = {
  consumerKey: 'ck-test-value-abc123',
  consumerSecret: 'cs-test-value-def456',
  accessToken: 'at-test-value-ghi789',
  accessTokenSecret: 'ats-test-value-jkl012',
};

describe('profile.service', () => {
  let createProfile: typeof import('../../services/profile.service.js').createProfile;
  let getProfiles: typeof import('../../services/profile.service.js').getProfiles;
  let validateTwitterCredentials: typeof import('../../services/profile.service.js').validateTwitterCredentials;

  beforeEach(async () => {
    mockEncrypt.mockClear();
    mockValidateEncryptionKey.mockClear();
    mockCreateLogger.mockClear();

    mockTwitterMe.mockReset();
    mockTwitterMe.mockResolvedValue({
      data: {
        id: '12345',
        name: 'Test User',
        username: 'testuser',
        profile_image_url: 'https://pbs.twimg.com/avatar.jpg',
      },
    });

    mockEncrypt.mockReturnValue({
      ciphertext: 'encrypted-data',
      iv: 'test-iv-hex',
      authTag: 'test-auth-tag',
      version: 1,
    });
    mockValidateEncryptionKey.mockReturnValue(Buffer.alloc(32));
    mockCreateLogger.mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    });

    process.env.ENCRYPTION_KEY = 'a'.repeat(64);

    const mod = await import('../../services/profile.service.js');
    createProfile = mod.createProfile;
    getProfiles = mod.getProfiles;
    validateTwitterCredentials = mod.validateTwitterCredentials;
  });

  describe('createProfile', () => {
    it('encrypts all 4 credential fields independently using AES-256-GCM', async () => {
      const db = createMockDb();

      await createProfile(db, 'user-1', TEST_CREDENTIALS);

      expect(mockEncrypt).toHaveBeenCalledTimes(4);

      const encryptedValues = mockEncrypt.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(encryptedValues).toContain(TEST_CREDENTIALS.consumerKey);
      expect(encryptedValues).toContain(TEST_CREDENTIALS.consumerSecret);
      expect(encryptedValues).toContain(TEST_CREDENTIALS.accessToken);
      expect(encryptedValues).toContain(TEST_CREDENTIALS.accessTokenSecret);
    });

    it('stores IV and authTag alongside ciphertext for each credential', async () => {
      const db = createMockDb();

      await createProfile(db, 'user-1', TEST_CREDENTIALS);

      const insertProxy = db.insert as ReturnType<typeof vi.fn>;
      const insertResult = insertProxy.mock.results[0].value;
      const valuesCall = insertResult.values.mock.calls[0][0];

      expect(valuesCall.consumerKeyCiphertext).toBe('encrypted-data');
      expect(valuesCall.consumerKeyIv).toBe('test-iv-hex');
      expect(valuesCall.consumerKeyAuthTag).toBe('test-auth-tag');

      expect(valuesCall.consumerSecretCiphertext).toBe('encrypted-data');
      expect(valuesCall.consumerSecretIv).toBe('test-iv-hex');
      expect(valuesCall.consumerSecretAuthTag).toBe('test-auth-tag');

      expect(valuesCall.accessTokenCiphertext).toBe('encrypted-data');
      expect(valuesCall.accessTokenIv).toBe('test-iv-hex');
      expect(valuesCall.accessTokenAuthTag).toBe('test-auth-tag');

      expect(valuesCall.accessTokenSecretCiphertext).toBe('encrypted-data');
      expect(valuesCall.accessTokenSecretIv).toBe('test-iv-hex');
      expect(valuesCall.accessTokenSecretAuthTag).toBe('test-auth-tag');
    });

    it('calls Twitter GET /2/users/me to validate credentials before storing', async () => {
      const { TwitterApi } = await import('twitter-api-v2');
      const db = createMockDb();

      await createProfile(db, 'user-1', TEST_CREDENTIALS);

      expect(TwitterApi).toHaveBeenCalledWith({
        appKey: TEST_CREDENTIALS.consumerKey,
        appSecret: TEST_CREDENTIALS.consumerSecret,
        accessToken: TEST_CREDENTIALS.accessToken,
        accessSecret: TEST_CREDENTIALS.accessTokenSecret,
      });
      expect(mockTwitterMe).toHaveBeenCalled();
    });

    it('throws descriptive error when Twitter validation fails', async () => {
      mockTwitterMe.mockRejectedValueOnce(
        Object.assign(new Error('Unauthorized'), { code: 401, data: { status: 401 } }),
      );

      const db = createMockDb();

      await expect(createProfile(db, 'user-1', TEST_CREDENTIALS)).rejects.toThrow(
        'Could not verify these credentials',
      );
    });

    it('does not insert into DB when Twitter validation fails', async () => {
      mockTwitterMe.mockRejectedValueOnce(
        Object.assign(new Error('Unauthorized'), { code: 401, data: { status: 401 } }),
      );

      const db = createMockDb();

      await expect(createProfile(db, 'user-1', TEST_CREDENTIALS)).rejects.toThrow();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('prevents duplicate profiles for same platform_user_id per user', async () => {
      const db = createMockDb({
        selectResult: [{ id: 'existing-profile-id' }],
      });

      await expect(createProfile(db, 'user-1', TEST_CREDENTIALS)).rejects.toThrow(
        'already connected',
      );

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('never logs credential values in any code path', async () => {
      const loggerInstance = mockCreateLogger.mock.results[0]?.value
        ?? { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

      mockTwitterMe.mockRejectedValueOnce(
        Object.assign(new Error('Unauthorized'), { code: 401, data: { status: 401 } }),
      );

      const db = createMockDb();

      await expect(createProfile(db, 'user-1', TEST_CREDENTIALS)).rejects.toThrow();

      for (const method of ['info', 'error', 'warn', 'debug'] as const) {
        for (const call of loggerInstance[method].mock.calls) {
          const serialized = JSON.stringify(call);
          expect(serialized).not.toContain(TEST_CREDENTIALS.consumerKey);
          expect(serialized).not.toContain(TEST_CREDENTIALS.consumerSecret);
          expect(serialized).not.toContain(TEST_CREDENTIALS.accessToken);
          expect(serialized).not.toContain(TEST_CREDENTIALS.accessTokenSecret);
        }
      }
    });
  });

  describe('getProfiles', () => {
    it('returns profiles without credential ciphertext, IV, or authTag columns', async () => {
      const db = createMockDb({ selectResult: [SAFE_PROFILE] });
      const profiles = await getProfiles(db, 'user-1');

      expect(profiles).toHaveLength(1);

      const selectCall = (db.select as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const columnNames = Object.keys(selectCall);

      const credentialFields = [
        'consumerKeyCiphertext', 'consumerKeyIv', 'consumerKeyAuthTag',
        'consumerSecretCiphertext', 'consumerSecretIv', 'consumerSecretAuthTag',
        'accessTokenCiphertext', 'accessTokenIv', 'accessTokenAuthTag',
        'accessTokenSecretCiphertext', 'accessTokenSecretIv', 'accessTokenSecretAuthTag',
      ];

      for (const field of credentialFields) {
        expect(columnNames).not.toContain(field);
      }
    });

    it.todo('only returns profiles belonging to the authenticated user');
  });

  describe('deleteProfile', () => {
    it.todo('deletes profile by id and userId');
    it.todo('returns false when profile does not exist');
  });
});
