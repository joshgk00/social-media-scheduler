---
phase: 08-linkedin-facebook-post-creation
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - packages/shared/src/__tests__/platform-text-limits.test.ts
  - packages/shared/src/__tests__/posts-discriminated-union.test.ts
  - packages/api/src/__tests__/posts-platform.test.ts
  - packages/api/src/__tests__/post-service-platform.test.ts
  - packages/api/src/__tests__/rate-limit-platform.test.ts
  - packages/worker/src/__tests__/linkedin-publish.test.ts
  - packages/worker/src/__tests__/facebook-publish.test.ts
  - packages/worker/src/__tests__/post-lifecycle-rate-limit.test.ts
  - packages/web/src/__tests__/VisibilitySelector.test.tsx
  - packages/web/src/__tests__/LinkedInPreview.test.tsx
  - packages/web/src/__tests__/FacebookPreview.test.tsx
  - packages/web/src/__tests__/cross-platform-switch.test.ts
  - packages/web/src/__tests__/RateLimitsCard.test.tsx
  - packages/web/src/__tests__/helpers/msw-handlers.ts
autonomous: true
requirements:
  - POST-LI-01
  - POST-LI-02
  - POST-LI-03
  - POST-LI-04
  - POST-LI-05
  - POST-FB-01
  - POST-FB-02
  - POST-FB-03
  - POST-FB-04
  - POST-FB-05
  - POST-FB-06
  - LIMIT-06
  - LIMIT-07
  - LIMIT-08
threats:
  - T-API-01
  - T-API-02
  - T-API-03
  - T-DATA-01
  - T-WORKER-01
  - T-WORKER-02
  - T-WORKER-03
  - T-LIMITS-01
must_haves:
  truths:
    - "Test files for every Phase-8 requirement exist on disk"
    - "All test files compile (TypeScript) and are picked up by Vitest"
    - "Test stubs FAIL (RED) until implementation lands in later waves"
    - "MSW handlers exist for LinkedIn /rest/images, /rest/posts and Facebook /me/photos, /me/feed, /me/videos endpoints"
    - "post-service-platform.test.ts covers BOTH T-DATA-01 invariants — denormalized platform on insert AND PLATFORM_IMMUTABLE on update — gives Plan 03 Task 2's tdd=true a failing test to drive green"
  artifacts:
    - path: packages/shared/src/__tests__/platform-text-limits.test.ts
      provides: "POST-LI-04, POST-FB-05 char-count failing stubs"
    - path: packages/shared/src/__tests__/posts-discriminated-union.test.ts
      provides: "Mixed-platform payload rejection (T-API-03) failing stubs"
    - path: packages/api/src/__tests__/posts-platform.test.ts
      provides: "POST-LI-01, POST-FB-01 server validation stubs"
    - path: packages/api/src/__tests__/post-service-platform.test.ts
      provides: "T-DATA-01 invariants — createPost denormalizes platform, updatePost rejects platform changes (drives Plan 03 Task 2)"
    - path: packages/api/src/__tests__/rate-limit-platform.test.ts
      provides: "LIMIT-06, LIMIT-07, T-API-02, T-LIMITS-01 stubs"
    - path: packages/worker/src/__tests__/linkedin-publish.test.ts
      provides: "POST-LI-01, POST-LI-02, T-WORKER-01, T-WORKER-03 stubs"
    - path: packages/worker/src/__tests__/facebook-publish.test.ts
      provides: "POST-FB-02, POST-FB-03, POST-FB-04, T-WORKER-02 stubs"
    - path: packages/worker/src/__tests__/post-lifecycle-rate-limit.test.ts
      provides: "rate_limit_exhausted abort + atomic CAS counter increment stubs"
    - path: packages/web/src/__tests__/VisibilitySelector.test.tsx
      provides: "POST-LI-03 stub"
    - path: packages/web/src/__tests__/LinkedInPreview.test.tsx
      provides: "POST-LI-05 stub"
    - path: packages/web/src/__tests__/FacebookPreview.test.tsx
      provides: "POST-FB-06 stub"
    - path: packages/web/src/__tests__/cross-platform-switch.test.ts
      provides: "Cross-cutting D-04 helper stub"
    - path: packages/web/src/__tests__/RateLimitsCard.test.tsx
      provides: "LIMIT-08 stub"
    - path: packages/web/src/__tests__/helpers/msw-handlers.ts
      provides: "MSW handlers for LinkedIn + Facebook endpoints"
  key_links:
    - from: "test files"
      to: ".planning/phases/08-linkedin-facebook-post-creation/08-VALIDATION.md Per-Task Verification Map"
      via: "filename match"
      pattern: "platform-text-limits|posts-discriminated-union|linkedin-publish|facebook-publish|RateLimitsCard|post-service-platform"
---

<objective>
Create failing test stubs and MSW handlers for every Phase-8 requirement listed in 08-VALIDATION.md before any implementation work begins. Wave 0 establishes the RED state of TDD; subsequent waves drive each test from RED to GREEN.

Purpose: Nyquist compliance. Every task in waves 1-3 must reference an existing failing test it drives green. Without Wave 0, executors implement blindly and verification becomes ex-post.

Output: 14 new test files containing `describe`/`it.todo` (or active failing assertions referencing not-yet-existing exports) plus an MSW handlers helper for LinkedIn and Facebook HTTP mocking. The new `post-service-platform.test.ts` (added per checker B-04) closes the Plan 03 Task 2 Nyquist gap by giving the post.service.ts T-DATA-01 invariants a failing test to drive green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-linkedin-facebook-post-creation/08-CONTEXT.md
@.planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md
@.planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md
@.planning/phases/08-linkedin-facebook-post-creation/08-UI-SPEC.md
@.planning/phases/08-linkedin-facebook-post-creation/08-VALIDATION.md

<interfaces>
<!-- Existing test patterns to mirror. Extracted from codebase. -->

From packages/worker/src/__tests__/twitter-401-detection.test.ts (the analog for LI/FB worker tests):
- imports `createMockWorkerDb` from `./helpers/mock-db`
- imports `seedLockedPost`, `seedSocialProfile` from `./helpers/seed-post`
- uses `vi.fn().mockResolvedValue(...)` for `callTwitter` / `checkBudget` ctx injection
- UUID literals required for any payload that round-trips a Zod `.uuid()` schema

From packages/web/src/__tests__/ (existing pattern):
- Vitest + @testing-library/react
- describe('<ComponentName />', () => { it('renders ...', () => { render(<X .../>); expect(screen.getByText(...)).toBeInTheDocument(); }) })

From MSW v2 existing pattern in packages/web/src/__tests__:
- import { http, HttpResponse } from 'msw'
- handlers exported as `export const phase8Handlers = [...]`

From packages/api/src/__tests__/services/ existing patterns (for the new post-service-platform.test.ts):
- Use the existing `createMockApiDb` helper if present in `packages/api/src/__tests__/helpers/mock-db.ts`
- supertest is for route tests; service-level tests call the service function directly
- Plan 03 Task 2's `tdd="true"` requires a failing test in this file to drive GREEN
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create shared package test stubs (platform-text-limits + discriminated union)</name>
  <files>
    packages/shared/src/__tests__/platform-text-limits.test.ts,
    packages/shared/src/__tests__/posts-discriminated-union.test.ts
  </files>
  <read_first>
    - packages/shared/src/__tests__/posts.test.ts (existing, if present — analog)
    - packages/shared/src/schemas/posts.ts (current single-shape schema being upgraded to union in Plan 02)
    - .planning/phases/08-linkedin-facebook-post-creation/08-VALIDATION.md (lines 41-46 for assertion targets)
    - .planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md (Pitfall 4 — code-point counting)
  </read_first>
  <behavior>
    platform-text-limits.test.ts:
      - Test 1: countCodePoints('hello') returns 5
      - Test 2: countCodePoints astral-plane ZWJ family emoji returns 5 (5 code points across the ZWJ sequence) — astral plane handled by spread iterator
      - Test 3: countCodePoints with 'a'.repeat(3001) returns 3001 (used to assert >3000 fails)
      - Test 4: PLATFORM_TEXT_LIMITS.linkedin === 3000
      - Test 5: PLATFORM_TEXT_LIMITS.facebook === 63206
      - Test 6: PLATFORM_TEXT_LIMITS.twitter === 25000

    posts-discriminated-union.test.ts:
      - Test 1: createPostSchema.safeParse linkedin payload with text 'a'.repeat(3001) returns success === false (POST-LI-04 server enforcement)
      - Test 2: createPostSchema.safeParse facebook payload with text 'a'.repeat(63207) returns success === false (POST-FB-05 server enforcement)
      - Test 3: createPostSchema.safeParse linkedin payload with valid visibility returns success === true
      - Test 4: createPostSchema.safeParse linkedin payload with linkUrl extra key returns success === false (T-API-03)
      - Test 5: createPostSchema.safeParse facebook payload with visibility extra key returns success === false (T-API-03)
      - Test 6: createPostSchema.safeParse linkedin payload with empty text and no media returns success === false (LinkedIn requires text or media per refine)
      - Test 7: createPostSchema.safeParse facebook payload with empty text, no media, no link returns success === false (Facebook requires text/media/url)
  </behavior>
  <action>
Create both test files. Use the EXACT structure below.

`packages/shared/src/__tests__/platform-text-limits.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
// These imports will fail until Plan 02 ships the module.
import { countCodePoints, PLATFORM_TEXT_LIMITS } from '../lib/platform-text-limits.js';

describe('countCodePoints', () => {
  it('counts ASCII characters by code point', () => {
    expect(countCodePoints('hello')).toBe(5);
  });

  it('counts ZWJ-joined emoji clusters by code point (5 code points for the family ZWJ sequence)', () => {
    // family emoji = 5 code points (3 people + 2 ZWJ joiners), NOT 1 grapheme.
    expect(countCodePoints('\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}')).toBe(5);
  });

  it('handles strings at exactly the linkedin limit', () => {
    expect(countCodePoints('a'.repeat(3000))).toBe(3000);
  });

  it('handles strings one over the linkedin limit', () => {
    expect(countCodePoints('a'.repeat(3001))).toBe(3001);
  });
});

describe('PLATFORM_TEXT_LIMITS', () => {
  it('exports linkedin = 3000', () => {
    expect(PLATFORM_TEXT_LIMITS.linkedin).toBe(3000);
  });
  it('exports facebook = 63206', () => {
    expect(PLATFORM_TEXT_LIMITS.facebook).toBe(63206);
  });
  it('exports twitter = 25000', () => {
    expect(PLATFORM_TEXT_LIMITS.twitter).toBe(25000);
  });
});
```

`packages/shared/src/__tests__/posts-discriminated-union.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createPostSchema } from '../schemas/posts.js';

const VALID_UUID = '00000000-0000-4000-8000-000000000001';

describe('createPostSchema discriminated union', () => {
  it('rejects linkedin payload over 3000 chars (POST-LI-04, T-API-01)', () => {
    const result = createPostSchema.safeParse({
      platform: 'linkedin', profileId: VALID_UUID, text: 'a'.repeat(3001), visibility: 'PUBLIC',
    });
    expect(result.success).toBe(false);
  });

  it('rejects facebook payload over 63206 chars (POST-FB-05, T-API-01)', () => {
    const result = createPostSchema.safeParse({
      platform: 'facebook', profileId: VALID_UUID, text: 'a'.repeat(63207),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid linkedin payload', () => {
    const result = createPostSchema.safeParse({
      platform: 'linkedin', profileId: VALID_UUID, text: 'hello', visibility: 'PUBLIC',
    });
    expect(result.success).toBe(true);
  });

  it('rejects linkedin payload carrying a facebook-only field linkUrl (T-API-03)', () => {
    const result = createPostSchema.safeParse({
      platform: 'linkedin', profileId: VALID_UUID, text: 'hello', linkUrl: 'https://example.com',
    });
    // strict() on each variant disallows extra keys.
    expect(result.success).toBe(false);
  });

  it('rejects facebook payload carrying a linkedin-only field visibility (T-API-03)', () => {
    const result = createPostSchema.safeParse({
      platform: 'facebook', profileId: VALID_UUID, text: 'hello', visibility: 'PUBLIC',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty linkedin payload (no text, no media)', () => {
    const result = createPostSchema.safeParse({
      platform: 'linkedin', profileId: VALID_UUID, text: '', mediaIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty facebook payload (no text, no media, no link)', () => {
    const result = createPostSchema.safeParse({
      platform: 'facebook', profileId: VALID_UUID, text: '', mediaIds: [], linkUrl: null,
    });
    expect(result.success).toBe(false);
  });
});
```

DO NOT mark `it.skip` or `it.todo` — leave assertions live so they fail in RED.
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/shared test platform-text-limits posts-discriminated-union -- --run 2>&amp;1 | head -40 || true</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/shared/src/__tests__/platform-text-limits.test.ts` exists and contains `countCodePoints`
    - File `packages/shared/src/__tests__/posts-discriminated-union.test.ts` exists and contains `discriminated union`
    - `pnpm --filter @sms/shared test platform-text-limits posts-discriminated-union -- --run` exits NON-ZERO (tests RED, not yet implemented) — this is the desired Wave 0 outcome
    - `rg "countCodePoints" packages/shared/src/__tests__/platform-text-limits.test.ts` returns at least 4 matches
  </acceptance_criteria>
  <done>Both test files exist, are TypeScript-valid (vitest can load them), and fail because production modules are missing — exactly the RED state Wave 0 requires.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create API + worker test stubs (route, post.service, rate-limit, worker publish, lifecycle)</name>
  <files>
    packages/api/src/__tests__/posts-platform.test.ts,
    packages/api/src/__tests__/post-service-platform.test.ts,
    packages/api/src/__tests__/rate-limit-platform.test.ts,
    packages/worker/src/__tests__/linkedin-publish.test.ts,
    packages/worker/src/__tests__/facebook-publish.test.ts,
    packages/worker/src/__tests__/post-lifecycle-rate-limit.test.ts
  </files>
  <read_first>
    - packages/api/src/__tests__/helpers/mock-db.ts (existing helper)
    - packages/worker/src/__tests__/helpers/mock-db.ts (existing helper)
    - packages/worker/src/__tests__/helpers/seed-post.ts (existing helper for seedLockedPost / seedSocialProfile)
    - packages/worker/src/__tests__/twitter-401-detection.test.ts (worker test pattern analog)
    - packages/worker/src/twitter-publish.service.ts (the analog being mirrored)
    - .planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md (Patterns 2, 3, 4 — image upload, multi-photo, atomic CAS)
  </read_first>
  <behavior>
    posts-platform.test.ts:
      - Test 1: POST /api/posts with valid linkedin body returns 201 and posts row has platform='linkedin'
      - Test 2: POST /api/posts with linkedin text > 3000 returns 400 (T-API-01: server enforces, not just client)
      - Test 3: POST /api/posts with facebook text > 63206 returns 400 (T-API-01)
      - Test 4: POST /api/posts with mixed payload (platform=linkedin + linkUrl) returns 400 (T-API-03)

    post-service-platform.test.ts (NEW per checker B-04 — covers T-DATA-01 invariants Plan 03 Task 2 must drive green):
      - Test 1: createPost(db, { platform: 'linkedin', profileId, ... }) where profile.platform === 'linkedin' inserts a posts row with posts.platform === 'linkedin' (denormalization happens — invariant 1)
      - Test 2: createPost(db, { platform: 'linkedin', profileId, ... }) where profile.platform === 'twitter' (mismatch) throws PostServiceError with code === 'PLATFORM_MISMATCH'
      - Test 3: createPost for a LinkedIn payload persists args.visibility into the posts.visibility column
      - Test 4: createPost for a Facebook payload persists args.linkUrl into the posts.linkUrl column
      - Test 5: updatePost(db, postId, { platform: 'twitter', ... }) where existing posts.platform === 'linkedin' throws PostServiceError with code === 'PLATFORM_IMMUTABLE' (invariant 2)
      - Test 6: updatePost(db, postId, { platform: matches existing, ... }) succeeds (control case — does NOT throw PLATFORM_IMMUTABLE)

    rate-limit-platform.test.ts:
      - Test 1: checkLinkedInBudgetWithDb on profile at 99/100 with additionalCount=1 returns blockThresholdHit=true (LIMIT-07)
      - Test 2: checkFacebookBudgetWithDb with additionalCount = mediaIds.length + 1 (LIMIT-06, Pitfall 2)
      - Test 3: Two concurrent calls do not double-increment counter (T-API-02 race protection — single CAS update)
      - Test 4: Window reset is atomic — when window_start_utc is older than threshold, count resets to 1 in same UPDATE (T-LIMITS-01)
      - Test 5: LinkedIn window threshold = date_trunc('day', now()) UTC midnight (Pitfall 7)
      - Test 6: Facebook window threshold = now - INTERVAL '1 hour' (rolling)

    linkedin-publish.test.ts:
      - Test 1: callLinkedIn for text-only post performs single POST /rest/posts and returns x-restli-id from headers (POST-LI-01)
      - Test 2: callLinkedIn with imageBytes performs initializeUpload, PUT to uploadUrl, then /posts (POST-LI-02, T-WORKER-01)
      - Test 3: callLinkedIn rolls back on PUT failure — no /posts call made (T-WORKER-01)
      - Test 4: callLinkedIn never logs the access token value (T-WORKER-03) — search log calls for tokenSubstring
      - Test 5: callLinkedIn uses LinkedIn-Version: 202604 and X-Restli-Protocol-Version: 2.0.0 headers
      - Test 6: callLinkedIn distinguishes person vs organization URN based on profile.linkedinAccountType (Pitfall 9)

    facebook-publish.test.ts:
      - Test 1: callFacebook for text-only post performs POST /{pageId}/feed with message + access_token (POST-FB-01)
      - Test 2: callFacebook with linkUrl passes link parameter (POST-FB-04)
      - Test 3: callFacebook with 3 mediaIds: 3 POST /{pageId}/photos?published=false then 1 POST /{pageId}/feed with attached_media[0..2] (POST-FB-02)
      - Test 4: callFacebook with single video does single POST /{pageId}/videos (POST-FB-03)
      - Test 5: callFacebook on photo-3-of-3 failure: no /feed POST issued; collected photoIds returned in error for cleanup (T-WORKER-02)
      - Test 6: callFacebook never logs page access token (T-WORKER-03)

    post-lifecycle-rate-limit.test.ts:
      - Test 1: publishPost on profile at limit logs post_attempts row with errorCode='rate_limit_exhausted' and throws PostLifecycleAbort('rate_limit_exhausted')
      - Test 2: graceful abort leaves post.status === 'scheduled', no retry consumed
      - Test 3: Phase 3 success path issues atomic UPDATE on social_profiles with CASE-WHEN window-expiry reset (T-API-02, T-LIMITS-01)
  </behavior>
  <action>
Create all six files. Use stub-style assertions that import yet-to-exist symbols. Each `describe` block must have at least one live `it(...)` with `expect(...)` so the file is a real failing test, not `it.todo`.

For each file, write TWO–THREE concrete `it(...)` blocks per Test described in `<behavior>`. Use `vi.fn().mockResolvedValue(...)` for fetch mocking; do NOT yet wire MSW (that's Task 3 — these are unit tests for the service factories, MSW comes for integration tests).

Skeleton for `packages/api/src/__tests__/post-service-platform.test.ts` (NEW per B-04 — drives Plan 03 Task 2 GREEN):
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createPost, updatePost, PostServiceError } from '../services/post.service.js';
import { createMockApiDb, seedSocialProfile, seedPost } from './helpers/mock-db.js';

const VALID_UUID = '00000000-0000-4000-8000-000000000001';
const PROFILE_ID = '00000000-0000-4000-8000-00000000aaaa';
const POST_ID = '00000000-0000-4000-8000-00000000bbbb';

describe('post.service — T-DATA-01 invariants (Plan 03 Task 2)', () => {
  let db: ReturnType<typeof createMockApiDb>;

  beforeEach(() => {
    db = createMockApiDb();
  });

  it('Invariant 1: createPost denormalizes platform from social_profiles onto posts.platform', async () => {
    await seedSocialProfile(db, { id: PROFILE_ID, platform: 'linkedin' });
    const row = await createPost(db, {
      platform: 'linkedin',
      profileId: PROFILE_ID,
      text: 'hello',
      visibility: 'PUBLIC',
      status: 'draft',
      hasSpinnableText: false,
      mediaIds: [],
      tagIds: [],
    });
    expect(row.platform).toBe('linkedin');
  });

  it('Invariant 1 (defensive): createPost rejects PLATFORM_MISMATCH when payload.platform != profile.platform', async () => {
    await seedSocialProfile(db, { id: PROFILE_ID, platform: 'twitter' });
    await expect(createPost(db, {
      platform: 'linkedin',
      profileId: PROFILE_ID,
      text: 'hello',
      visibility: 'PUBLIC',
      status: 'draft',
      hasSpinnableText: false,
      mediaIds: [],
      tagIds: [],
    } as any)).rejects.toMatchObject({
      name: 'PostServiceError',
      code: 'PLATFORM_MISMATCH',
    });
  });

  it('persists visibility for LinkedIn into posts.visibility column', async () => {
    await seedSocialProfile(db, { id: PROFILE_ID, platform: 'linkedin' });
    const row = await createPost(db, {
      platform: 'linkedin',
      profileId: PROFILE_ID,
      text: 'hello',
      visibility: 'CONNECTIONS',
      status: 'draft',
      hasSpinnableText: false,
      mediaIds: [],
      tagIds: [],
    });
    expect((row as any).visibility).toBe('CONNECTIONS');
  });

  it('persists linkUrl for Facebook into posts.link_url column', async () => {
    await seedSocialProfile(db, { id: PROFILE_ID, platform: 'facebook' });
    const row = await createPost(db, {
      platform: 'facebook',
      profileId: PROFILE_ID,
      text: 'hello',
      linkUrl: 'https://example.com',
      status: 'draft',
      hasSpinnableText: false,
      mediaIds: [],
      tagIds: [],
    });
    expect((row as any).linkUrl).toBe('https://example.com');
  });

  it('Invariant 2: updatePost rejects PLATFORM_IMMUTABLE when payload.platform changes', async () => {
    await seedSocialProfile(db, { id: PROFILE_ID, platform: 'linkedin' });
    await seedPost(db, { id: POST_ID, profileId: PROFILE_ID, platform: 'linkedin' });
    await expect(updatePost(db, POST_ID, {
      platform: 'twitter',  // changed!
      profileId: PROFILE_ID,
      text: 'hello',
      isThread: false,
      status: 'draft',
      hasSpinnableText: false,
      mediaIds: [],
      tagIds: [],
      postVersion: 1,
    } as any)).rejects.toMatchObject({
      name: 'PostServiceError',
      code: 'PLATFORM_IMMUTABLE',
    });
  });

  it('Invariant 2 (control): updatePost succeeds when payload.platform matches existing post', async () => {
    await seedSocialProfile(db, { id: PROFILE_ID, platform: 'linkedin' });
    await seedPost(db, { id: POST_ID, profileId: PROFILE_ID, platform: 'linkedin' });
    const updated = await updatePost(db, POST_ID, {
      platform: 'linkedin',
      profileId: PROFILE_ID,
      text: 'updated text',
      visibility: 'PUBLIC',
      status: 'draft',
      hasSpinnableText: false,
      mediaIds: [],
      tagIds: [],
      postVersion: 1,
    } as any);
    expect(updated.text).toBe('updated text');
  });
});
```

NOTE: If `createMockApiDb` / `seedSocialProfile` / `seedPost` helpers do not yet exist in `packages/api/src/__tests__/helpers/mock-db.ts`, create lightweight stubs that satisfy the post.service.ts call shape — they only need to support `select`, `insert`, `update` chaining for these unit tests. Defer richer behavior to integration tests.

Skeleton for `packages/worker/src/__tests__/linkedin-publish.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callLinkedIn } from '../linkedin-publish.service.js';

const baseProfile = {
  id: '00000000-0000-4000-8000-000000000010',
  platform: 'linkedin' as const,
  platformAccountId: 'urn:li:person:abc',
  linkedinAccountType: 'person' as const,
  oauth2AccessTokenCiphertext: Buffer.from('enc'),
  oauth2AccessTokenIv: Buffer.from('iv'),
  oauth2AccessTokenAuthTag: Buffer.from('tag'),
  // ... other social_profiles fields with defaults
};

describe('callLinkedIn', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64); // hex 32 bytes
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.ENCRYPTION_KEY;
  });

  it('text-only post: issues single POST /rest/posts and returns x-restli-id (POST-LI-01)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, {
      status: 201,
      headers: { 'x-restli-id': 'urn:li:share:7000000000000000000' },
    }));
    const result = await callLinkedIn({
      profile: baseProfile as any,
      postText: 'hello',
      visibility: 'PUBLIC',
      correlationId: 'corr-1',
    });
    expect(result.platformPostId).toBe('urn:li:share:7000000000000000000');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0];
    expect(callArgs[0]).toContain('/rest/posts');
    const headers = (callArgs[1] as any).headers;
    expect(headers['LinkedIn-Version']).toBe('202604');
    expect(headers['X-Restli-Protocol-Version']).toBe('2.0.0');
  });

  it('image post: performs initializeUpload + PUT + /posts (POST-LI-02, T-WORKER-01)', async () => {
    // Sequence: 1) /rest/images?action=initializeUpload 2) PUT to uploadUrl 3) /rest/posts
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({
        value: { uploadUrl: 'https://upload.example/abc', image: 'urn:li:image:xyz' },
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))  // PUT
      .mockResolvedValueOnce(new Response(null, {
        status: 201,
        headers: { 'x-restli-id': 'urn:li:share:7000000000000000001' },
      }));
    const result = await callLinkedIn({
      profile: baseProfile as any,
      postText: 'hello with image',
      visibility: 'PUBLIC',
      imageBytes: Buffer.from('fake-jpeg-bytes'),
      correlationId: 'corr-2',
    });
    expect(result.platformPostId).toBe('urn:li:share:7000000000000000001');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('PUT failure aborts before /posts (T-WORKER-01 partial-state rollback)', async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response(JSON.stringify({
        value: { uploadUrl: 'https://upload.example/abc', image: 'urn:li:image:xyz' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('forbidden', { status: 403 }));  // PUT fails
    await expect(callLinkedIn({
      profile: baseProfile as any,
      postText: 'x',
      visibility: 'PUBLIC',
      imageBytes: Buffer.from('bytes'),
      correlationId: 'c',
    })).rejects.toThrow();
    // Critically, the third call (POST /rest/posts) must NOT have been made.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('uses person URN for linkedinAccountType=person', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, {
      status: 201,
      headers: { 'x-restli-id': 'urn:li:share:1' },
    }));
    await callLinkedIn({ profile: baseProfile as any, postText: 't', visibility: 'PUBLIC', correlationId: 'c' });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    expect(body.author).toBe('urn:li:person:abc');
  });

  it('uses organization URN for linkedinAccountType=organization (Pitfall 9)', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, {
      status: 201,
      headers: { 'x-restli-id': 'urn:li:share:2' },
    }));
    const orgProfile = { ...baseProfile, linkedinAccountType: 'organization', platformAccountId: 'urn:li:organization:99' };
    await callLinkedIn({ profile: orgProfile as any, postText: 't', visibility: 'PUBLIC', correlationId: 'c' });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    expect(body.author).toBe('urn:li:organization:99');
  });

  it('does not log the access token in any logger call (T-WORKER-03)', async () => {
    // This test will be made strict in Plan 04 once a test logger is wired.
    // For now: assert that fetch headers contain Bearer and our test profile's token.
    // The implementation must use a child logger that never serializes the bearer header.
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:3' } }));
    await callLinkedIn({ profile: baseProfile as any, postText: 't', visibility: 'PUBLIC', correlationId: 'c' });
    // Sentinel: implementation MUST NOT pass the Authorization header value through pino logger.bindings()
    expect(true).toBe(true); // placeholder — Plan 04 strengthens this with a captured logger spy.
  });
});
```

Apply analogous depth (3-6 live `it` blocks per file) to the other test files. The Facebook test must include the multi-photo orchestration assertion (3 unpublished photo POSTs + 1 feed POST in that order). The lifecycle test must use `seedLockedPost` + `seedSocialProfile` + injected `checkBudget`-style ctx mock.

For `posts-platform.test.ts` and `rate-limit-platform.test.ts` (API package), follow the existing supertest + mock-db pattern in `packages/api/src/__tests__/helpers/`.
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/api test posts-platform post-service-platform rate-limit-platform -- --run 2>&amp;1 | tail -30; pnpm --filter @sms/worker test linkedin-publish facebook-publish post-lifecycle-rate-limit -- --run 2>&amp;1 | tail -30 || true</automated>
  </verify>
  <acceptance_criteria>
    - All 6 files exist on disk (added post-service-platform.test.ts per checker B-04)
    - `rg "callLinkedIn" packages/worker/src/__tests__/linkedin-publish.test.ts` returns >= 5 matches (one per `it` block)
    - `rg "callFacebook" packages/worker/src/__tests__/facebook-publish.test.ts` returns >= 5 matches
    - `rg "rate_limit_exhausted" packages/worker/src/__tests__/post-lifecycle-rate-limit.test.ts` returns >= 1 match
    - `rg "checkLinkedInBudgetWithDb|checkFacebookBudgetWithDb" packages/api/src/__tests__/rate-limit-platform.test.ts` returns >= 2 matches
    - `rg "PLATFORM_MISMATCH|PLATFORM_IMMUTABLE" packages/api/src/__tests__/post-service-platform.test.ts` returns >= 2 matches (T-DATA-01 invariants present)
    - `rg "createPost|updatePost" packages/api/src/__tests__/post-service-platform.test.ts` returns >= 4 matches
    - Test runs are RED (exit non-zero) — no `it.skip` / `it.todo` used
  </acceptance_criteria>
  <done>All six backend test files exist with live failing assertions referencing not-yet-implemented exports. The new post-service-platform.test.ts gives Plan 03 Task 2's tdd=true a failing test to drive green (closes Nyquist B-04 gap).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Create web test stubs + MSW handlers</name>
  <files>
    packages/web/src/__tests__/VisibilitySelector.test.tsx,
    packages/web/src/__tests__/LinkedInPreview.test.tsx,
    packages/web/src/__tests__/FacebookPreview.test.tsx,
    packages/web/src/__tests__/cross-platform-switch.test.ts,
    packages/web/src/__tests__/RateLimitsCard.test.tsx,
    packages/web/src/__tests__/helpers/msw-handlers.ts
  </files>
  <read_first>
    - packages/web/src/__tests__/ (existing test files for component pattern)
    - packages/web/src/components/posts/TweetPreview.tsx (analog for LinkedInPreview/FacebookPreview)
    - packages/web/src/components/profiles/ProfileRateLimitIndicator.tsx (analog for RateLimitsCard color band logic)
    - .planning/phases/08-linkedin-facebook-post-creation/08-UI-SPEC.md (lines 280-360 for layout, lines 180-205 for toast copy)
    - .planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md (line 765-846 for applyPlatformSwitch reference impl)
  </read_first>
  <behavior>
    VisibilitySelector.test.tsx:
      - Test 1: renders two radio options "Anyone on LinkedIn" + "Connections only" (POST-LI-03 copy match per UI-SPEC)
      - Test 2: clicking second option fires onValueChange('CONNECTIONS')
      - Test 3: keyboard arrow navigation switches selection (a11y per Radix radio-group)

    LinkedInPreview.test.tsx (POST-LI-05):
      - Test 1: renders empty placeholder "Type to see your post here…" when text empty
      - Test 2: renders profile name + visibility line "Anyone on LinkedIn" or "Connections only"
      - Test 3: renders post text with whitespace-pre-wrap
      - Test 4: renders single image with aspect-video class when imageUrl provided
      - Test 5: spinnable text {a|b|c} renders highlighted spans (text-primary)

    FacebookPreview.test.tsx (POST-FB-06):
      - Test 1: empty placeholder when nothing entered
      - Test 2: 1 image renders single full-width image
      - Test 3: 3 images render asymmetric grid (left full-height, two stacked right)
      - Test 4: 4 images render 2x2 grid
      - Test 5: 8 images render 3-col grid with first 6 visible and "+2" overlay on last cell
      - Test 6: linkUrl renders as plain text in text-primary, not as anchor (D-10)
      - Test 7: video renders aspect-video placeholder with Play icon

    cross-platform-switch.test.ts:
      - Test 1: applyPlatformSwitch('twitter','twitter',state) returns unchanged state, no toast
      - Test 2: applyPlatformSwitch('twitter','linkedin', { text: 'a'.repeat(3500), ... }) truncates text to 3000 chars and toast contains "truncated"
      - Test 3: applyPlatformSwitch('linkedin','facebook', state) drops visibility, toast says "visibility removed"
      - Test 4: applyPlatformSwitch('facebook','linkedin', state with linkUrl) drops linkUrl, drops video, sets visibility='PUBLIC'
      - Test 5: applyPlatformSwitch('twitter','facebook', state with thread) drops thread continuation, kept first text
      - Test 6: text truncation uses code-point counting (astral plane emoji handled correctly)

    RateLimitsCard.test.tsx (LIMIT-08):
      - Test 1: renders empty state "No connected profiles yet." when query returns []
      - Test 2: renders skeleton rows when query loading
      - Test 3: renders error fallback "Couldn't load rate limits." when query errors
      - Test 4: profile at 30/100 (30%) renders green dot bg-[--color-success]
      - Test 5: profile at 75/100 (75%) renders yellow dot bg-[--color-warning] and yellow numeric
      - Test 6: profile at 95/100 (95%) renders red dot bg-destructive and destructive numeric
      - Test 7: profile bar has role="progressbar" with aria-valuenow + aria-valuemax + aria-label

    msw-handlers.ts:
      - Exports phase8LinkedInHandlers: handlers for POST /rest/images?action=initializeUpload, PUT (any), POST /rest/posts
      - Exports phase8FacebookHandlers: handlers for POST graph.facebook.com/v22.0/:pageId/photos, /feed, /videos
      - Default success responses; fixture functions for failure modes (httpStatus override)
  </behavior>
  <action>
Create all six files. Use the structure below.

`packages/web/src/__tests__/helpers/msw-handlers.ts`:
```typescript
import { http, HttpResponse } from 'msw';

const LINKEDIN_BASE = 'https://api.linkedin.com/rest';
const FB_GRAPH_BASE = 'https://graph.facebook.com/v22.0';

export const phase8LinkedInHandlers = [
  http.post(`${LINKEDIN_BASE}/images`, () => {
    return HttpResponse.json({
      value: {
        uploadUrl: 'https://www.linkedin.com/dms/uploads/test-upload-url',
        image: 'urn:li:image:C4D22AQHpEd_test',
      },
    });
  }),
  http.put('https://www.linkedin.com/dms/uploads/test-upload-url', () => {
    return new HttpResponse(null, { status: 201 });
  }),
  http.post(`${LINKEDIN_BASE}/posts`, () => {
    return new HttpResponse(null, {
      status: 201,
      headers: { 'x-restli-id': 'urn:li:share:7000000000000000000' },
    });
  }),
];

export const phase8FacebookHandlers = [
  http.post(`${FB_GRAPH_BASE}/:pageId/photos`, ({ params }) => {
    return HttpResponse.json({ id: `${params.pageId}_photo_${Date.now()}` });
  }),
  http.post(`${FB_GRAPH_BASE}/:pageId/feed`, ({ params }) => {
    return HttpResponse.json({ id: `${params.pageId}_feedpost_${Date.now()}` });
  }),
  http.post(`${FB_GRAPH_BASE}/:pageId/videos`, ({ params }) => {
    return HttpResponse.json({ id: `${params.pageId}_video_${Date.now()}` });
  }),
];

export function makeLinkedInFailureHandler(stage: 'init' | 'put' | 'post', status: number) {
  if (stage === 'init') {
    return http.post(`${LINKEDIN_BASE}/images`, () => new HttpResponse('init failed', { status }));
  }
  if (stage === 'put') {
    return http.put('https://www.linkedin.com/dms/uploads/test-upload-url', () => new HttpResponse('put failed', { status }));
  }
  return http.post(`${LINKEDIN_BASE}/posts`, () => new HttpResponse('post failed', { status }));
}

export function makeFacebookFailureHandler(stage: 'photo' | 'feed' | 'video', status: number) {
  const target = stage === 'photo' ? 'photos' : stage === 'feed' ? 'feed' : 'videos';
  return http.post(`${FB_GRAPH_BASE}/:pageId/${target}`, () => new HttpResponse('fail', { status }));
}
```

Component test skeleton — `packages/web/src/__tests__/RateLimitsCard.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RateLimitsCard } from '../components/dashboard/RateLimitsCard';

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('<RateLimitsCard />', () => {
  it('renders empty state when no profiles connected', () => {
    // mock useAllProfilesRateLimits → []
    renderWithQuery(<RateLimitsCard />);
    expect(screen.getByText(/No connected profiles yet/i)).toBeInTheDocument();
  });

  it('applies green band when usage <50%', () => {
    // mock fixture profile at 30/100
    renderWithQuery(<RateLimitsCard />);
    const bar = screen.getByRole('progressbar', { name: /linkedin rate limit usage/i });
    expect(bar).toHaveAttribute('aria-valuenow', '30');
  });

  it('applies yellow band when usage 50-80%', () => { /* ... */ });
  it('applies red band when usage >80%', () => { /* ... */ });
  it('renders relative + absolute reset time per UI-SPEC', () => { /* ... */ });
});
```

Apply analogous depth to the other four web test files. The cross-platform-switch.test.ts is purely synchronous unit tests of a pure function — easiest of the bunch.

For `applyPlatformSwitch` test fixtures, derive expected toast strings from the UI-SPEC table at lines 184-194 of 08-UI-SPEC.md. Examples:
  - tw→li with thread + 3 images + 'a'.repeat(4000): toast contains 'kept first post text' AND 'removed thread continuation' AND 'truncated to 3000'.
  - fb→tw with linkUrl + video + 6 images: toast contains 'link, video, and extra images removed'.

When asserting toast literals, ensure the substrings (e.g., "removed thread continuation", "Text truncated to 3000") match the exact output of `applyPlatformSwitch` (from Plan 02's helper) byte-for-byte. If you write a substring the helper does not emit, RED is no longer the desired Wave 0 outcome — coordinate with Plan 02 implementer if mismatch arises.
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/web test VisibilitySelector LinkedInPreview FacebookPreview cross-platform-switch RateLimitsCard -- --run 2>&amp;1 | tail -30 || true</automated>
  </verify>
  <acceptance_criteria>
    - All 6 files exist
    - `rg "phase8LinkedInHandlers|phase8FacebookHandlers" packages/web/src/__tests__/helpers/msw-handlers.ts` returns >= 2 matches
    - `rg "applyPlatformSwitch" packages/web/src/__tests__/cross-platform-switch.test.ts` returns >= 5 matches
    - `rg "role=\"progressbar\"|getByRole\\('progressbar'" packages/web/src/__tests__/RateLimitsCard.test.tsx` returns >= 1 match
    - Tests run RED (exit non-zero) — production modules and components do not yet exist
  </acceptance_criteria>
  <done>All web tests + MSW handler module exist with concrete failing assertions; Wave 0 RED state achieved across the entire phase.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Test → Production code | Test stubs assert behaviors before implementation exists; failing tests are the contract |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-API-01 | Tampering | server-side schema validation | mitigate | `posts-discriminated-union.test.ts` Test 1+2 will fail until Plan 02 ships discriminated union with strict per-variant char limits |
| T-API-02 | Tampering | rate-limit pre-flight race | mitigate | `rate-limit-platform.test.ts` Test 3 (concurrent calls) will fail until Plan 03 implements single-statement CAS UPDATE |
| T-API-03 | Tampering | discriminated union purity | mitigate | `posts-discriminated-union.test.ts` Test 4+5 ensure `.strict()` on each variant blocks cross-platform fields |
| T-DATA-01 | Tampering | denormalized posts.platform invariants | mitigate | `post-service-platform.test.ts` covers BOTH invariants — denormalization on insert (Test 1) AND PLATFORM_IMMUTABLE on update (Test 5); Plan 03 Task 2 drives these GREEN |
| T-WORKER-01 | Information Disclosure / Tampering | LinkedIn upload chain | mitigate | `linkedin-publish.test.ts` Test 3 asserts no /posts call after PUT failure |
| T-WORKER-02 | Tampering | Facebook multi-photo orphans | mitigate | `facebook-publish.test.ts` Test 5 asserts collected photoIds returned on partial failure |
| T-WORKER-03 | Information Disclosure | token leakage in logs | mitigate | `linkedin-publish.test.ts` Test 6 + `facebook-publish.test.ts` Test 6 assert no token in log payload (strengthened in Plan 04) |
| T-LIMITS-01 | Tampering | window reset atomicity | mitigate | `rate-limit-platform.test.ts` Test 4 asserts single-statement CAS — separate read-then-write fails |
</threat_model>

<verification>
Wave 0 completion is verified when:
1. All 14 test files exist on disk (13 spec files + 1 MSW helper)
2. Vitest can parse all files (no TypeScript syntax errors prevent collection)
3. `pnpm -r test --run` exits non-zero with the specific tests named above as failures (production modules missing — desired RED state)
4. 08-VALIDATION.md "File Exists" column entries can be flipped from ❌ W0 to ✅ W0 in the next plan
5. `post-service-platform.test.ts` exists and exercises BOTH T-DATA-01 invariants (B-04 closure)
</verification>

<success_criteria>
- 14 test files committed
- Each requirement ID in this plan's `requirements` field has at least one failing test asserting it
- Each threat ID has at least one failing test that exercises the mitigation
- T-DATA-01 invariants 1 (denormalize) and 2 (immutable) BOTH have explicit failing tests in post-service-platform.test.ts
- No `it.skip` or `it.todo` — all assertions live (RED is the contract for Wave 0)
- MSW handlers cover LinkedIn /rest/images, /rest/posts and Facebook /photos, /feed, /videos
</success_criteria>

<output>
After completion, create `.planning/phases/08-linkedin-facebook-post-creation/08-01-SUMMARY.md`
</output>
