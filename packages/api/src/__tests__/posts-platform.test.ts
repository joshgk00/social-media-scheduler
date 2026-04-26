// Wave 0 RED stubs for the POST /api/posts route's per-platform validation.
// These tests fail until Plan 03 ships the platform-aware route + service
// behind the discriminated union from Plan 02.
//
// Pattern follows existing api supertest + mocked-service tests. We don't
// boot a Postgres testcontainer here — services are mocked, the route
// just has to exercise the schema + dispatch.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const VALID_PROFILE_ID = '00000000-0000-4000-8000-00000000aaaa';
const VALID_USER_ID = '00000000-0000-4000-8000-00000000bbbb';

// Skeleton mocks — Plan 03 wires the real services. Wave 0 only needs the
// route to exist and forward the body through createPostSchema.
vi.mock('../services/post.service.js', async () => {
  const actual = await vi.importActual<typeof import('../services/post.service.js')>(
    '../services/post.service.js',
  );
  return {
    ...actual,
    createPost: vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-00000000cccc',
      profileId: VALID_PROFILE_ID,
      platform: 'linkedin',
      text: 'hello',
      status: 'draft',
    }),
  };
});

function buildAuthedRequest(app: ReturnType<typeof createApp>) {
  // Phase 2 auth: session cookie. For Wave 0 RED we only need the route to
  // be reachable; Plan 03 will wire a proper test session helper.
  return request(app).set('Cookie', [`sms.sid=test-session`]);
}

describe('POST /api/posts platform branch (POST-LI-01, POST-FB-01)', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it('accepts a valid linkedin payload and persists platform=linkedin (POST-LI-01)', async () => {
    const response = await buildAuthedRequest(app)
      .post('/api/posts')
      .send({
        platform: 'linkedin',
        profileId: VALID_PROFILE_ID,
        text: 'hello world',
        visibility: 'PUBLIC',
        status: 'draft',
      });

    expect(response.status).toBe(201);
    expect(response.body.platform).toBe('linkedin');
  });

  it('rejects linkedin text > 3000 chars on the server (T-API-01)', async () => {
    // Server enforces independently of the client. Even if a malicious
    // client bypassed the UI counter, the API must still reject.
    const response = await buildAuthedRequest(app)
      .post('/api/posts')
      .send({
        platform: 'linkedin',
        profileId: VALID_PROFILE_ID,
        text: 'a'.repeat(3001),
        visibility: 'PUBLIC',
        status: 'draft',
      });
    expect(response.status).toBe(400);
  });

  it('rejects facebook text > 63206 chars on the server (T-API-01)', async () => {
    const response = await buildAuthedRequest(app)
      .post('/api/posts')
      .send({
        platform: 'facebook',
        profileId: VALID_PROFILE_ID,
        text: 'a'.repeat(63207),
        status: 'draft',
      });
    expect(response.status).toBe(400);
  });

  it('rejects mixed payload (linkedin + linkUrl) — T-API-03', async () => {
    // Discriminated union with strict() per variant must reject
    // cross-platform fields. linkUrl is facebook-only.
    const response = await buildAuthedRequest(app)
      .post('/api/posts')
      .send({
        platform: 'linkedin',
        profileId: VALID_PROFILE_ID,
        text: 'hello',
        visibility: 'PUBLIC',
        linkUrl: 'https://example.com',
        status: 'draft',
      });
    expect(response.status).toBe(400);
  });
});
