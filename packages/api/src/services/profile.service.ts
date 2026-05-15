import { eq, and, inArray, sql } from 'drizzle-orm';
import { encrypt, validateEncryptionKey } from '@sms/shared/encryption';
import { AppError } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';
import type { Db } from '@sms/db';
import { socialProfiles, posts, queues } from '@sms/db';
import { TwitterApi } from 'twitter-api-v2';
import { OAuthServiceError, MismatchedAccountError } from './oauth.service.js';

// Phase 7 Plan 05 — extended profile list shape returned to the frontend.
// Token-health fields (tokenStatus/tokenExpiresAt/tokenHealthCheckedAt) and
// nextScheduledAt drive the badge + meta-row render. `platformAccountId`,
// `notes` are surfaced for PROFILE-07 (rename/notes/delete cascade).
// This shape NEVER includes *Ciphertext/*Iv/*AuthTag fields (T-07-03).
export interface ProfileListItem {
  id: string;
  platform: 'twitter' | 'linkedin' | 'facebook';
  platformUserId: string | null;
  platformAccountId: string | null;
  displayName: string | null;
  handle: string | null;
  avatarUrl: string | null;
  connectedAt: Date;
  lastPublishedAt: Date | null;
  tokenStatus: 'active' | 'expiring' | 'expired' | 'needs_reauth';
  tokenExpiresAt: Date | null;
  tokenHealthCheckedAt: Date | null;
  notes: string | null;
  nextScheduledAt: Date | null;
  monthlyTweetBudget: number;
  warnThresholdPercent: number;
}

export interface DeletePreview {
  drafts: number;
  scheduled: number;
  queueMemberships: number;
  tagsLosingLastUse: number;
  // inFlight > 0 blocks deletion in the existing deleteProfile transaction.
  inFlight: number;
}

const logger = createLogger('profile-service');
const IN_FLIGHT_STATES = ['queued', 'publishing', 'auto_destructing'] as const;

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

type RawProfileRow = {
  id: string;
  platform: string;
  platform_user_id: string | null;
  platform_account_id: string | null;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
  connected_at: Date | string;
  last_published_at: Date | string | null;
  token_status: string;
  token_expires_at: Date | string | null;
  token_health_checked_at: Date | string | null;
  notes: string | null;
  next_scheduled_at: Date | string | null;
  monthly_tweet_budget: number;
  warn_threshold_percent: number;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(value);
}

function mapRowToProfileListItem(row: RawProfileRow): ProfileListItem {
  return {
    id: row.id,
    platform: row.platform as ProfileListItem['platform'],
    platformUserId: row.platform_user_id,
    platformAccountId: row.platform_account_id,
    displayName: row.display_name,
    handle: row.handle,
    avatarUrl: row.avatar_url,
    connectedAt: toDate(row.connected_at) as Date,
    lastPublishedAt: toDate(row.last_published_at),
    tokenStatus: row.token_status as ProfileListItem['tokenStatus'],
    tokenExpiresAt: toDate(row.token_expires_at),
    tokenHealthCheckedAt: toDate(row.token_health_checked_at),
    notes: row.notes,
    nextScheduledAt: toDate(row.next_scheduled_at),
    monthlyTweetBudget: Number(row.monthly_tweet_budget),
    warnThresholdPercent: Number(row.warn_threshold_percent),
  };
}

// T-07-03 mitigation: projection explicitly lists non-secret columns. Any new
// *Ciphertext/*Iv/*AuthTag column added to social_profiles will NOT leak here
// unless someone adds it to this SELECT. Enforced by a test that checks the
// serialized response for those field names.
// D-24 / RESEARCH: LEFT JOIN LATERAL computes nextScheduledAt in a single
// query without N+1. Drizzle 0.45 doesn't have first-class LATERAL, so we
// use raw sql with bound parameters.
export async function getProfiles(db: Db, userId: string): Promise<ProfileListItem[]> {
  const rows = (await db.execute(sql`
    SELECT
      sp.id,
      sp.platform,
      sp.platform_user_id,
      sp.platform_account_id,
      sp.display_name,
      sp.handle,
      sp.avatar_url,
      sp.connected_at,
      sp.last_published_at,
      sp.token_status,
      sp.token_expires_at,
      sp.token_health_checked_at,
      sp.notes,
      sp.monthly_tweet_budget,
      sp.warn_threshold_percent,
      lp.next_scheduled_at
    FROM social_profiles sp
    LEFT JOIN LATERAL (
      SELECT p.scheduled_at AS next_scheduled_at
      FROM posts p
      WHERE p.profile_id = sp.id
        AND p.user_id = sp.user_id
        AND p.status = 'scheduled'
        AND p.scheduled_at > now()
      ORDER BY p.scheduled_at ASC
      LIMIT 1
    ) lp ON true
    WHERE sp.user_id = ${userId}
    ORDER BY sp.connected_at DESC
  `)) as unknown as RawProfileRow[];

  return rows.map(mapRowToProfileListItem);
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

    const detachedPosts = await tx
      .update(posts)
      .set({ profileId: null, queueId: null, updatedAt: new Date() })
      .where(
        and(
          eq(posts.profileId, profileId),
          eq(posts.userId, userId),
        ),
      )
      .returning({ id: posts.id });

    const deletedQueues = await tx
      .delete(queues)
      .where(
        and(
          eq(queues.profileId, profileId),
          eq(queues.userId, userId),
        ),
      )
      .returning({ id: queues.id });

    const deleted = await tx
      .delete(socialProfiles)
      .where(
        and(
          eq(socialProfiles.id, profileId),
          eq(socialProfiles.userId, userId),
        ),
      )
      .returning({ id: socialProfiles.id });

    if (deleted.length > 0) {
      logger.info(
        {
          profileId,
          userId,
          detachedPostCount: detachedPosts.length,
          deletedQueueCount: deletedQueues.length,
        },
        'Profile deleted',
      );
    }

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
  // The platform the incoming OAuth flow ran through. Compared against the
  // existing row's platform to block cross-platform reconnects (e.g. feeding
  // a LinkedIn profileId into a Facebook callback). See CR-02 in REVIEW.md.
  platform: 'twitter' | 'linkedin' | 'facebook';
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
  platform: 'twitter' | 'linkedin' | 'facebook';
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
        platform: socialProfiles.platform,
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

    // CR-02: block cross-platform reconnects (e.g. feeding a LinkedIn
    // profileId into a Facebook callback). `platformAccountId`/`platformUserId`
    // are opaque strings, so a platform mismatch can otherwise slip past the
    // identity check below. Surface the same 409/mismatched_account code path
    // so the existing frontend flow handles it.
    if (existing.platform !== args.platform) {
      throw new MismatchedAccountError(existingHandle, args.incomingHandle);
    }

    const isAccountMatch =
      existing.platformUserId === args.incomingPlatformUserId &&
      existing.platformAccountId === args.incomingPlatformAccountId;

    if (!isAccountMatch) {
      throw new MismatchedAccountError(existingHandle, args.incomingHandle);
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

// ---------------------------------------------------------------------------
// Phase 7 Plan 05 — profile metadata PATCH + delete-preview
// ---------------------------------------------------------------------------

interface UpdateProfileMetadataArgs {
  userId: string;
  profileId: string;
  displayName?: string;
  // Explicit `null` clears the field; `undefined` leaves it untouched.
  notes?: string | null;
}

// Fetches a single refreshed profile row using the same LATERAL subquery as
// getProfiles so the response matches ProfileListItem exactly.
async function fetchProfileListItemById(
  db: Db,
  userId: string,
  profileId: string,
): Promise<ProfileListItem | null> {
  const rows = (await db.execute(sql`
    SELECT
      sp.id,
      sp.platform,
      sp.platform_user_id,
      sp.platform_account_id,
      sp.display_name,
      sp.handle,
      sp.avatar_url,
      sp.connected_at,
      sp.last_published_at,
      sp.token_status,
      sp.token_expires_at,
      sp.token_health_checked_at,
      sp.notes,
      sp.monthly_tweet_budget,
      sp.warn_threshold_percent,
      lp.next_scheduled_at
    FROM social_profiles sp
    LEFT JOIN LATERAL (
      SELECT p.scheduled_at AS next_scheduled_at
      FROM posts p
      WHERE p.profile_id = sp.id
        AND p.user_id = sp.user_id
        AND p.status = 'scheduled'
        AND p.scheduled_at > now()
      ORDER BY p.scheduled_at ASC
      LIMIT 1
    ) lp ON true
    WHERE sp.user_id = ${userId} AND sp.id = ${profileId}
    LIMIT 1
  `)) as unknown as RawProfileRow[];

  if (rows.length === 0) return null;
  return mapRowToProfileListItem(rows[0]);
}

// PATCH /api/profiles/:id handler path. Partial update — only the provided
// fields are written; omitted fields are preserved. Ownership is enforced
// in the UPDATE WHERE clause (no read-before-write race, T-07-06).
// T-07-11: caller is responsible for using `updateProfileMetadataSchema.strict()`
// so unknown keys never reach this function.
export async function updateProfileMetadata(
  db: Db,
  args: UpdateProfileMetadataArgs,
): Promise<ProfileListItem> {
  const hasDisplayName = args.displayName !== undefined;
  const hasNotes = args.notes !== undefined;

  if (!hasDisplayName && !hasNotes) {
    throw new ProfileServiceError('no_fields_to_update', 400);
  }

  const setPayload: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  if (hasDisplayName) setPayload.displayName = args.displayName;
  if (hasNotes) setPayload.notes = args.notes;

  const updatedRows = await db
    .update(socialProfiles)
    .set(setPayload)
    .where(
      and(
        eq(socialProfiles.id, args.profileId),
        eq(socialProfiles.userId, args.userId),
      ),
    )
    .returning({ id: socialProfiles.id });

  if (updatedRows.length === 0) {
    throw new ProfileServiceError('profile_not_found', 404);
  }

  const refreshed = await fetchProfileListItemById(db, args.userId, args.profileId);
  if (!refreshed) {
    // Should never happen — row existed for the UPDATE to touch it and we're
    // inside the same request. A race would have to delete the profile
    // between the UPDATE and SELECT. Treat as not found.
    throw new ProfileServiceError('profile_not_found', 404);
  }
  return refreshed;
}

// GET /api/profiles/:id/delete-preview handler path. Counts are all
// ownership-scoped via user_id in the WHERE clause. Returns zeros (never
// throws) when no matches — the endpoint is idempotent and safe to call
// even for an empty or just-connected profile.
export async function getDeletePreview(
  db: Db,
  userId: string,
  profileId: string,
): Promise<DeletePreview> {
  const [draftsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(posts)
    .where(
      and(
        eq(posts.profileId, profileId),
        eq(posts.userId, userId),
        eq(posts.status, 'draft'),
      ),
    );

  const [scheduledRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(posts)
    .where(
      and(
        eq(posts.profileId, profileId),
        eq(posts.userId, userId),
        eq(posts.status, 'scheduled'),
      ),
    );

  // Queue ownership is modeled by queues.profileId. Count queue definitions
  // directly so empty queues are visible in the destructive-action preview.
  const [queueMembershipsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(queues)
    .where(
      and(
        eq(queues.profileId, profileId),
        eq(queues.userId, userId),
      ),
    );

  const [inFlightRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(posts)
    .where(
      and(
        eq(posts.profileId, profileId),
        eq(posts.userId, userId),
        inArray(posts.status, [...IN_FLIGHT_STATES]),
      ),
    );

  // Tags that would lose their last tagged post after this profile is gone.
  // A tag "loses its last use" when every post tagged with it belongs to the
  // profile being deleted. Raw SQL because Drizzle can't express the
  // NOT EXISTS correlation cleanly across three tables.
  const tagsRows = (await db.execute(sql`
    SELECT COUNT(DISTINCT pt.tag_id)::int AS count
    FROM post_tags pt
    JOIN posts p ON p.id = pt.post_id
    WHERE p.profile_id = ${profileId}
      AND p.user_id = ${userId}
      AND NOT EXISTS (
        SELECT 1
        FROM post_tags pt2
        JOIN posts p2 ON p2.id = pt2.post_id
        WHERE pt2.tag_id = pt.tag_id
          AND p2.user_id = ${userId}
          AND (p2.profile_id <> ${profileId} OR p2.profile_id IS NULL)
      )
  `)) as unknown as Array<{ count: number | string | null }>;

  const tagsLosingLastUse = Number(tagsRows[0]?.count ?? 0);

  return {
    drafts: Number(draftsRow?.count ?? 0),
    scheduled: Number(scheduledRow?.count ?? 0),
    queueMemberships: Number(queueMembershipsRow?.count ?? 0),
    inFlight: Number(inFlightRow?.count ?? 0),
    tagsLosingLastUse,
  };
}
