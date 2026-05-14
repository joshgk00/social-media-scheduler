import express, { type RequestHandler } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { inArray } from 'drizzle-orm';
import {
  createDbClient,
  postTags,
  posts,
  socialProfiles,
  tags,
  users,
  type Db,
  type Sql,
} from '@sms/db';

import { createCalendarRouter } from '../../routes/calendar.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://scheduler:devpassword123@localhost:5432/scheduler';

const USER_A_ID = '00000000-0000-4000-8000-0000000007a1';
const USER_B_ID = '00000000-0000-4000-8000-0000000007b1';
const PROFILE_A_TWITTER_ID = '00000000-0000-4000-8000-0000000007a2';
const PROFILE_A_LINKEDIN_ID = '00000000-0000-4000-8000-0000000007a3';
const PROFILE_B_ID = '00000000-0000-4000-8000-0000000007b2';
const FILTER_TAG_ID = '00000000-0000-4000-8000-0000000007a4';

const WINDOW_BEFORE_ID = '00000000-0000-4000-8000-0000000007c1';
const WINDOW_INSIDE_ONE_ID = '00000000-0000-4000-8000-0000000007c2';
const WINDOW_INSIDE_TWO_ID = '00000000-0000-4000-8000-0000000007c3';
const WINDOW_INSIDE_THREE_ID = '00000000-0000-4000-8000-0000000007c4';
const WINDOW_AFTER_ID = '00000000-0000-4000-8000-0000000007c5';
const CONFLICT_ONE_ID = '00000000-0000-4000-8000-0000000007c6';
const CONFLICT_TWO_ID = '00000000-0000-4000-8000-0000000007c7';
const NO_CONFLICT_OTHER_PROFILE_ID = '00000000-0000-4000-8000-0000000007c8';
const SCOPE_SCHEDULED_ID = '00000000-0000-4000-8000-0000000007c9';
const SCOPE_QUEUED_ID = '00000000-0000-4000-8000-0000000007ca';
const SCOPE_PUBLISHED_ID = '00000000-0000-4000-8000-0000000007cb';
const TWITTER_TAGGED_ID = '00000000-0000-4000-8000-0000000007cc';
const LINKEDIN_FILTER_ID = '00000000-0000-4000-8000-0000000007cd';
const LONG_TEXT_ID = '00000000-0000-4000-8000-0000000007ce';
const USER_A_WINDOW_ID = '00000000-0000-4000-8000-0000000007cf';
const USER_B_WINDOW_ID = '00000000-0000-4000-8000-0000000007d1';

const LONG_TEXT = 'L'.repeat(200);

let db: Db;
let sqlClient: Sql;

function createSessionApp(sessionUserId?: string) {
  const app = express();
  app.use(express.json());
  app.use(((req, _res, next) => {
    req.session = sessionUserId ? ({ userId: sessionUserId } as typeof req.session) : ({} as typeof req.session);
    next();
  }) as RequestHandler);
  app.use(createCalendarRouter({ db }));
  return app;
}

async function seedFixtures(): Promise<void> {
  await db.delete(users).where(inArray(users.id, [USER_A_ID, USER_B_ID]));

  await db.insert(users).values([
    {
      id: USER_A_ID,
      email: 'calendar-user-a@example.com',
      passwordHash: '$argon2id$calendar-user-a',
    },
    {
      id: USER_B_ID,
      email: 'calendar-user-b@example.com',
      passwordHash: '$argon2id$calendar-user-b',
    },
  ]);

  await db.insert(socialProfiles).values([
    {
      id: PROFILE_A_TWITTER_ID,
      userId: USER_A_ID,
      platform: 'twitter',
      platformUserId: 'calendar-a-twitter',
      displayName: 'Calendar Twitter',
      handle: '@calendar-twitter',
      avatarUrl: 'https://example.com/calendar-twitter.png',
    },
    {
      id: PROFILE_A_LINKEDIN_ID,
      userId: USER_A_ID,
      platform: 'linkedin',
      platformUserId: 'calendar-a-linkedin',
      displayName: 'Calendar LinkedIn',
      handle: '@calendar-linkedin',
      avatarUrl: 'https://example.com/calendar-linkedin.png',
    },
    {
      id: PROFILE_B_ID,
      userId: USER_B_ID,
      platform: 'twitter',
      platformUserId: 'calendar-b-twitter',
      displayName: 'Calendar B',
      handle: '@calendar-b',
      avatarUrl: 'https://example.com/calendar-b.png',
    },
  ]);

  await db.insert(tags).values({
    id: FILTER_TAG_ID,
    userId: USER_A_ID,
    name: 'calendar-tag',
    color: '#2563eb',
  });

  await db.insert(posts).values([
    {
      id: WINDOW_BEFORE_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_TWITTER_ID,
      platform: 'twitter',
      text: 'Window before event',
      status: 'scheduled',
      scheduledAt: new Date('2026-09-01T09:00:00.000Z'),
    },
    {
      id: WINDOW_INSIDE_ONE_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_TWITTER_ID,
      platform: 'twitter',
      text: 'Window inside event one',
      status: 'scheduled',
      scheduledAt: new Date('2026-09-15T09:00:00.000Z'),
    },
    {
      id: WINDOW_INSIDE_TWO_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_TWITTER_ID,
      platform: 'twitter',
      text: 'Window inside event two',
      status: 'scheduled',
      scheduledAt: new Date('2026-09-30T09:00:00.000Z'),
    },
    {
      id: WINDOW_INSIDE_THREE_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_TWITTER_ID,
      platform: 'twitter',
      text: 'Window inside event three',
      status: 'scheduled',
      scheduledAt: new Date('2026-10-15T09:00:00.000Z'),
    },
    {
      id: WINDOW_AFTER_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_TWITTER_ID,
      platform: 'twitter',
      text: 'Window after event',
      status: 'scheduled',
      scheduledAt: new Date('2026-11-01T09:00:00.000Z'),
    },
    {
      id: CONFLICT_ONE_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_TWITTER_ID,
      platform: 'twitter',
      text: 'Conflict pair one',
      status: 'scheduled',
      scheduledAt: new Date('2026-06-20T10:00:00.000Z'),
    },
    {
      id: CONFLICT_TWO_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_TWITTER_ID,
      platform: 'twitter',
      text: 'Conflict pair two',
      status: 'scheduled',
      scheduledAt: new Date('2026-06-20T10:02:00.000Z'),
    },
    {
      id: NO_CONFLICT_OTHER_PROFILE_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_LINKEDIN_ID,
      platform: 'linkedin',
      text: 'Different profile no conflict',
      status: 'scheduled',
      scheduledAt: new Date('2026-06-20T10:02:00.000Z'),
    },
    {
      id: SCOPE_SCHEDULED_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_TWITTER_ID,
      platform: 'twitter',
      text: 'Scope scheduled item',
      status: 'scheduled',
      scheduledAt: new Date('2026-07-25T09:00:00.000Z'),
    },
    {
      id: SCOPE_QUEUED_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_TWITTER_ID,
      platform: 'twitter',
      text: 'Scope queued item',
      status: 'queued',
      scheduledAt: new Date('2026-07-25T10:00:00.000Z'),
    },
    {
      id: SCOPE_PUBLISHED_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_TWITTER_ID,
      platform: 'twitter',
      text: 'Scope published item',
      status: 'published',
      scheduledAt: new Date('2026-07-25T11:00:00.000Z'),
      publishedAt: new Date('2026-07-25T11:05:00.000Z'),
    },
    {
      id: TWITTER_TAGGED_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_TWITTER_ID,
      platform: 'twitter',
      text: 'Twitter calendar filter match',
      status: 'scheduled',
      scheduledAt: new Date('2026-07-10T09:00:00.000Z'),
    },
    {
      id: LINKEDIN_FILTER_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_LINKEDIN_ID,
      platform: 'linkedin',
      text: 'LinkedIn launch preview',
      status: 'scheduled',
      scheduledAt: new Date('2026-07-10T10:00:00.000Z'),
    },
    {
      id: LONG_TEXT_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_TWITTER_ID,
      platform: 'twitter',
      text: LONG_TEXT,
      status: 'scheduled',
      scheduledAt: new Date('2026-08-05T09:00:00.000Z'),
    },
    {
      id: USER_A_WINDOW_ID,
      userId: USER_A_ID,
      profileId: PROFILE_A_TWITTER_ID,
      platform: 'twitter',
      text: 'User A window event',
      status: 'scheduled',
      scheduledAt: new Date('2026-08-10T09:05:00.000Z'),
    },
    {
      id: USER_B_WINDOW_ID,
      userId: USER_B_ID,
      profileId: PROFILE_B_ID,
      platform: 'twitter',
      text: 'User B should never leak',
      status: 'scheduled',
      scheduledAt: new Date('2026-08-10T09:00:00.000Z'),
    },
  ]);

  await db.insert(postTags).values([{ postId: TWITTER_TAGGED_ID, tagId: FILTER_TAG_ID }]);
}

describe('calendar API integration', () => {
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

  it('returns only events strictly within the requested window bounds', async () => {
    const app = createSessionApp(USER_A_ID);

    const response = await request(app).get('/api/calendar').query({
      from: '2026-09-10T00:00:00.000Z',
      to: '2026-10-20T00:00:00.000Z',
      scope: 'both',
    });

    expect(response.status).toBe(200);
    expect(response.body.events.map((event: { id: string }) => event.id)).toEqual([
      WINDOW_INSIDE_ONE_ID,
      WINDOW_INSIDE_TWO_ID,
      WINDOW_INSIDE_THREE_ID,
    ]);
  });

  it('rejects windows longer than 100 days with a 400 validation response', async () => {
    const app = createSessionApp(USER_A_ID);

    const response = await request(app).get('/api/calendar').query({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-12-31T00:00:00.000Z',
      scope: 'both',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(
      response.body.details.some(
        (issue: { path: string[]; message: string }) =>
          issue.path.join('.') === 'to' &&
          issue.message === 'Calendar window must not exceed 100 days.',
      ),
    ).toBe(true);
  });

  it('marks same-profile events within five minutes as conflicts', async () => {
    const app = createSessionApp(USER_A_ID);

    const response = await request(app).get('/api/calendar').query({
      from: '2026-06-20T09:50:00.000Z',
      to: '2026-06-20T10:10:00.000Z',
      scope: 'both',
    });

    expect(response.status).toBe(200);
    const eventsById = Object.fromEntries(
      response.body.events.map((event: { id: string; hasConflict: boolean }) => [event.id, event]),
    );

    expect(eventsById[CONFLICT_ONE_ID].hasConflict).toBe(true);
    expect(eventsById[CONFLICT_TWO_ID].hasConflict).toBe(true);
    expect(eventsById[NO_CONFLICT_OTHER_PROFILE_ID].hasConflict).toBe(false);
  });

  it('applies scope filters for scheduled, queued, and both', async () => {
    const app = createSessionApp(USER_A_ID);
    const windowQuery = {
      from: '2026-07-25T08:30:00.000Z',
      to: '2026-07-25T11:30:00.000Z',
    };

    const scheduledResponse = await request(app).get('/api/calendar').query({
      ...windowQuery,
      scope: 'scheduled',
    });
    expect(scheduledResponse.status).toBe(200);
    expect(scheduledResponse.body.events.map((event: { id: string }) => event.id)).toEqual([
      SCOPE_SCHEDULED_ID,
    ]);

    const queuedResponse = await request(app).get('/api/calendar').query({
      ...windowQuery,
      scope: 'queued',
    });
    expect(queuedResponse.status).toBe(200);
    expect(queuedResponse.body.events.map((event: { id: string }) => event.id)).toEqual([
      SCOPE_QUEUED_ID,
    ]);

    const bothResponse = await request(app).get('/api/calendar').query({
      ...windowQuery,
      scope: 'both',
    });
    expect(bothResponse.status).toBe(200);
    expect(bothResponse.body.events.map((event: { id: string }) => event.id)).toEqual([
      SCOPE_SCHEDULED_ID,
      SCOPE_QUEUED_ID,
    ]);
  });

  it('applies platform, profile, tag, and search filters', async () => {
    const app = createSessionApp(USER_A_ID);
    const windowQuery = {
      from: '2026-07-10T08:30:00.000Z',
      to: '2026-07-10T10:30:00.000Z',
      scope: 'both',
    };

    const platformResponse = await request(app).get('/api/calendar').query({
      ...windowQuery,
      platforms: 'twitter',
    });
    expect(platformResponse.status).toBe(200);
    expect(platformResponse.body.events.map((event: { id: string }) => event.id)).toEqual([
      TWITTER_TAGGED_ID,
    ]);

    const profileResponse = await request(app).get('/api/calendar').query({
      ...windowQuery,
      profileIds: PROFILE_A_LINKEDIN_ID,
    });
    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.events.map((event: { id: string }) => event.id)).toEqual([
      LINKEDIN_FILTER_ID,
    ]);

    const tagResponse = await request(app).get('/api/calendar').query({
      ...windowQuery,
      tagIds: FILTER_TAG_ID,
    });
    expect(tagResponse.status).toBe(200);
    expect(tagResponse.body.events.map((event: { id: string }) => event.id)).toEqual([
      TWITTER_TAGGED_ID,
    ]);

    const searchResponse = await request(app).get('/api/calendar').query({
      ...windowQuery,
      search: 'launch preview',
    });
    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.events.map((event: { id: string }) => event.id)).toEqual([
      LINKEDIN_FILTER_ID,
    ]);
  });

  it('preserves cross-tenant isolation for calendar responses', async () => {
    const app = createSessionApp(USER_A_ID);

    const response = await request(app).get('/api/calendar').query({
      from: '2026-08-10T08:30:00.000Z',
      to: '2026-08-10T09:30:00.000Z',
      scope: 'both',
    });

    expect(response.status).toBe(200);
    expect(response.body.events.map((event: { id: string }) => event.id)).toEqual([
      USER_A_WINDOW_ID,
    ]);
    expect(response.body.events.some((event: { id: string }) => event.id === USER_B_WINDOW_ID)).toBe(false);
  });

  it('truncates text previews to 60 characters', async () => {
    const app = createSessionApp(USER_A_ID);

    const response = await request(app).get('/api/calendar').query({
      from: '2026-08-05T08:30:00.000Z',
      to: '2026-08-05T09:30:00.000Z',
      scope: 'both',
    });

    expect(response.status).toBe(200);
    expect(response.body.events).toHaveLength(1);
    expect(response.body.events[0].id).toBe(LONG_TEXT_ID);
    expect(response.body.events[0].textPreview).toBe(LONG_TEXT.slice(0, 60));
    expect(response.body.events[0].textPreview).toHaveLength(60);
  });
});
