// Helpers that fabricate post + social profile records for the worker's
// lifecycle and scanner unit tests. These do NOT talk to Postgres — they
// return plain objects shaped like Drizzle row selects so tests can inject
// them into the mock-db's `SELECT FOR UPDATE` return value.
//
// Phase 2/3 api tests use the same "fabricate row object + mock db" pattern.
// Real end-to-end coverage of the scanner query shape is captured by the
// manual-only verification documented in 04-VALIDATION.md.

import type { socialProfiles as socialProfilesTable } from '@sms/db';

export interface SeedPostOverrides {
  id?: string;
  text?: string;
  isThread?: boolean;
  status?: string;
  postVersion?: number;
  platformPostId?: string | null;
  profileId?: string | null;
  platform?: string | null;
  visibility?: string | null;
  linkUrl?: string | null;
  scheduledAt?: Date;
}

export interface SeededLockedPost {
  id: string;
  text: string;
  is_thread: boolean;
  status: string;
  post_version: number;
  platform_post_id: string | null;
  profile_id: string | null;
  platform: string | null;
  visibility: string | null;
  link_url: string | null;
}

export function seedLockedPost(overrides: SeedPostOverrides = {}): SeededLockedPost {
  return {
    id: overrides.id ?? 'post_00000000-0000-0000-0000-000000000001',
    text: overrides.text ?? 'Hello from the worker test suite',
    is_thread: overrides.isThread ?? false,
    status: overrides.status ?? 'scheduled',
    post_version: overrides.postVersion ?? 1,
    platform_post_id: overrides.platformPostId ?? null,
    profile_id: overrides.profileId ?? 'profile_00000000-0000-0000-0000-000000000001',
    platform: overrides.platform ?? 'twitter',
    visibility: overrides.visibility ?? null,
    link_url: overrides.linkUrl ?? null,
  };
}

type SocialProfileRow = typeof socialProfilesTable.$inferSelect;

export function seedSocialProfile(
  overrides: Partial<SocialProfileRow> = {},
): SocialProfileRow {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'profile_00000000-0000-0000-0000-000000000001',
    userId: 'user_00000000-0000-0000-0000-000000000001',
    platform: 'twitter',
    platformUserId: 'twitter_user_123',
    displayName: 'Test Profile',
    handle: 'test_handle',
    avatarUrl: null,
    consumerKeyCiphertext: 'ck_cipher',
    consumerKeyIv: 'ck_iv',
    consumerKeyAuthTag: 'ck_tag',
    consumerSecretCiphertext: 'cs_cipher',
    consumerSecretIv: 'cs_iv',
    consumerSecretAuthTag: 'cs_tag',
    accessTokenCiphertext: 'at_cipher',
    accessTokenIv: 'at_iv',
    accessTokenAuthTag: 'at_tag',
    accessTokenSecretCiphertext: 'ats_cipher',
    accessTokenSecretIv: 'ats_iv',
    accessTokenSecretAuthTag: 'ats_tag',
    tokenEncryptionVersion: 1,
    monthlyTweetBudget: 500,
    warnThresholdPercent: 80,
    connectedAt: now,
    lastPublishedAt: null,
    // Phase 07-04: default to healthy so pre-existing tests bypass the
    // TOKEN-05 pre-flight. Token-health specific tests override explicitly.
    platformAccountId: null,
    oauth2AccessTokenCiphertext: null,
    oauth2AccessTokenIv: null,
    oauth2AccessTokenAuthTag: null,
    oauth2RefreshTokenCiphertext: null,
    oauth2RefreshTokenIv: null,
    oauth2RefreshTokenAuthTag: null,
    tokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    tokenStatus: 'active',
    tokenHealthCheckedAt: null,
    notes: null,
    // Phase 8 — per-platform rate-limit windows + LinkedIn account type.
    linkedinDailyLimit: 100,
    linkedinDailyCount: 0,
    linkedinWindowStartUtc: null,
    facebookHourlyLimit: 200,
    facebookHourlyCount: 0,
    facebookWindowStartUtc: null,
    linkedinAccountType: 'person',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
