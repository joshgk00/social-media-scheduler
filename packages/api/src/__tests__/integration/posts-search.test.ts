import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import {
  createDbClient,
  postTags,
  posts,
  queues,
  socialProfiles,
  tags,
  users,
  type Db,
  type Sql,
} from '@sms/db';

import { getPosts } from '../../services/post.service.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://scheduler:devpassword123@localhost:5432/scheduler';

const USER_A_ID = '00000000-0000-4000-8000-0000000006a1';
const USER_B_ID = '00000000-0000-4000-8000-0000000006b2';
const PROFILE_A_PRIMARY_ID = '00000000-0000-4000-8000-0000000006a3';
const PROFILE_A_SECONDARY_ID = '00000000-0000-4000-8000-0000000006a4';
const PROFILE_B_ID = '00000000-0000-4000-8000-0000000006b3';
const QUEUE_A_ID = '00000000-0000-4000-8000-0000000006a5';
const NEWSLETTER_TAG_ID = '00000000-0000-4000-8000-0000000006a6';

const HIGH_RANK_POST_ID = '00000000-0000-4000-8000-0000000006c1';
const MID_RANK_POST_ID = '00000000-0000-4000-8000-0000000006c2';
const LOW_RANK_POST_ID = '00000000-0000-4000-8000-0000000006c3';
const QUEUED_MATCH_POST_ID = '00000000-0000-4000-8000-0000000006c4';
const PUBLISHED_MATCH_POST_ID = '00000000-0000-4000-8000-0000000006c5';
const TAG_ONLY_POST_ID = '00000000-0000-4000-8000-0000000006c6';
const LATEST_SCHEDULED_POST_ID = '00000000-0000-4000-8000-0000000006c7';
const USER_B_MATCH_POST_ID = '00000000-0000-4000-8000-0000000006d1';
const USER_B_MATCH_POST_ID_2 = '00000000-0000-4000-8000-0000000006d2';

type ExplainNode = {
  'Index Name'?: string;
  Plans?: ExplainNode[];
};

let db: Db;
let sqlClient: Sql;

function minutesFrom(baseTime: Date, minutes: number): Date {
  return new Date(baseTime.getTime() + minutes * 60_000);
}

function collectIndexNames(plan: ExplainNode): string[] {
  const childPlans = plan.Plans ?? [];
  return [
    ...(plan['Index Name'] ? [plan['Index Name']] : []),
    ...childPlans.flatMap((childPlan) => collectIndexNames(childPlan)),
  ];
}

function extractPlanRoot(explainRows: Array<Record<string, unknown>>): ExplainNode {
  const queryPlan = explainRows[0]?.['QUERY PLAN'];
  if (!Array.isArray(queryPlan) || queryPlan.length === 0) {
    throw new Error('Expected EXPLAIN (FORMAT JSON) output.');
  }

  const topLevelPlan = queryPlan[0] as Record<string, unknown>;
  if (!topLevelPlan.Plan || typeof topLevelPlan.Plan !== 'object') {
    throw new Error('Expected top-level EXPLAIN plan node.');
  }

  return topLevelPlan.Plan as ExplainNode;
}

async function seedFixtures(): Promise<void> {
  await db.delete(users).where(inArray(users.id, [USER_A_ID, USER_B_ID]));

  await db.insert(users).values([
    {
      id: USER_A_ID,
      email: 'posts-search-user-a@example.com',
      passwordHash: '$argon2id$posts-search-user-a',
    },
    {
      id: USER_B_ID,
      email: 'posts-search-user-b@example.com',
      passwordHash: '$argon2id$posts-search-user-b',
    },
  ]);

  await db.insert(socialProfiles).values([
    {
      id: PROFILE_A_PRIMARY_ID,
      userId: USER_A_ID,
      platform: 'twitter',
      platformUserId: 'profile-a-primary',
      displayName: 'Primary A',
      handle: '@primary-a',
      avatarUrl: 'https://example.com/a-primary.png',
    },
    {
      id: PROFILE_A_SECONDARY_ID,
      userId: USER_A_ID,
      platform: 'linkedin',
      platformUserId: 'profile-a-secondary',
      displayName: 'Secondary A',
      handle: '@secondary-a',
      avatarUrl: 'https://example.com/a-secondary.png',
    },
    {
      id: PROFILE_B_ID,
      userId: USER_B_ID,
      platform: 'twitter',
      platformUserId: 'profile-b',
      displayName: 'Profile B',
      handle: '@profile-b',
      avatarUrl: 'https://example.com/b.png',
    },
  ]);

  await db.insert(queues).values({
    id: QUEUE_A_ID,
    userId: USER_A_ID,
    profileId: PROFILE_A_PRIMARY_ID,
    name: 'Newsletter Queue',
  });

  await db.insert(tags).values({
    id: NEWSLETTER_TAG_ID,
    userId: USER_A_ID,
    name: 'newsletter',
    color: '#2563eb',
  });

  const baseTime = new Date('2026-05-20T15:00:00.000Z');
  const targetedPosts: Array<typeof posts.$inferInsert> = [
    {
      id: HIGH_RANK_POST_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_PRIMARY_ID,
      platform: 'twitter',
      text: 'Newsletter launch newsletter launch starts tomorrow morning.',
      status: 'scheduled',
      scheduledAt: minutesFrom(baseTime, 120),
      createdAt: minutesFrom(baseTime, -120),
      updatedAt: minutesFrom(baseTime, -120),
    },
    {
      id: MID_RANK_POST_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_SECONDARY_ID,
      platform: 'linkedin',
      text: 'Newsletter launch tomorrow for product subscribers.',
      status: 'draft',
      createdAt: minutesFrom(baseTime, -110),
      updatedAt: minutesFrom(baseTime, -110),
    },
    {
      id: LOW_RANK_POST_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_PRIMARY_ID,
      platform: 'twitter',
      text: 'A short note about the newsletter launch.',
      status: 'failed',
      createdAt: minutesFrom(baseTime, -100),
      updatedAt: minutesFrom(baseTime, -100),
    },
    {
      id: QUEUED_MATCH_POST_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_PRIMARY_ID,
      platform: 'twitter',
      text: 'Queued newsletter launch for the afternoon audience.',
      status: 'queued',
      queueId: QUEUE_A_ID,
      queuePosition: 1,
      scheduledAt: minutesFrom(baseTime, 60),
      createdAt: minutesFrom(baseTime, -90),
      updatedAt: minutesFrom(baseTime, -90),
    },
    {
      id: PUBLISHED_MATCH_POST_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_PRIMARY_ID,
      platform: 'twitter',
      text: 'Published newsletter launch recap for yesterday.',
      status: 'published',
      publishedAt: minutesFrom(baseTime, -60),
      createdAt: minutesFrom(baseTime, -80),
      updatedAt: minutesFrom(baseTime, -80),
    },
    {
      id: TAG_ONLY_POST_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_PRIMARY_ID,
      platform: 'twitter',
      text: 'General team update without the keyword in text.',
      status: 'scheduled',
      scheduledAt: minutesFrom(baseTime, 30),
      createdAt: minutesFrom(baseTime, -70),
      updatedAt: minutesFrom(baseTime, -70),
    },
    {
      id: LATEST_SCHEDULED_POST_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_SECONDARY_ID,
      platform: 'linkedin',
      text: 'Roadmap planning note for the top of the schedule.',
      status: 'scheduled',
      scheduledAt: minutesFrom(baseTime, 600),
      createdAt: minutesFrom(baseTime, -60),
      updatedAt: minutesFrom(baseTime, -60),
    },
    {
      id: USER_B_MATCH_POST_ID,
      userId: USER_B_ID,
      profileId: PROFILE_B_ID,
      platform: 'twitter',
      text: 'Newsletter launch update for the other tenant.',
      status: 'scheduled',
      scheduledAt: minutesFrom(baseTime, 45),
      createdAt: minutesFrom(baseTime, -50),
      updatedAt: minutesFrom(baseTime, -50),
    },
    {
      id: USER_B_MATCH_POST_ID_2,
      userId: USER_B_ID,
      profileId: PROFILE_B_ID,
      platform: 'twitter',
      text: 'Second newsletter launch row owned by user B.',
      status: 'draft',
      createdAt: minutesFrom(baseTime, -40),
      updatedAt: minutesFrom(baseTime, -40),
    },
  ];

  const fillerPosts: Array<typeof posts.$inferInsert> = Array.from({ length: 46 }, (_, index) => {
    const isScheduled = index % 3 === 0;
    const isQueued = index % 7 === 0;
    const isPublished = index % 11 === 0;
    const profileId = index % 2 === 0 ? PROFILE_A_PRIMARY_ID : PROFILE_A_SECONDARY_ID;

    return {
      id: randomUUID(),
      userId: USER_A_ID,
      profileId,
      platform: profileId === PROFILE_A_PRIMARY_ID ? 'twitter' : 'linkedin',
      text: index < 20 ? `Product update ${index} with no mailing-list terms.` : `Evergreen filler copy ${index}.`,
      status: isQueued ? 'queued' : isPublished ? 'published' : isScheduled ? 'scheduled' : 'draft',
      queueId: isQueued ? QUEUE_A_ID : null,
      queuePosition: isQueued ? index + 2 : null,
      scheduledAt: isScheduled || isQueued ? minutesFrom(baseTime, index + 5) : null,
      publishedAt: isPublished ? minutesFrom(baseTime, -(index + 10)) : null,
      createdAt: minutesFrom(baseTime, -(index + 200)),
      updatedAt: minutesFrom(baseTime, -(index + 200)),
    };
  });

  await db.insert(posts).values([...targetedPosts, ...fillerPosts]);
  await db.insert(postTags).values([{ postId: TAG_ONLY_POST_ID, tagId: NEWSLETTER_TAG_ID }]);
}

describe('posts search integration', () => {
  beforeAll(() => {
    const client = createDbClient(DATABASE_URL);
    db = client.db;
    sqlClient = client.sql;
  });

  beforeEach(async () => {
    await seedFixtures();
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [USER_A_ID, USER_B_ID]));
    await sqlClient.end();
  });

  it('returns ranked headline results for full-text search', async () => {
    const result = await getPosts(db, USER_A_ID, { search: 'newsletter launch', limit: 100 });

    expect(result.posts[0]?.id).toBe(HIGH_RANK_POST_ID);
    expect(new Set(result.posts.map((post) => post.id))).toEqual(new Set([
      HIGH_RANK_POST_ID,
      MID_RANK_POST_ID,
      LOW_RANK_POST_ID,
      QUEUED_MATCH_POST_ID,
      PUBLISHED_MATCH_POST_ID,
    ]));

    const ranks = result.posts.map((post) => Number(post.rank));
    for (let index = 1; index < ranks.length; index += 1) {
      expect(ranks[index - 1]).toBeGreaterThanOrEqual(ranks[index]);
    }

    for (const post of result.posts) {
      expect(post.headline).toContain('<b>');
      expect(Number(post.rank)).toBeGreaterThan(0);
    }
  });

  it('uses the posts_fts_idx GIN index for the search predicate', async () => {
    await sqlClient`ANALYZE posts`;

    const combinedExplainRows = await sqlClient`
      EXPLAIN (FORMAT JSON)
      SELECT id
      FROM posts
      WHERE (search_vector || tag_search_vector) @@ plainto_tsquery('english', 'subscribers')
        AND user_id = ${USER_A_ID}
    `;
    const combinedIndexNames = collectIndexNames(
      extractPlanRoot(combinedExplainRows as Array<Record<string, unknown>>),
    );

    if (combinedIndexNames.includes('posts_fts_idx')) {
      expect(combinedIndexNames).toContain('posts_fts_idx');
      return;
    }

    await sqlClient`SET enable_seqscan = off`;

    try {
      const forcedExplainRows = await sqlClient`
        EXPLAIN (FORMAT JSON)
        SELECT id
        FROM posts
        WHERE (search_vector || tag_search_vector) @@ plainto_tsquery('english', 'subscribers')
      `;
      const forcedIndexNames = collectIndexNames(
        extractPlanRoot(forcedExplainRows as Array<Record<string, unknown>>),
      );

      expect(forcedIndexNames).toContain('posts_fts_idx');
    } finally {
      await sqlClient`RESET enable_seqscan`;
    }
  });

  it('enforces scope-by-view filters and still matches tag-only rows', async () => {
    const postsScopeResult = await getPosts(db, USER_A_ID, {
      search: 'newsletter',
      searchScope: 'posts',
      limit: 100,
    });

    expect(postsScopeResult.posts.every((post) =>
      ['draft', 'scheduled', 'failed'].includes(post.status))).toBe(true);
    expect(postsScopeResult.posts.some((post) => post.id === QUEUED_MATCH_POST_ID)).toBe(false);
    expect(postsScopeResult.posts.some((post) => post.id === PUBLISHED_MATCH_POST_ID)).toBe(false);
    expect(postsScopeResult.posts.map((post) => post.id)).toContain(TAG_ONLY_POST_ID);

    const queueScopeResult = await getPosts(db, USER_A_ID, {
      search: 'newsletter',
      searchScope: 'queue',
      limit: 100,
    });

    expect(queueScopeResult.posts).toHaveLength(1);
    expect(queueScopeResult.posts[0]?.id).toBe(QUEUED_MATCH_POST_ID);
    expect(queueScopeResult.posts[0]?.status).toBe('queued');
  });

  it('preserves cross-tenant isolation for search results', async () => {
    const result = await getPosts(db, USER_A_ID, { search: 'newsletter launch', limit: 100 });

    expect(result.posts.map((post) => post.id)).not.toContain(USER_B_MATCH_POST_ID);
    expect(result.posts.map((post) => post.id)).not.toContain(USER_B_MATCH_POST_ID_2);
    expect(result.posts.every((post) => post.userId === USER_A_ID)).toBe(true);
  });

  it('omits search-only fields when search is absent and keeps default ordering', async () => {
    const result = await getPosts(db, USER_A_ID, { limit: 100 });

    expect(result.posts[0]?.id).toBe(LATEST_SCHEDULED_POST_ID);
    expect('headline' in result.posts[0]!).toBe(false);
    expect('rank' in result.posts[0]!).toBe(false);
  });

  it('treats SQL-injection payloads as bound search text and leaves posts intact', async () => {
    const result = await getPosts(db, USER_A_ID, {
      search: "'; DROP TABLE posts; --",
      limit: 100,
    });

    expect(Array.isArray(result.posts)).toBe(true);

    const postCountRows = await sqlClient`SELECT count(*)::int AS total FROM posts`;
    expect(postCountRows[0]?.total).toBeGreaterThan(0);
  });
});
