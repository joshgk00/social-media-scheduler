import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import {
  posts,
  queues,
  snippets,
  socialProfiles,
  users,
} from '@sms/db';
import type { Queue } from 'bullmq';

import { createWorkerDb, type WorkerDb, type WorkerDbHandle } from '../../db.js';
import type { BulkJobContext } from '../common.js';
import { handleCsvImportQueue } from '../csv-import-queue.handler.js';
import { handleCsvImportScheduled } from '../csv-import-scheduled.handler.js';
import { makeCsvImportQueueJob, makeCsvImportScheduledJob } from '../../__tests__/fixtures/bulk-jobs.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://scheduler:devpassword123@localhost:5432/scheduler';

const USER_A_ID = '00000000-0000-4000-8000-0000000008a1';
const USER_B_ID = '00000000-0000-4000-8000-0000000008b1';
const PROFILE_A_ID = '00000000-0000-4000-8000-0000000008a2';
const PROFILE_B_ID = '00000000-0000-4000-8000-0000000008b2';
const QUEUE_A_ID = '00000000-0000-4000-8000-0000000008a3';

let dbHandle: WorkerDbHandle;
let db: WorkerDb;
let storageRoot: string;

function createTestContext(): BulkJobContext {
  return {
    db,
    publishQueue: {} as Queue,
    bulkOpsQueue: {} as Queue,
    notificationQueue: {} as Queue,
    storageRoot,
    appBaseUrl: 'http://localhost:3000',
  };
}

async function seedUsersAndProfiles(): Promise<void> {
  await db.delete(users).where(inArray(users.id, [USER_A_ID, USER_B_ID]));

  await db.insert(users).values([
    {
      id: USER_A_ID,
      email: 'worker-snippet-user-a@example.com',
      passwordHash: '$argon2id$worker-user-a',
    },
    {
      id: USER_B_ID,
      email: 'worker-snippet-user-b@example.com',
      passwordHash: '$argon2id$worker-user-b',
    },
  ]);

  await db.insert(socialProfiles).values([
    {
      id: PROFILE_A_ID,
      userId: USER_A_ID,
      platform: 'twitter',
      platformUserId: 'worker-profile-a',
      displayName: 'Worker Profile A',
      handle: '@worker-a',
      avatarUrl: 'https://example.com/worker-a.png',
    },
    {
      id: PROFILE_B_ID,
      userId: USER_B_ID,
      platform: 'twitter',
      platformUserId: 'worker-profile-b',
      displayName: 'Worker Profile B',
      handle: '@worker-b',
      avatarUrl: 'https://example.com/worker-b.png',
    },
  ]);

  await db.insert(queues).values({
    id: QUEUE_A_ID,
    userId: USER_A_ID,
    profileId: PROFILE_A_ID,
    name: 'Worker Queue A',
  });
}

async function insertedTextsFor(userId: string, status: 'scheduled' | 'queued'): Promise<string[]> {
  const insertedPosts = await db
    .select({ text: posts.text })
    .from(posts)
    .where(and(eq(posts.userId, userId), eq(posts.status, status)))
    .orderBy(posts.scheduledAt, posts.queuePosition, posts.createdAt);

  return insertedPosts.map((post) => post.text);
}

describe('CSV import snippet substitution handlers', () => {
  beforeAll(async () => {
    dbHandle = createWorkerDb(DATABASE_URL);
    db = dbHandle.db;
    storageRoot = await mkdtemp(path.join(tmpdir(), 'sms-worker-csv-import-'));
  });

  beforeEach(async () => {
    await seedUsersAndProfiles();
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [USER_A_ID, USER_B_ID]));
    await dbHandle.pgClient.end();
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('imports scheduled rows with substituted snippet text', async () => {
    await db.insert(snippets).values({
      userId: USER_A_ID,
      name: 'tags1',
      body: '#hello #world',
    });

    const job = makeCsvImportScheduledJob();
    job.data.userId = USER_A_ID;
    job.data.targetId = PROFILE_A_ID;
    job.data.params = {
      profileId: PROFILE_A_ID,
      rows: [
        {
          text: 'Check out {{snippet:tags1}} now',
          scheduled_at: '2026-06-01T10:00:00.000Z',
          tags: [],
          spinnable: false,
          notes: 'note',
        },
      ],
      errors: [],
    };

    const result = await handleCsvImportScheduled(job, createTestContext());

    expect(result.status).toBe('succeeded');
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(await insertedTextsFor(USER_A_ID, 'scheduled')).toEqual(['Check out #hello #world now']);
  });

  it('skips scheduled rows with unknown snippets and writes an error report', async () => {
    const job = makeCsvImportScheduledJob();
    job.data.userId = USER_A_ID;
    job.data.targetId = PROFILE_A_ID;
    job.data.params = {
      profileId: PROFILE_A_ID,
      rows: [
        {
          text: '{{snippet:doesnotexist}} body',
          scheduled_at: '2026-06-01T10:00:00.000Z',
          tags: [],
          spinnable: false,
        },
      ],
      errors: [],
    };

    const result = await handleCsvImportScheduled(job, createTestContext());

    expect(result.status).toBe('failed');
    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(1);
    expect(result.errorReportPath).toBeTruthy();
    expect(await insertedTextsFor(USER_A_ID, 'scheduled')).toEqual([]);

    const reportContents = await readFile(result.errorReportPath!, 'utf8');
    expect(reportContents).toContain('Unknown snippet ""doesnotexist""');
  });

  it('uses original CSV row numbers for scheduled snippet errors', async () => {
    const job = makeCsvImportScheduledJob();
    job.data.userId = USER_A_ID;
    job.data.targetId = PROFILE_A_ID;
    job.data.params = {
      profileId: PROFILE_A_ID,
      rows: [
        {
          rowNumber: 3,
          text: '{{snippet:missing}} body',
          scheduled_at: '2026-06-01T10:00:00.000Z',
          tags: [],
          spinnable: false,
        },
      ],
      errors: [{ rowNumber: 2, reason: 'text: String must contain at least 1 character(s)', row: { text: '' } }],
    };

    const result = await handleCsvImportScheduled(job, createTestContext());

    expect(result.status).toBe('failed');
    expect(result.failureCount).toBe(2);

    const reportContents = await readFile(result.errorReportPath!, 'utf8');
    expect(reportContents).toMatch(/^"2",/m);
    expect(reportContents).toMatch(/^"3",/m);
  });

  it('handles a mixed three-row scheduled import without storing unresolved tokens', async () => {
    await db.insert(snippets).values({
      userId: USER_A_ID,
      name: 'foo',
      body: 'BAR',
    });

    const job = makeCsvImportScheduledJob();
    job.data.userId = USER_A_ID;
    job.data.targetId = PROFILE_A_ID;
    job.data.params = {
      profileId: PROFILE_A_ID,
      rows: [
        {
          text: 'A {{snippet:foo}} B',
          scheduled_at: '2026-06-01T10:00:00.000Z',
          tags: [],
          spinnable: false,
        },
        {
          text: 'C {{snippet:missing}} D',
          scheduled_at: '2026-06-01T11:00:00.000Z',
          tags: [],
          spinnable: false,
        },
        {
          text: 'E F G',
          scheduled_at: '2026-06-01T12:00:00.000Z',
          tags: [],
          spinnable: false,
        },
      ],
      errors: [],
    };

    const result = await handleCsvImportScheduled(job, createTestContext());
    const insertedTexts = await insertedTextsFor(USER_A_ID, 'scheduled');

    expect(result.status).toBe('partial');
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(insertedTexts).toEqual(['A BAR B', 'E F G']);
    expect(insertedTexts.every((text) => !text.includes('{{') && !text.includes('}}'))).toBe(true);

    const reportContents = await readFile(result.errorReportPath!, 'utf8');
    expect(reportContents).toContain('missing');
  });

  it('matches snippet names case-insensitively during scheduled import', async () => {
    await db.insert(snippets).values({
      userId: USER_A_ID,
      name: 'MySnippet',
      body: 'X',
    });

    const job = makeCsvImportScheduledJob();
    job.data.userId = USER_A_ID;
    job.data.targetId = PROFILE_A_ID;
    job.data.params = {
      profileId: PROFILE_A_ID,
      rows: [
        {
          text: '{{snippet:mysnippet}}',
          scheduled_at: '2026-06-01T10:00:00.000Z',
          tags: [],
          spinnable: false,
        },
        {
          text: '{{snippet:MYSNIPPET}}',
          scheduled_at: '2026-06-01T11:00:00.000Z',
          tags: [],
          spinnable: false,
        },
      ],
      errors: [],
    };

    const result = await handleCsvImportScheduled(job, createTestContext());

    expect(result.status).toBe('succeeded');
    expect(await insertedTextsFor(USER_A_ID, 'scheduled')).toEqual(['X', 'X']);
  });

  it('resolves only the calling user’s snippets during scheduled import', async () => {
    await db.insert(snippets).values([
      {
        userId: USER_A_ID,
        name: 'shared',
        body: 'A',
      },
      {
        userId: USER_B_ID,
        name: 'shared',
        body: 'B',
      },
    ]);

    const job = makeCsvImportScheduledJob();
    job.data.userId = USER_A_ID;
    job.data.targetId = PROFILE_A_ID;
    job.data.params = {
      profileId: PROFILE_A_ID,
      rows: [
        {
          text: '{{snippet:shared}}',
          scheduled_at: '2026-06-01T10:00:00.000Z',
          tags: [],
          spinnable: false,
        },
      ],
      errors: [],
    };

    const result = await handleCsvImportScheduled(job, createTestContext());

    expect(result.status).toBe('succeeded');
    expect(await insertedTextsFor(USER_A_ID, 'scheduled')).toEqual(['A']);
  });

  it('also substitutes snippets for queue CSV imports', async () => {
    await db.insert(snippets).values({
      userId: USER_A_ID,
      name: 'queueSnippet',
      body: '#queue',
    });

    const job = makeCsvImportQueueJob();
    job.data.userId = USER_A_ID;
    job.data.targetId = QUEUE_A_ID;
    job.data.params = {
      profileId: PROFILE_A_ID,
      queueId: QUEUE_A_ID,
      rows: [
        {
          text: 'Queued {{snippet:queuesnippet}} post',
          queue_name: 'Worker Queue A',
          position: 1,
          tags: [],
          spinnable: false,
        },
      ],
      errors: [],
    };

    const result = await handleCsvImportQueue(job, createTestContext());

    expect(result.status).toBe('succeeded');
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(await insertedTextsFor(USER_A_ID, 'queued')).toEqual(['Queued #queue post']);
  });

  it('uses original CSV row numbers for queue snippet errors', async () => {
    const job = makeCsvImportQueueJob();
    job.data.userId = USER_A_ID;
    job.data.targetId = QUEUE_A_ID;
    job.data.params = {
      profileId: PROFILE_A_ID,
      queueId: QUEUE_A_ID,
      rows: [
        {
          rowNumber: 4,
          text: 'Queued {{snippet:missing}} post',
          queue_name: 'Worker Queue A',
          position: 1,
          tags: [],
          spinnable: false,
        },
      ],
      errors: [{ rowNumber: 2, reason: 'text: String must contain at least 1 character(s)', row: { text: '' } }],
    };

    const result = await handleCsvImportQueue(job, createTestContext());

    expect(result.status).toBe('failed');
    expect(result.failureCount).toBe(2);

    const reportContents = await readFile(result.errorReportPath!, 'utf8');
    expect(reportContents).toMatch(/^"2",/m);
    expect(reportContents).toMatch(/^"4",/m);
  });
});
