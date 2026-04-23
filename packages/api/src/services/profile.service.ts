import { eq, and, inArray } from 'drizzle-orm';
import { encrypt, validateEncryptionKey } from '@sms/shared/encryption';
import { AppError } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { Db } from '@sms/db';
import { socialProfiles, posts } from '@sms/db';
import { TwitterApi } from 'twitter-api-v2';
import { OAuthServiceError } from './oauth.service.js';

const logger = createLogger('profile-service');

// Subclass exists so structured logs show 'ProfileServiceError' instead of 'AppError'.
// All behavior comes from AppError; the subclass adds no fields or methods.
export class ProfileServiceError extends AppError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
  }
}

interface TwitterUserData {
  id: string;
  name: string;
  username: string;
  profileImageUrl: string | undefined;
}

const SAFE_PROFILE_COLUMNS = {
  id: socialProfiles.id,
  platform: socialProfiles.platform,
  platformUserId: socialProfiles.platformUserId,
  displayName: socialProfiles.displayName,
  handle: socialProfiles.handle,
  avatarUrl: socialProfiles.avatarUrl,
  tokenEncryptionVersion: socialProfiles.tokenEncryptionVersion,
  connectedAt: socialProfiles.connectedAt,
  lastPublishedAt: socialProfiles.lastPublishedAt,
} as const;

export async function validateTwitterCredentials(
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string,
): Promise<TwitterUserData> {
  try {
    const client = new TwitterApi({
      appKey: consumerKey,
      appSecret: consumerSecret,
      accessToken,
      accessSecret: accessTokenSecret,
    });

    const { data: twitterUser } = await client.v2.me({
      'user.fields': ['profile_image_url', 'name', 'username'],
    });

    return {
      id: twitterUser.id,
      name: twitterUser.name,
      username: twitterUser.username,
      profileImageUrl: twitterUser.profile_image_url,
    };
  } catch (err: unknown) {
    const errorCode = (err as { code?: number })?.code;
    const statusCode = (err as { data?: { status?: number } })?.data?.status ?? errorCode;

    logger.error(
      { errorType: 'twitter_validation_failed', statusCode },
      'Twitter credential validation failed',
    );

    if (statusCode === 401) {
      throw new ProfileServiceError(
        'Could not verify these credentials. Check that your Consumer Key, Consumer Secret, Access Token, and Access Token Secret are correct and that your Developer App has Read and Write permissions.',
        401,
      );
    }

    if (statusCode === 429) {
      throw new ProfileServiceError('Twitter API rate limit reached. Please wait a few minutes and try again.', 429);
    }

    const isNetworkError = (err as { code?: string })?.code === 'ENOTFOUND'
      || (err as { code?: string })?.code === 'ECONNREFUSED'
      || (err as { code?: string })?.code === 'ETIMEDOUT'
      || (err as { type?: string })?.type === 'request-timeout';

    if (isNetworkError) {
      throw new ProfileServiceError(
        'Could not reach Twitter API. Please check your network connection and try again.',
        422,
      );
    }

    throw new ProfileServiceError('Twitter API returned an unexpected error. Please try again later.', 422);
  }
}

interface CreateProfileCredentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export async function createProfile(
  db: Db,
  userId: string,
  credentials: CreateProfileCredentials,
) {
  const twitterUser = await validateTwitterCredentials(
    credentials.consumerKey,
    credentials.consumerSecret,
    credentials.accessToken,
    credentials.accessTokenSecret,
  );

  const existingProfile = await db
    .select({ id: socialProfiles.id })
    .from(socialProfiles)
    .where(
      and(
        eq(socialProfiles.userId, userId),
        eq(socialProfiles.platform, 'twitter'),
        eq(socialProfiles.platformUserId, twitterUser.id),
      ),
    );

  if (existingProfile.length > 0) {
    throw new ProfileServiceError('This Twitter account is already connected.', 409);
  }

  const encryptionKey = validateEncryptionKey(process.env.ENCRYPTION_KEY ?? '');

  const consumerKeyEncrypted = encrypt(credentials.consumerKey, encryptionKey, 1);
  const consumerSecretEncrypted = encrypt(credentials.consumerSecret, encryptionKey, 1);
  const accessTokenEncrypted = encrypt(credentials.accessToken, encryptionKey, 1);
  const accessTokenSecretEncrypted = encrypt(credentials.accessTokenSecret, encryptionKey, 1);

  const [profile] = await db.insert(socialProfiles).values({
    userId,
    platform: 'twitter',
    platformUserId: twitterUser.id,
    displayName: twitterUser.name,
    handle: twitterUser.username,
    avatarUrl: twitterUser.profileImageUrl ?? null,

    consumerKeyCiphertext: consumerKeyEncrypted.ciphertext,
    consumerKeyIv: consumerKeyEncrypted.iv,
    consumerKeyAuthTag: consumerKeyEncrypted.authTag,

    consumerSecretCiphertext: consumerSecretEncrypted.ciphertext,
    consumerSecretIv: consumerSecretEncrypted.iv,
    consumerSecretAuthTag: consumerSecretEncrypted.authTag,

    accessTokenCiphertext: accessTokenEncrypted.ciphertext,
    accessTokenIv: accessTokenEncrypted.iv,
    accessTokenAuthTag: accessTokenEncrypted.authTag,

    accessTokenSecretCiphertext: accessTokenSecretEncrypted.ciphertext,
    accessTokenSecretIv: accessTokenSecretEncrypted.iv,
    accessTokenSecretAuthTag: accessTokenSecretEncrypted.authTag,

    tokenEncryptionVersion: 1,
  }).returning(SAFE_PROFILE_COLUMNS);

  return profile;
}

export async function getProfiles(db: Db, userId: string) {
  return db
    .select(SAFE_PROFILE_COLUMNS)
    .from(socialProfiles)
    .where(eq(socialProfiles.userId, userId));
}

export async function getProfileById(db: Db, userId: string, profileId: string) {
  const profiles = await db
    .select(SAFE_PROFILE_COLUMNS)
    .from(socialProfiles)
    .where(
      and(
        eq(socialProfiles.id, profileId),
        eq(socialProfiles.userId, userId),
      ),
    );

  return profiles[0] ?? null;
}

export async function deleteProfile(db: Db, userId: string, profileId: string): Promise<boolean> {
  const IN_FLIGHT_STATES = ['queued', 'publishing', 'auto_destructing'] as const;

  return db.transaction(async (tx) => {
    const inFlightPosts = await tx
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.profileId, profileId),
          eq(posts.userId, userId),
          inArray(posts.status, [...IN_FLIGHT_STATES]),
        ),
      )
      .limit(1);

    if (inFlightPosts.length > 0) {
      // Queued, publishing, and auto_destructing posts have no cancellation
      // path in the state machine, so users can only wait for them to finish.
      throw new ProfileServiceError(
        'Cannot delete profile with in-flight posts. Wait for queued, publishing, and auto-destructing posts to complete.',
        409,
      );
    }

    const deleted = await tx
      .delete(socialProfiles)
      .where(
        and(
          eq(socialProfiles.id, profileId),
          eq(socialProfiles.userId, userId),
        ),
      )
      .returning({ id: socialProfiles.id });

    return deleted.length > 0;
  });
}

// ---------------------------------------------------------------------------
// Phase 7 — OAuth 2.0 profile flows (LinkedIn + Facebook)
// ---------------------------------------------------------------------------

interface CreateProfileFromOAuthArgs {
  userId: string;
  platform: 'linkedin' | 'facebook';
  platformUserId: string;
  platformAccountId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  accessToken: string;
  // LinkedIn only. Facebook rows pass null — refresh columns stay null and the
  // long-lived page token in oauth2AccessToken* is the only persisted token.
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
}

function requireEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new ProfileServiceError('Server configuration error', 500);
  }
  try {
    return validateEncryptionKey(raw);
  } catch {
    throw new ProfileServiceError('Server configuration error', 500);
  }
}

function isUniqueViolation(err: unknown): boolean {
  const maybeCode = (err as { code?: string })?.code;
  return maybeCode === '23505';
}

export async function createProfileFromOAuth(
  db: Db,
  args: CreateProfileFromOAuthArgs,
): Promise<{ profileId: string }> {
  const encryptionKey = requireEncryptionKey();

  const accessEncrypted = encrypt(args.accessToken, encryptionKey, 1);
  const refreshEncrypted = args.refreshToken
    ? encrypt(args.refreshToken, encryptionKey, 1)
    : null;

  try {
    const [profile] = await db
      .insert(socialProfiles)
      .values({
        userId: args.userId,
        platform: args.platform,
        platformUserId: args.platformUserId,
        platformAccountId: args.platformAccountId,
        displayName: args.displayName,
        handle: args.handle,
        avatarUrl: args.avatarUrl,

        oauth2AccessTokenCiphertext: accessEncrypted.ciphertext,
        oauth2AccessTokenIv: accessEncrypted.iv,
        oauth2AccessTokenAuthTag: accessEncrypted.authTag,

        oauth2RefreshTokenCiphertext: refreshEncrypted?.ciphertext ?? null,
        oauth2RefreshTokenIv: refreshEncrypted?.iv ?? null,
        oauth2RefreshTokenAuthTag: refreshEncrypted?.authTag ?? null,

        tokenExpiresAt: args.tokenExpiresAt,
        refreshTokenExpiresAt: args.refreshTokenExpiresAt,
        tokenStatus: 'active',
        tokenHealthCheckedAt: new Date(),
        tokenEncryptionVersion: 1,
      })
      .returning({ id: socialProfiles.id });

    return { profileId: profile.id };
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      throw new ProfileServiceError(
        `This ${args.platform} account (@${args.handle}) is already connected.`,
        409,
      );
    }
    logger.error({ err, platform: args.platform }, 'createProfileFromOAuth failed');
    throw err;
  }
}

interface ReconnectProfileArgs {
  userId: string;
  profileId: string;
  incomingPlatformUserId: string;
  incomingPlatformAccountId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  incomingHandle: string;
}

interface ReconnectRow {
  id: string;
  handle: string | null;
  platformUserId: string | null;
  platformAccountId: string | null;
}

export async function reconnectProfile(
  db: Db,
  args: ReconnectProfileArgs,
): Promise<{ profileId: string; existingHandle: string }> {
  const encryptionKey = requireEncryptionKey();

  return db.transaction(async (tx) => {
    // Ownership bound via userId in the WHERE clause so a cross-user profile
    // id returns 404 instead of 403 — never leaks existence.
    const rows = await tx
      .select({
        id: socialProfiles.id,
        handle: socialProfiles.handle,
        platformUserId: socialProfiles.platformUserId,
        platformAccountId: socialProfiles.platformAccountId,
      })
      .from(socialProfiles)
      .where(
        and(
          eq(socialProfiles.id, args.profileId),
          eq(socialProfiles.userId, args.userId),
        ),
      )
      .limit(1);

    const existing = (rows as ReconnectRow[])[0];
    if (!existing) {
      throw new ProfileServiceError('Profile not found', 404);
    }

    const existingHandle = existing.handle ?? '';

    const isAccountMatch =
      existing.platformUserId === args.incomingPlatformUserId &&
      existing.platformAccountId === args.incomingPlatformAccountId;

    if (!isAccountMatch) {
      throw new OAuthServiceError(
        `Existing profile is @${existingHandle}; reconnect attempted with @${args.incomingHandle}`,
        409,
        'mismatched_account',
      );
    }

    const accessEncrypted = encrypt(args.accessToken, encryptionKey, 1);

    // Per RESEARCH Pitfall 3: LinkedIn does NOT rotate refresh tokens.
    // When incoming refreshToken is null we must SKIP the update so the
    // previously stored refresh token survives the reconnect — otherwise the
    // next background refresh would fail with "missing refresh token".
    const updatePayload: Record<string, unknown> = {
      oauth2AccessTokenCiphertext: accessEncrypted.ciphertext,
      oauth2AccessTokenIv: accessEncrypted.iv,
      oauth2AccessTokenAuthTag: accessEncrypted.authTag,
      tokenExpiresAt: args.tokenExpiresAt,
      tokenStatus: 'active',
      tokenHealthCheckedAt: new Date(),
      updatedAt: new Date(),
      tokenEncryptionVersion: 1,
    };

    if (args.refreshToken !== null) {
      const refreshEncrypted = encrypt(args.refreshToken, encryptionKey, 1);
      updatePayload.oauth2RefreshTokenCiphertext = refreshEncrypted.ciphertext;
      updatePayload.oauth2RefreshTokenIv = refreshEncrypted.iv;
      updatePayload.oauth2RefreshTokenAuthTag = refreshEncrypted.authTag;
      updatePayload.refreshTokenExpiresAt = args.refreshTokenExpiresAt;
    }

    await tx
      .update(socialProfiles)
      .set(updatePayload)
      .where(
        and(
          eq(socialProfiles.id, args.profileId),
          eq(socialProfiles.userId, args.userId),
        ),
      )
      .returning({ id: socialProfiles.id });

    return { profileId: existing.id, existingHandle };
  });
}
