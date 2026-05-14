import express, { type RequestHandler } from 'express';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq, inArray } from 'drizzle-orm';
import { createDbClient, snippets, users, type Db, type Sql } from '@sms/db';
import { createSnippetsRouter } from '../../routes/snippets.js';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://scheduler:devpassword123@localhost:5432/scheduler';

const USER_A_ID = '00000000-0000-4000-8000-0000000000a1';
const USER_B_ID = '00000000-0000-4000-8000-0000000000b2';

let db: Db;
let sql: Sql;

function createSessionApp(sessionUserId?: string) {
  const app = express();
  app.use(express.json());
  app.use(((req, _res, next) => {
    req.session = sessionUserId ? ({ userId: sessionUserId } as typeof req.session) : ({} as typeof req.session);
    next();
  }) as RequestHandler);
  app.use(createSnippetsRouter({ db }));
  return app;
}

async function resetTestUsers(): Promise<void> {
  await db.delete(users).where(inArray(users.id, [USER_A_ID, USER_B_ID]));

  await db.insert(users).values([
    {
      id: USER_A_ID,
      email: 'snippet-user-a@example.com',
      passwordHash: '$argon2id$snippet-user-a',
    },
    {
      id: USER_B_ID,
      email: 'snippet-user-b@example.com',
      passwordHash: '$argon2id$snippet-user-b',
    },
  ]);
}

describe('snippets API integration', () => {
  beforeAll(() => {
    const client = createDbClient(DATABASE_URL);
    db = client.db;
    sql = client.sql;
  });

  beforeEach(async () => {
    await resetTestUsers();
  });

  afterAll(async () => {
    await db.delete(users).where(inArray(users.id, [USER_A_ID, USER_B_ID]));
    await sql.end();
  });

  it('enforces cross-tenant isolation with 404 responses', async () => {
    const userAApp = createSessionApp(USER_A_ID);
    const userBApp = createSessionApp(USER_B_ID);

    const createResponse = await request(userAApp)
      .post('/api/snippets')
      .send({ name: 'mySnippet', body: 'A body', category: 'text' });

    expect(createResponse.status).toBe(201);
    const snippetId = createResponse.body.id as string;

    const getAsUserB = await request(userBApp).get(`/api/snippets/${snippetId}`);
    expect(getAsUserB.status).toBe(404);
    expect(JSON.stringify(getAsUserB.body)).not.toContain('A body');

    const patchAsUserB = await request(userBApp)
      .patch(`/api/snippets/${snippetId}`)
      .send({ body: 'hijacked' });
    expect(patchAsUserB.status).toBe(404);

    const getAsUserA = await request(userAApp).get(`/api/snippets/${snippetId}`);
    expect(getAsUserA.status).toBe(200);
    expect(getAsUserA.body.body).toBe('A body');
  });

  it('returns 409 for duplicate snippet names with case-insensitive matching', async () => {
    const app = createSessionApp(USER_A_ID);

    const firstCreate = await request(app)
      .post('/api/snippets')
      .send({ name: 'Hello', body: 'First body', category: 'text' });
    expect(firstCreate.status).toBe(201);

    const duplicateCreate = await request(app)
      .post('/api/snippets')
      .send({ name: 'hello', body: 'Second body', category: 'text' });

    expect(duplicateCreate.status).toBe(409);
    expect(duplicateCreate.body).toEqual({
      error: 'A snippet with that name already exists.',
    });
  });

  it('supports a full CRUD round trip', async () => {
    const app = createSessionApp(USER_A_ID);

    const createResponse = await request(app)
      .post('/api/snippets')
      .send({ name: 'Launch CTA', body: 'Ship it today', category: 'text' });
    expect(createResponse.status).toBe(201);
    const snippetId = createResponse.body.id as string;

    const listAfterCreate = await request(app).get('/api/snippets');
    expect(listAfterCreate.status).toBe(200);
    expect(listAfterCreate.body).toHaveLength(1);

    const getResponse = await request(app).get(`/api/snippets/${snippetId}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.body).toBe('Ship it today');

    const updateResponse = await request(app)
      .patch(`/api/snippets/${snippetId}`)
      .send({ body: 'Updated CTA body' });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.body).toBe('Updated CTA body');

    const getAfterUpdate = await request(app).get(`/api/snippets/${snippetId}`);
    expect(getAfterUpdate.status).toBe(200);
    expect(getAfterUpdate.body.body).toBe('Updated CTA body');

    const deleteResponse = await request(app).delete(`/api/snippets/${snippetId}`);
    expect(deleteResponse.status).toBe(204);

    const listAfterDelete = await request(app).get('/api/snippets');
    expect(listAfterDelete.status).toBe(200);
    expect(listAfterDelete.body).toHaveLength(0);
  });

  it('rejects an empty body with a 400 validation response', async () => {
    const app = createSessionApp(USER_A_ID);

    const response = await request(app)
      .post('/api/snippets')
      .send({ name: 'x', body: '', category: 'text' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(
      response.body.details.some(
        (issue: { path: string[]; message: string }) =>
          issue.path.join('.') === 'body' && issue.message === 'Content is required.',
      ),
    ).toBe(true);
  });
});
