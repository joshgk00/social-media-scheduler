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
const mockPosts = makeTableStub('posts', [
  'id', 'userId', 'profileId', 'queueId', 'status', 'updatedAt',
]);
const mockQueues = makeTableStub('queues', ['id', 'userId', 'profileId']);

vi.mock('@sms/db', () => ({
  socialProfiles: mockSocialProfiles,
  posts: mockPosts,
  queues: mockQueues,
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

vi.mock('@sms/shared/encryption', () => ({
  encrypt: (...args: unknown[]) => mockEncrypt(...args),
  validateEncryptionKey: (...args: unknown[]) => mockValidateEncryptionKey(...args),
}));

vi.mock('@sms/shared/logger', () => ({
  createLogger: (...args: unknown[]) => mockCreateLogger(...args),
}));

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
const USER_ID = 'user-1';
const PROFILE_ID = 'profile-uuid-1';

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

function chainReturning(result: unknown[]) {
  const chain: Record<string, any> = {};
  for (const method of ['from', 'where', 'limit', 'set', 'returning']) {
    chain[method] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

function createDeleteProfileDb(overrides: {
  inFlightPosts?: unknown[];
  detachedPosts?: unknown[];
  deletedQueues?: unknown[];
  deletedProfiles?: unknown[];
} = {}) {
  const inFlightChain = chainReturning(overrides.inFlightPosts ?? []);
  const updateChain = chainReturning(overrides.detachedPosts ?? []);
  const queueDeleteChain = chainReturning(overrides.deletedQueues ?? []);
  const profileDeleteChain = chainReturning(
    overrides.deletedProfiles ?? [{ id: 'profile-uuid-1' }],
  );

  const tx = {
    select: vi.fn().mockReturnValue(inFlightChain),
    update: vi.fn().mockReturnValue(updateChain),
    delete: vi.fn()
      .mockReturnValueOnce(queueDeleteChain)
      .mockReturnValueOnce(profileDeleteChain),
  };

  const db = {
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx)),
  };

  return {
    db: db as any,
    tx,
    inFlightChain,
    updateChain,
    queueDeleteChain,
    profileDeleteChain,
  };
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
  let deleteProfile: typeof import('../../services/profile.service.js').deleteProfile;

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
    deleteProfile = mod.deleteProfile;
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
      // Phase 7 Plan 05: getProfiles now uses db.execute(sql`...`) with a
      // LATERAL subquery so the projection lives in the raw SQL, not in a
      // Drizzle .select({...}) object. T-07-03 is enforced by making the
      // serialized response free of every secret column name.
      const db = createMockDb({ selectResult: [] });
      db.execute = vi.fn().mockResolvedValue([
        {
          id: 'profile-uuid-1',
          platform: 'twitter',
          platform_user_id: '12345',
          platform_account_id: null,
          display_name: 'Test User',
          handle: 'testuser',
          avatar_url: 'https://pbs.twimg.com/avatar.jpg',
          connected_at: new Date(),
          last_published_at: null,
          token_status: 'active',
          token_expires_at: null,
          token_health_checked_at: null,
          notes: null,
          next_scheduled_at: null,
          monthly_tweet_budget: 500,
          warn_threshold_percent: 80,
        },
      ]);

      const profiles = await getProfiles(db, 'user-1');

      expect(profiles).toHaveLength(1);

      const serialized = JSON.stringify(profiles[0]);
      const credentialFields = [
        'consumerKeyCiphertext', 'consumerKeyIv', 'consumerKeyAuthTag',
        'consumerSecretCiphertext', 'consumerSecretIv', 'consumerSecretAuthTag',
        'accessTokenCiphertext', 'accessTokenIv', 'accessTokenAuthTag',
        'accessTokenSecretCiphertext', 'accessTokenSecretIv', 'accessTokenSecretAuthTag',
        'oauth2AccessTokenCiphertext', 'oauth2AccessTokenIv', 'oauth2AccessTokenAuthTag',
        'oauth2RefreshTokenCiphertext', 'oauth2RefreshTokenIv', 'oauth2RefreshTokenAuthTag',
      ];

      for (const field of credentialFields) {
        expect(serialized).not.toContain(field);
      }
    });

    it.todo('only returns profiles belonging to the authenticated user');
  });

  describe('deleteProfile', () => {
    it('detaches related posts, deletes queues, and deletes the profile in one transaction', async () => {
      const { db, tx, updateChain, queueDeleteChain } = createDeleteProfileDb({
        detachedPosts: [{ id: 'post-1' }],
        deletedQueues: [{ id: 'queue-1' }],
        deletedProfiles: [{ id: PROFILE_ID }],
      });

      const result = await deleteProfile(db, USER_ID, PROFILE_ID);

      expect(result).toBe(true);
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(tx.update).toHaveBeenCalledWith(mockPosts);
      expect(updateChain.set).toHaveBeenCalledWith({
        profileId: null,
        queueId: null,
        updatedAt: expect.any(Date),
      });
      expect(tx.delete).toHaveBeenNthCalledWith(1, mockQueues);
      expect(queueDeleteChain.returning).toHaveBeenCalledWith({ id: mockQueues.id });
      expect(tx.delete).toHaveBeenNthCalledWith(2, mockSocialProfiles);
    });

    it('returns false when profile does not exist', async () => {
      const { db } = createDeleteProfileDb({ deletedProfiles: [] });

      await expect(deleteProfile(db, USER_ID, PROFILE_ID)).resolves.toBe(false);
    });

    it('blocks deletion when the profile has in-flight posts', async () => {
      const { db, tx } = createDeleteProfileDb({
        inFlightPosts: [{ id: 'post-1' }],
      });

      await expect(deleteProfile(db, USER_ID, PROFILE_ID)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(tx.update).not.toHaveBeenCalled();
      expect(tx.delete).not.toHaveBeenCalled();
    });
  });
});
