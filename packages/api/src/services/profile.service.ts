import { eq, and, inArray } from 'drizzle-orm';
import { encrypt, validateEncryptionKey } from '@sms/shared/encryption';
import { AppError } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { Db } from '@sms/db';
import { socialProfiles, posts } from '@sms/db';
import { TwitterApi } from 'twitter-api-v2';

const logger = createLogger('profile-service');

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
      throw new ProfileServiceError(
        'Cannot delete profile with in-flight posts. Wait for publishing to complete or cancel queued posts first.',
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
