import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@sms/db';
import { socialProfiles } from '@sms/db';

import {
  checkTwitterBudgetWithDb,
  loadLinkedInUsage,
  loadFacebookUsage,
} from '../services/rate-limit.service.js';
import { requireAuth } from '../middleware/auth-guard.js';
import { validateUuidParam } from '../middleware/validation.js';

interface RateLimitDependencies {
  db: Db;
}

// Per-platform read-side endpoints used by Plan 05b's dashboard. The bodies
// conform to `rateLimitStateSchema` (the discriminated union shipped in Plan
// 02). Plan 03 owns this router because it also owns the underlying
// loadLinkedInUsage / loadFacebookUsage services.
//
// Two endpoints:
//   GET /api/rate-limit/:profileId — single profile (LIMIT-08, also reused by
//     the per-profile chip on the profiles list)
//   GET /api/rate-limit             — collection of every owned profile,
//     {profiles: ProfileRateLimitState[]} (LIMIT-08 dashboard widget)
//
// Ownership is enforced via SELECT WHERE user_id = ? for the single endpoint
// and a list-by-user query for the collection endpoint. A cross-user
// :profileId returns 404 and never leaks the profile's existence.

interface BasePlatformRateLimitState {
  profileId: string;
  currentCount: number;
  limit: number;
  warnThresholdPercent: number;
  warnThresholdHit: boolean;
  blockThresholdHit: boolean;
  windowStartUtc: string;
  windowResetAt: string;
}

interface TwitterRateLimitState extends BasePlatformRateLimitState {
  platform: 'twitter';
  budget: number;
  monthStartUtc: string;
}

interface LinkedInRateLimitState extends BasePlatformRateLimitState {
  platform: 'linkedin';
}

interface FacebookRateLimitState extends BasePlatformRateLimitState {
  platform: 'facebook';
}

type ProfileRateLimitState =
  | TwitterRateLimitState
  | LinkedInRateLimitState
  | FacebookRateLimitState;

async function buildRateLimitState(
  db: Db,
  profile: { id: string; platform: string },
): Promise<ProfileRateLimitState> {
  if (profile.platform === 'twitter') {
    const state = await checkTwitterBudgetWithDb(db, {
      profileId: profile.id,
      additionalPostCount: 0,
    });
    return {
      platform: 'twitter',
      profileId: profile.id,
      currentCount: state.currentUsage,
      limit: state.budget,
      budget: state.budget,
      warnThresholdPercent: state.warnThresholdPercent,
      warnThresholdHit: state.warnThresholdHit,
      blockThresholdHit: state.blockThresholdHit,
      windowStartUtc: state.monthStartUtc.toISOString(),
      windowResetAt: state.monthStartUtc.toISOString(),
      monthStartUtc: state.monthStartUtc.toISOString(),
    };
  }

  if (profile.platform === 'linkedin') {
    const snap = await loadLinkedInUsage(db, profile.id);
    const warnLimit = Math.floor(
      (snap.limit * snap.warnThresholdPercent) / 100,
    );
    return {
      platform: 'linkedin',
      profileId: profile.id,
      currentCount: snap.currentCount,
      limit: snap.limit,
      warnThresholdPercent: snap.warnThresholdPercent,
      warnThresholdHit: snap.currentCount >= warnLimit,
      blockThresholdHit: snap.currentCount >= snap.limit,
      windowStartUtc: snap.windowStartUtc.toISOString(),
      windowResetAt: snap.windowResetAt.toISOString(),
    };
  }

  // facebook
  const snap = await loadFacebookUsage(db, profile.id);
  const warnLimit = Math.floor((snap.limit * snap.warnThresholdPercent) / 100);
  return {
    platform: 'facebook',
    profileId: profile.id,
    currentCount: snap.currentCount,
    limit: snap.limit,
    warnThresholdPercent: snap.warnThresholdPercent,
    warnThresholdHit: snap.currentCount >= warnLimit,
    blockThresholdHit: snap.currentCount >= snap.limit,
    windowStartUtc: snap.windowStartUtc.toISOString(),
    windowResetAt: snap.windowResetAt.toISOString(),
  };
}

export function createRateLimitRouter({ db }: RateLimitDependencies) {
  const router = Router();

  // GET /api/rate-limit — collection endpoint backing Plan 05b's
  // RateLimitsCard widget (LIMIT-08). Returns one entry per profile owned
  // by the authenticated user. Plan 05b's `useAllProfilesRateLimits` hook
  // expects the `{profiles: ProfileRateLimitState[]}` wrapper key.
  router.get('/api/rate-limit', requireAuth, async (req, res) => {
    const userId = req.session.userId!;

    const ownedProfiles = await db
      .select({ id: socialProfiles.id, platform: socialProfiles.platform })
      .from(socialProfiles)
      .where(eq(socialProfiles.userId, userId));

    const profiles = await Promise.all(
      ownedProfiles.map((p) => buildRateLimitState(db, p)),
    );

    res.json({ profiles });
  });

  // GET /api/rate-limit/:profileId — single profile lookup. Ownership
  // enforced via SELECT WHERE user_id = ? — cross-user request returns 404
  // (never leaks existence).
  router.get('/api/rate-limit/:profileId', requireAuth, async (req, res) => {
    const profileId = validateUuidParam(req.params.profileId as string);
    const userId = req.session.userId!;

    const [ownedProfile] = await db
      .select({ id: socialProfiles.id, platform: socialProfiles.platform })
      .from(socialProfiles)
      .where(
        and(
          eq(socialProfiles.id, profileId),
          eq(socialProfiles.userId, userId),
        ),
      );

    if (!ownedProfile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const state = await buildRateLimitState(db, ownedProfile);
    res.json(state);
  });

  return router;
}
