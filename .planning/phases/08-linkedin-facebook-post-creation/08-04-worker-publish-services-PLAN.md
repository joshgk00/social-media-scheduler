---
phase: 08-linkedin-facebook-post-creation
plan: 04
type: execute
wave: 2
depends_on: [02]
files_modified:
  - packages/worker/src/linkedin-publish.service.ts
  - packages/worker/src/facebook-publish.service.ts
  - packages/worker/src/post-lifecycle.service.ts
  - packages/worker/src/publish-worker.ts
  - packages/worker/src/rate-limit.ts
  - packages/shared/src/lib/error-classifier.ts
autonomous: true
requirements:
  - POST-LI-01
  - POST-LI-02
  - POST-FB-01
  - POST-FB-02
  - POST-FB-03
  - POST-FB-04
  - LIMIT-06
  - LIMIT-07
threats:
  - T-API-02
  - T-WORKER-01
  - T-WORKER-02
  - T-WORKER-03
  - T-LIMITS-01
must_haves:
  truths:
    - "callLinkedIn publishes text-only posts with single POST /rest/posts and returns x-restli-id"
    - "callLinkedIn with image: initializeUpload + PUT + posts call; PUT failure aborts before posts call (T-WORKER-01)"
    - "callLinkedIn dispatches person vs organization URN via typed profile.linkedinAccountType column (Plan 02 added)"
    - "callFacebook publishes text-only with POST /{pageId}/feed and link parameter when linkUrl present"
    - "callFacebook multi-photo: N unpublished photo POSTs then 1 feed POST with attached_media[]"
    - "callFacebook on partial photo upload failure returns collected photoIds in error for later cleanup (T-WORKER-02)"
    - "Neither service logs the access token value or includes it in BullMQ job payload (T-WORKER-03)"
    - "publishPost lifecycle adds rate_limit_exhausted abort reason; mirrors token_unhealthy pattern (D-07)"
    - "publish-worker dispatches on post.platform; rate_limit_exhausted is graceful (no retry consumed)"
    - "publish-worker reads typed post.visibility and post.linkUrl directly — no `as Record<string, unknown>` casts (Plan 02 columns now exist)"
    - "Phase 3 success path increments per-platform window counter via single-statement CAS UPDATE (T-API-02, T-LIMITS-01)"
  artifacts:
    - path: packages/worker/src/linkedin-publish.service.ts
      provides: "callLinkedIn(args) → { platformPostId } including 3-step image upload"
      contains: "export async function callLinkedIn"
    - path: packages/worker/src/facebook-publish.service.ts
      provides: "callFacebook(args) → { platformPostId } including multi-photo + video paths"
      contains: "export async function callFacebook"
    - path: packages/worker/src/post-lifecycle.service.ts
      provides: "rate_limit_exhausted abort + per-platform counter increment in Phase 3"
    - path: packages/worker/src/publish-worker.ts
      provides: "Platform dispatcher selecting callTwitter/callLinkedIn/callFacebook by post.platform; reads typed post.visibility / post.linkUrl"
    - path: packages/worker/src/rate-limit.ts
      provides: "loadLinkedInWindowUsage, loadFacebookWindowUsage, checkLinkedInBudgetForWorker, checkFacebookBudgetForWorker"
    - path: packages/shared/src/lib/error-classifier.ts
      provides: "classifyLinkedInError, classifyFacebookError"
  key_links:
    - from: "packages/worker/src/publish-worker.ts"
      to: "packages/worker/src/linkedin-publish.service.ts AND packages/worker/src/facebook-publish.service.ts"
      via: "platform dispatcher in handler"
      pattern: "post.platform === 'linkedin'|post.platform === 'facebook'"
    - from: "packages/worker/src/post-lifecycle.service.ts"
      to: "social_profiles linkedin_daily_count / facebook_hourly_count"
      via: "atomic CAS UPDATE inside Phase 3 transaction"
      pattern: "CASE.*WHEN.*window_start"
---

<objective>
Land the worker-side platform branching: two new publish services (callLinkedIn, callFacebook) parallel to the existing callTwitter; lifecycle-service extension for the rate_limit_exhausted graceful abort; publish-worker handler that dispatches on post.platform; per-platform rate-limit re-check + atomic counter increment in the Phase 3 success path; shared error classifier extensions.

Purpose: This wave runs in parallel with Plan 03 (API). Together they realize POST-LI-01/02, POST-FB-01/02/03/04, LIMIT-06, LIMIT-07. The mitigations for T-WORKER-01/02/03 + T-API-02 + T-LIMITS-01 all live in this plan's code.

Output: Worker pipeline transparently publishes to twitter/linkedin/facebook based on post.platform; publish dispatch is graceful when at limit; counters increment atomically only on success. All worker code uses typed access for `linkedinAccountType`, `oauth2AccessToken*`, `visibility`, and `linkUrl` — Plan 02 added these columns to the schema and the cascade removes every `as Record<string, unknown>` cast that the prior draft used as a workaround.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-linkedin-facebook-post-creation/08-CONTEXT.md
@.planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md
@.planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md
@packages/worker/src/twitter-publish.service.ts
@packages/worker/src/post-lifecycle.service.ts
@packages/worker/src/publish-worker.ts
@packages/worker/src/rate-limit.ts
@packages/shared/src/lib/error-classifier.ts

<interfaces>
<!-- Existing types and exports the executor must extend or mirror. -->

From packages/worker/src/twitter-publish.service.ts (the analog being mirrored):
- export interface CallTwitterArgs { profile, postText, isThread, correlationId }
- export interface CallTwitterResult { platformPostId, threadIds? }
- export async function callTwitter(args: CallTwitterArgs): Promise<CallTwitterResult>
- export class TwitterPublishCredentialError extends Error
- env-read INSIDE function: process.env.ENCRYPTION_KEY
- decrypt via @sms/shared/encryption
- IMPORT PATHS (verified): `import { decrypt, validateEncryptionKey } from '@sms/shared/encryption'` and `import { createLogger } from '@sms/shared/logger'`
- usage: `const logger = createLogger('twitter-publish')`

From packages/worker/src/post-lifecycle.service.ts (current state):
- export type LifecycleAbortReason = 'version_mismatch' | 'already_published' | 'not_scheduled' | 'budget_exhausted' | 'thread_unsupported' | 'media_pending' | 'token_unhealthy'
- export class PostLifecycleAbort extends Error { reason: LifecycleAbortReason }
- token-health pre-flight pattern (lines 221-236) — the EXACT template for rate_limit_exhausted

From packages/worker/src/publish-worker.ts (current state):
- createPublishHandler({ db, callTwitterImpl, ... }) → BullMQ handler
- inside handler: graceful-abort list (lines 126-143)

From packages/api/src/services/linkedin.service.ts (Phase 7 — reuse error class shape):
- DEFAULT_API_VERSION = '202604'
- LinkedInApiError class with status + body + sanitized

From packages/api/src/services/facebook.service.ts (Phase 7 — reuse):
- DEFAULT_GRAPH_VERSION = 'v25.0' (override via FACEBOOK_GRAPH_VERSION)
- FacebookApiError class
- TOKEN_SHAPED_SEQUENCE_RE + sanitizeErrorBody helper for log-safe errors

From Plan 02 (@sms/shared):
- checkLinkedInBudget, checkFacebookBudget pure calculators
- PlatformBudgetSnapshot interface

From Plan 02 (@sms/db schema — new columns now exist as TYPED fields, NO casts needed):
- socialProfiles.linkedinAccountType: varchar(16) NOT NULL DEFAULT 'person' — type-safe access via `profile.linkedinAccountType`
- posts.visibility: varchar(16) nullable — type-safe access via `post.visibility`
- posts.linkUrl: text nullable — type-safe access via `post.linkUrl`
- All oauth2AccessToken* columns from Phase 7 are typed bytea — no casts needed
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create callLinkedIn worker service (text + 3-step image upload)</name>
  <files>
    packages/worker/src/linkedin-publish.service.ts
  </files>
  <read_first>
    - packages/worker/src/twitter-publish.service.ts (lines 1-150 — the line-for-line analog)
    - **Confirm exact import paths in twitter-publish.service.ts and mirror them verbatim:** `@sms/shared/encryption` for decrypt/validateEncryptionKey, `@sms/shared/logger` for createLogger. Do NOT invent alternative paths.
    - packages/api/src/services/linkedin.service.ts (Phase 7 — DEFAULT_API_VERSION, LinkedInApiError, sanitizeErrorBody)
    - packages/worker/src/__tests__/linkedin-publish.test.ts (Plan 01 stubs driving this implementation)
    - .planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md (Pattern 2 lines 360-426 for 3-step upload, Pitfall 9 for URN type)
    - .planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md (lines 52-103 for analog mapping)
  </read_first>
  <behavior>
    - callLinkedIn({ profile, postText, visibility, imageBytes?, correlationId }) → { platformPostId }
    - Reads ENCRYPTION_KEY inside function (not module scope)
    - Validates oauth2AccessToken triplet present; throws LinkedInPublishCredentialError if missing
    - Decrypts access token via @sms/shared decrypt()
    - Constructs author URN: 'urn:li:person:{id}' or 'urn:li:organization:{id}' based on TYPED profile.linkedinAccountType (Plan 02 added this column — no `as Record<string, unknown>` cast)
    - If imageBytes provided: 3-step upload (initializeUpload → PUT to uploadUrl → reference URN in posts payload)
    - Builds /rest/posts JSON body with commentary, visibility, distribution=MAIN_FEED, lifecycleState=PUBLISHED
    - Headers: Authorization: Bearer, LinkedIn-Version: env-or-202604, X-Restli-Protocol-Version: 2.0.0, Content-Type: application/json
    - Reads platformPostId from x-restli-id response header (fallback to body if header missing per Assumption A3)
    - Logs only { profileId, correlationId, textLength, hasImage, durationMs } — NEVER token, NEVER full body (T-WORKER-03)
    - PUT failure aborts before /posts call (T-WORKER-01)
  </behavior>
  <action>
Create `packages/worker/src/linkedin-publish.service.ts`:
```typescript
// LinkedIn publish service. Given a social_profiles row (with encrypted OAuth 2.0
// access token) plus the post text and optional image, calls the LinkedIn
// /rest/posts endpoint and returns the LinkedIn-assigned URN for persistence
// into `posts.platform_post_id`.
//
// CREDENTIAL DISCIPLINE (T-WORKER-03): plaintext token stays in function scope,
// no caching, no logging of token-shaped values. Match twitter-publish.service.ts.

import { decrypt, validateEncryptionKey } from '@sms/shared/encryption';
import { createLogger } from '@sms/shared/logger';
import type { socialProfiles } from '@sms/db';

const DEFAULT_API_VERSION = '202604';
const LINKEDIN_BASE = 'https://api.linkedin.com/rest';

function resolveApiVersion(): string {
  return process.env.LINKEDIN_API_VERSION ?? DEFAULT_API_VERSION;
}

export interface CallLinkedInArgs {
  profile: typeof socialProfiles.$inferSelect;
  postText: string;
  visibility: 'PUBLIC' | 'CONNECTIONS';
  imageBytes?: Buffer;
  correlationId: string;
}

export interface CallLinkedInResult {
  platformPostId: string;
}

export class LinkedInPublishCredentialError extends Error {
  constructor(message: string) { super(message); this.name = 'LinkedInPublishCredentialError'; }
}

export class LinkedInPublishApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'LinkedInPublishApiError';
    this.status = status;
  }
}

const logger = createLogger('linkedin-publish');

function buildAuthorUrn(profile: typeof socialProfiles.$inferSelect): string {
  // Pitfall 9: person vs organization URN.
  // Plan 02 added social_profiles.linkedinAccountType (varchar(16) NOT NULL DEFAULT 'person')
  // — typed access, no `as Record<string, unknown>` cast required.
  const accountType = profile.linkedinAccountType;
  const accountId = profile.platformAccountId;
  if (!accountId) throw new LinkedInPublishCredentialError(`Profile ${profile.id} missing platformAccountId`);
  // platformAccountId may already be a full URN; if so, use as-is.
  if (accountId.startsWith('urn:li:')) return accountId;
  return accountType === 'organization'
    ? `urn:li:organization:${accountId}`
    : `urn:li:person:${accountId}`;
}

async function initializeImageUpload(args: {
  accessToken: string;
  ownerUrn: string;
  apiVersion: string;
}): Promise<{ uploadUrl: string; imageUrn: string }> {
  const res = await fetch(`${LINKEDIN_BASE}/images?action=initializeUpload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${args.accessToken}`,
      'LinkedIn-Version': args.apiVersion,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ initializeUploadRequest: { owner: args.ownerUrn } }),
  });
  if (!res.ok) {
    throw new LinkedInPublishApiError(res.status, `initializeUpload failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { value?: { uploadUrl?: string; image?: string } };
  if (!json.value?.uploadUrl || !json.value?.image) {
    throw new LinkedInPublishApiError(500, 'initializeUpload response missing uploadUrl or image URN');
  }
  return { uploadUrl: json.value.uploadUrl, imageUrn: json.value.image };
}

async function putImageBinary(args: { uploadUrl: string; imageBytes: Buffer }): Promise<void> {
  const res = await fetch(args.uploadUrl, {
    method: 'PUT',
    body: args.imageBytes,
  });
  if (!res.ok) {
    // T-WORKER-01: throw before any /posts call so we don't leave an orphaned image URN referenced by a post that never existed.
    throw new LinkedInPublishApiError(res.status, `image PUT failed: HTTP ${res.status}`);
  }
}

export async function callLinkedIn(args: CallLinkedInArgs): Promise<CallLinkedInResult> {
  const startedAt = Date.now();
  const callLogger = logger.child({
    profileId: args.profile.id,
    correlationId: args.correlationId,
    textLength: args.postText.length,
    hasImage: !!args.imageBytes,
  });

  // Read env inside function (CLAUDE.md).
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) throw new LinkedInPublishCredentialError('ENCRYPTION_KEY env var is not set');
  const encryptionKey = validateEncryptionKey(rawKey);

  // Phase 7 added oauth2AccessToken* columns as typed bytea. Direct field access — no casts.
  const cipher = args.profile.oauth2AccessTokenCiphertext;
  const iv = args.profile.oauth2AccessTokenIv;
  const authTag = args.profile.oauth2AccessTokenAuthTag;
  if (!cipher || !iv || !authTag) {
    throw new LinkedInPublishCredentialError(
      `Profile ${args.profile.id} is missing one or more encrypted OAuth 2.0 token fields`,
    );
  }
  const accessToken = decrypt(cipher, iv, authTag, encryptionKey);

  const apiVersion = resolveApiVersion();
  const ownerUrn = buildAuthorUrn(args.profile);

  // 3-step image upload, only if image is provided.
  let imageUrn: string | undefined;
  if (args.imageBytes) {
    const init = await initializeImageUpload({ accessToken, ownerUrn, apiVersion });
    await putImageBinary({ uploadUrl: init.uploadUrl, imageBytes: args.imageBytes });
    imageUrn = init.imageUrn;
  }

  const body: Record<string, unknown> = {
    author: ownerUrn,
    commentary: args.postText,
    visibility: args.visibility,
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  if (imageUrn) {
    body.content = { media: { id: imageUrn, title: '' } };
  }

  const res = await fetch(`${LINKEDIN_BASE}/posts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'LinkedIn-Version': apiVersion,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    // sanitize: never log Authorization header or full token shapes.
    throw new LinkedInPublishApiError(res.status, `posts call failed: HTTP ${res.status} body=${errBody.slice(0, 500)}`);
  }
  const headerId = res.headers.get('x-restli-id');
  let platformPostId = headerId ?? '';
  if (!platformPostId) {
    // Fallback to body parse (Assumption A3).
    try {
      const json = (await res.json()) as { id?: string };
      platformPostId = json.id ?? '';
    } catch { /* swallow — will throw below */ }
  }
  if (!platformPostId) {
    throw new LinkedInPublishApiError(500, 'LinkedIn /posts response missing x-restli-id header and id field');
  }
  callLogger.info({ durationMs: Date.now() - startedAt }, 'LinkedIn publish succeeded');
  return { platformPostId };
}
```
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/worker build &amp;&amp; pnpm --filter @sms/worker test linkedin-publish -- --run</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/worker/src/linkedin-publish.service.ts` exists
    - `rg "export async function callLinkedIn" packages/worker/src/linkedin-publish.service.ts` returns >= 1 match
    - `rg "initializeImageUpload|putImageBinary" packages/worker/src/linkedin-publish.service.ts` returns >= 2 matches
    - `rg "x-restli-id" packages/worker/src/linkedin-publish.service.ts` returns >= 1 match
    - `rg "LinkedIn-Version" packages/worker/src/linkedin-publish.service.ts` returns >= 1 match
    - `rg "process.env.ENCRYPTION_KEY" packages/worker/src/linkedin-publish.service.ts` returns >= 1 match (env read inside function, not module scope)
    - `rg "module.exports|^const ENCRYPTION_KEY" packages/worker/src/linkedin-publish.service.ts` returns 0 matches (no module-scope env reads)
    - `rg "as Record<string, unknown>" packages/worker/src/linkedin-publish.service.ts` returns 0 matches (Plan 02 columns now typed)
    - `rg "profile.linkedinAccountType" packages/worker/src/linkedin-publish.service.ts` returns >= 1 match (typed access)
    - `pnpm --filter @sms/worker test linkedin-publish -- --run` exits 0 (Plan 01 stubs flip GREEN)
  </acceptance_criteria>
  <done>callLinkedIn function exists, handles text-only and image variants with 3-step upload, mirrors twitter-publish.service.ts shape, never logs token, fails fast on PUT error before /posts call. All field accesses are typed — no `as Record<string, unknown>` casts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create callFacebook worker service (text + multi-photo + video + linkUrl)</name>
  <files>
    packages/worker/src/facebook-publish.service.ts
  </files>
  <read_first>
    - packages/worker/src/twitter-publish.service.ts (analog factory shape)
    - **Confirm exact import paths and mirror them verbatim:** `@sms/shared/encryption`, `@sms/shared/logger`.
    - packages/api/src/services/facebook.service.ts (Phase 7 — DEFAULT_GRAPH_VERSION, FacebookApiError, sanitizeErrorBody, TOKEN_SHAPED_SEQUENCE_RE)
    - packages/worker/src/__tests__/facebook-publish.test.ts (Plan 01 stubs)
    - .planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md (Pattern 3 lines 428-484 for multi-photo, Pitfall 5 single-stage video, Pitfall 11 partial-failure cleanup)
  </read_first>
  <behavior>
    - callFacebook({ profile, postText, linkUrl?, mediaItems[]?, videoBytes?, correlationId }) → { platformPostId, observedCallCount? }
    - mediaItems: array of { bytes: Buffer, fileName: string }
    - Single video path: POST /{pageId}/videos with multipart source (POST-FB-03)
    - Text + (optional) link path: POST /{pageId}/feed with message + link (POST-FB-01, POST-FB-04)
    - Multi-photo path: for each mediaItem POST /{pageId}/photos?published=false; collect ids; POST /{pageId}/feed with attached_media[idx] (POST-FB-02)
    - On photo upload partial failure: throw FacebookPublishApiError carrying collected photoIds for caller cleanup (T-WORKER-02)
    - Reads X-Page-Usage header for observedCallCount (Pitfall 6)
    - Never logs page access token; sanitizes error bodies via TOKEN_SHAPED_SEQUENCE_RE pattern from Phase 7 (T-WORKER-03)
  </behavior>
  <action>
Create `packages/worker/src/facebook-publish.service.ts` mirroring the LinkedIn service but with Facebook deltas:

```typescript
// Facebook publish service. Mirrors callTwitter/callLinkedIn shape; uses
// node:fetch directly to graph.facebook.com (RESEARCH §Pitfall 8 — the
// business-sdk is for marketing/ads, not Page publishing).

import { decrypt, validateEncryptionKey } from '@sms/shared/encryption';
import { createLogger } from '@sms/shared/logger';
import type { socialProfiles } from '@sms/db';

const DEFAULT_GRAPH_VERSION = 'v22.0';

function resolveGraphVersion(): string {
  return process.env.FACEBOOK_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION;
}

function fbBase(): string {
  return `https://graph.facebook.com/${resolveGraphVersion()}`;
}

// Match Phase 7 facebook.service.ts sanitization helpers exactly.
const TOKEN_SHAPED_SEQUENCE_RE = /[A-Za-z0-9_-]{40,}/g;
function sanitizeErrorBody(body: string): string {
  return body.replace(TOKEN_SHAPED_SEQUENCE_RE, '[REDACTED]').slice(0, 500);
}

export interface CallFacebookArgs {
  profile: typeof socialProfiles.$inferSelect;
  postText: string;
  linkUrl?: string | null;
  mediaItems?: Array<{ bytes: Buffer; fileName: string; mimeType: string }>;
  videoBytes?: Buffer;
  videoFileName?: string;
  correlationId: string;
}

export interface CallFacebookResult {
  platformPostId: string;
  observedCallCount?: number;
  uploadedPhotoIds?: string[];  // for cleanup in case caller wants to verify
}

export class FacebookPublishCredentialError extends Error {
  constructor(message: string) { super(message); this.name = 'FacebookPublishCredentialError'; }
}

export class FacebookPublishApiError extends Error {
  readonly status: number;
  readonly uploadedPhotoIds?: string[];  // T-WORKER-02: surfaced for cleanup
  constructor(status: number, message: string, uploadedPhotoIds?: string[]) {
    super(message);
    this.name = 'FacebookPublishApiError';
    this.status = status;
    this.uploadedPhotoIds = uploadedPhotoIds;
  }
}

const logger = createLogger('facebook-publish');

function readPageUsage(res: Response): number | undefined {
  const header = res.headers.get('x-page-usage');
  if (!header) return undefined;
  try {
    const parsed = JSON.parse(header) as { call_count?: number };
    return parsed.call_count;
  } catch {
    return undefined;
  }
}

async function uploadUnpublishedPhoto(args: {
  pageId: string;
  pageAccessToken: string;
  photo: { bytes: Buffer; fileName: string; mimeType: string };
}): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([args.photo.bytes], { type: args.photo.mimeType });
  formData.append('source', blob, args.photo.fileName);
  formData.append('published', 'false');
  formData.append('access_token', args.pageAccessToken);

  const res = await fetch(`${fbBase()}/${args.pageId}/photos`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new FacebookPublishApiError(res.status, `photo upload failed: ${sanitizeErrorBody(errBody)}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new FacebookPublishApiError(500, 'photo upload response missing id');
  return json.id;
}

export async function callFacebook(args: CallFacebookArgs): Promise<CallFacebookResult> {
  const startedAt = Date.now();
  const callLogger = logger.child({
    profileId: args.profile.id,
    correlationId: args.correlationId,
    textLength: args.postText.length,
    photoCount: args.mediaItems?.length ?? 0,
    hasVideo: !!args.videoBytes,
    hasLink: !!args.linkUrl,
  });

  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) throw new FacebookPublishCredentialError('ENCRYPTION_KEY env var is not set');
  const encryptionKey = validateEncryptionKey(rawKey);

  // Phase 7 added oauth2AccessToken* columns as typed bytea. Direct field access — no casts.
  const cipher = args.profile.oauth2AccessTokenCiphertext;
  const iv = args.profile.oauth2AccessTokenIv;
  const authTag = args.profile.oauth2AccessTokenAuthTag;
  if (!cipher || !iv || !authTag) {
    throw new FacebookPublishCredentialError(`Profile ${args.profile.id} missing OAuth 2.0 token fields`);
  }
  const pageAccessToken = decrypt(cipher, iv, authTag, encryptionKey);
  const pageId = args.profile.platformAccountId;
  if (!pageId) throw new FacebookPublishCredentialError(`Profile ${args.profile.id} missing platformAccountId`);

  // Path A: video post (POST-FB-03). Single-stage upload (Pitfall 5 — 100 MB cap).
  if (args.videoBytes) {
    const formData = new FormData();
    formData.append('source', new Blob([args.videoBytes]), args.videoFileName ?? 'video.mp4');
    formData.append('description', args.postText);
    formData.append('access_token', pageAccessToken);
    const res = await fetch(`${fbBase()}/${pageId}/videos`, { method: 'POST', body: formData });
    if (!res.ok) {
      const errBody = await res.text();
      throw new FacebookPublishApiError(res.status, `video upload failed: ${sanitizeErrorBody(errBody)}`);
    }
    const json = (await res.json()) as { id?: string };
    if (!json.id) throw new FacebookPublishApiError(500, 'video response missing id');
    callLogger.info({ durationMs: Date.now() - startedAt }, 'Facebook video publish succeeded');
    return { platformPostId: json.id, observedCallCount: readPageUsage(res) };
  }

  // Path B: multi-photo post (POST-FB-02).
  const uploadedPhotoIds: string[] = [];
  if (args.mediaItems && args.mediaItems.length > 0) {
    for (const photo of args.mediaItems) {
      try {
        const photoId = await uploadUnpublishedPhoto({ pageId, pageAccessToken, photo });
        uploadedPhotoIds.push(photoId);
      } catch (err) {
        // T-WORKER-02: surface partial state so the lifecycle service can record it.
        const status = err instanceof FacebookPublishApiError ? err.status : 500;
        const message = err instanceof Error ? err.message : 'unknown';
        throw new FacebookPublishApiError(
          status,
          `multi-photo upload aborted at index ${uploadedPhotoIds.length}: ${message}`,
          uploadedPhotoIds,
        );
      }
    }
  }

  // Path C / final step: feed POST (POST-FB-01 + POST-FB-04). Always issued unless we already returned for video.
  const formBody = new URLSearchParams();
  formBody.set('message', args.postText);
  formBody.set('access_token', pageAccessToken);
  if (args.linkUrl) formBody.set('link', args.linkUrl);
  uploadedPhotoIds.forEach((photoId, idx) => {
    formBody.set(`attached_media[${idx}]`, JSON.stringify({ media_fbid: photoId }));
  });
  const res = await fetch(`${fbBase()}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new FacebookPublishApiError(res.status, `feed POST failed: ${sanitizeErrorBody(errBody)}`, uploadedPhotoIds);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new FacebookPublishApiError(500, 'feed response missing id');
  callLogger.info({ durationMs: Date.now() - startedAt, uploadedPhotoCount: uploadedPhotoIds.length }, 'Facebook publish succeeded');
  return {
    platformPostId: json.id,
    observedCallCount: readPageUsage(res),
    uploadedPhotoIds: uploadedPhotoIds.length > 0 ? uploadedPhotoIds : undefined,
  };
}
```
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/worker build &amp;&amp; pnpm --filter @sms/worker test facebook-publish -- --run</automated>
  </verify>
  <acceptance_criteria>
    - File `packages/worker/src/facebook-publish.service.ts` exists
    - `rg "export async function callFacebook" packages/worker/src/facebook-publish.service.ts` returns >= 1 match
    - `rg "uploadUnpublishedPhoto" packages/worker/src/facebook-publish.service.ts` returns >= 2 matches
    - `rg "attached_media" packages/worker/src/facebook-publish.service.ts` returns >= 1 match
    - `rg "uploadedPhotoIds" packages/worker/src/facebook-publish.service.ts` returns >= 4 matches (T-WORKER-02 surfaces collected ids in error)
    - `rg "process.env.ENCRYPTION_KEY" packages/worker/src/facebook-publish.service.ts` returns >= 1 match
    - `rg "TOKEN_SHAPED_SEQUENCE_RE|sanitizeErrorBody" packages/worker/src/facebook-publish.service.ts` returns >= 2 matches (T-WORKER-03)
    - `rg "as Record<string, unknown>" packages/worker/src/facebook-publish.service.ts` returns 0 matches
    - `pnpm --filter @sms/worker test facebook-publish -- --run` exits 0 (Plan 01 stubs flip GREEN)
  </acceptance_criteria>
  <done>callFacebook handles text-only, link, multi-photo, and single-video paths; partial multi-photo failure surfaces collected ids in error; sanitize-error pattern adopted; never logs token; all profile field accesses are typed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extend post-lifecycle.service.ts with rate_limit_exhausted abort + atomic counter increment</name>
  <files>
    packages/worker/src/post-lifecycle.service.ts,
    packages/worker/src/rate-limit.ts
  </files>
  <read_first>
    - packages/worker/src/post-lifecycle.service.ts (full file — refactor target)
    - packages/worker/src/rate-limit.ts (extend with LI/FB checkers)
    - packages/api/src/services/rate-limit.service.ts (Plan 03 sibling — keep duplicated read logic per the no-cross-package-import rule)
    - packages/worker/src/__tests__/post-lifecycle-rate-limit.test.ts (Plan 01 stubs)
    - .planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md (lines 132-204 for the EXACT extension template)
    - .planning/phases/08-linkedin-facebook-post-creation/08-RESEARCH.md (Pitfall 12 — increment ONLY on transition to published, idempotency guard via platform_post_id)
  </read_first>
  <behavior>
    LifecycleAbortReason gains 'rate_limit_exhausted'.
    publishPost gains a per-platform rate-limit pre-flight (mirroring lines 221-236's token-health pattern):
      - For non-twitter posts: load platform usage; if blockThresholdHit, log post_attempts row with errorCode='rate_limit_exhausted' AND throw PostLifecycleAbort('rate_limit_exhausted')
    Phase 3 success path (lines 297-318) gains a per-platform window counter atomic increment:
      - For linkedin: single UPDATE with CASE-WHEN window-expiry reset
      - For facebook: same with rolling-hour threshold; increment by mediaIds.length + 1
      - Twitter unchanged
    rate-limit.ts (worker) gains loadLinkedInWindowUsage, loadFacebookWindowUsage, checkLinkedInBudgetForWorker, checkFacebookBudgetForWorker — mirrors API service shape.
  </behavior>
  <action>
1. In `packages/worker/src/post-lifecycle.service.ts`, extend `LifecycleAbortReason`:
```typescript
export type LifecycleAbortReason =
  | 'version_mismatch'
  | 'already_published'
  | 'not_scheduled'
  | 'budget_exhausted'
  | 'thread_unsupported'
  | 'media_pending'
  | 'token_unhealthy'
  | 'rate_limit_exhausted';  // NEW Phase 8 — graceful abort, no retry consumed
```

2. Add per-platform pre-flight inside `publishPost`, immediately AFTER the existing token-health check (lines 221-236 in the analog). Use the EXACT shape established by token-health:
```typescript
// Phase 8: per-platform rate-limit pre-flight (D-05, D-07).
// Twitter is handled by the existing budget_exhausted check above; this branch handles LI/FB.
if (profile.platform === 'linkedin' || profile.platform === 'facebook') {
  const additionalCount = profile.platform === 'facebook'
    ? (mediaCount + 1)  // Pitfall 2: FB multi-photo = N + 1 calls
    : 1;
  const checker = profile.platform === 'linkedin'
    ? checkLinkedInBudgetForWorker
    : checkFacebookBudgetForWorker;
  const result = await checker(tx, { profileId: profile.id, additionalCount });
  if (result.blockThresholdHit) {
    await tx.insert(postAttempts).values({
      postId: ctx.postId,
      attemptNum: ctx.currentAttemptNum,
      startedAt: attemptStart,
      finishedAt: new Date(),
      outcome: 'cancelled',
      errorCode: 'rate_limit_exhausted',
      errorMessage: `${profile.platform} rate limit reached: ${result.snapshot.currentCount}/${result.snapshot.limit}`,
    });
    throw new PostLifecycleAbort('rate_limit_exhausted');
  }
}
```

3. In the Phase 3 success path (after the API call returns success and we transition to `published`), add the atomic counter increment within the same transaction:
```typescript
// Phase 8: atomic per-platform window counter increment (T-API-02, T-LIMITS-01).
// Single SQL statement with CASE-WHEN ensures concurrent callers cannot both pass.
// Idempotency: this runs ONLY in Phase 3, after platform_post_id is set, so a
// BullMQ stalled-job retry that finds platform_post_id non-null short-circuits
// in `already_published` BEFORE reaching here (Pitfall 12).
if (lockedProfile.platform === 'linkedin') {
  const dayStart = utcDayStart();
  await tx.execute(sql`
    UPDATE social_profiles SET
      linkedin_daily_count = CASE
        WHEN linkedin_window_start_utc IS NULL OR linkedin_window_start_utc < ${dayStart}
          THEN 1
        ELSE linkedin_daily_count + 1
      END,
      linkedin_window_start_utc = CASE
        WHEN linkedin_window_start_utc IS NULL OR linkedin_window_start_utc < ${dayStart}
          THEN ${dayStart}
        ELSE linkedin_window_start_utc
      END,
      updated_at = NOW()
    WHERE id = ${lockedProfile.id}
  `);
} else if (lockedProfile.platform === 'facebook') {
  const hourThreshold = new Date(Date.now() - 60 * 60 * 1000);
  const now = new Date();
  const callCount = mediaCount + 1;  // Pitfall 2
  await tx.execute(sql`
    UPDATE social_profiles SET
      facebook_hourly_count = CASE
        WHEN facebook_window_start_utc IS NULL OR facebook_window_start_utc < ${hourThreshold}
          THEN ${callCount}
        ELSE facebook_hourly_count + ${callCount}
      END,
      facebook_window_start_utc = CASE
        WHEN facebook_window_start_utc IS NULL OR facebook_window_start_utc < ${hourThreshold}
          THEN ${now}
        ELSE facebook_window_start_utc
      END,
      updated_at = NOW()
    WHERE id = ${lockedProfile.id}
  `);
}
// Twitter monthly counter increment continues in its existing location, unchanged.
```

4. Extend `packages/worker/src/rate-limit.ts` with the worker-side loaders + checkers. Mirror `packages/api/src/services/rate-limit.service.ts` Task 1 output exactly — same column reads, same expiry logic. Per the comment in rate-limit.service.ts lines 11-20, do NOT cross-import; duplicate the read logic.

```typescript
import { sql, eq } from 'drizzle-orm';
import { socialProfiles } from '@sms/db';
import { checkLinkedInBudget, checkFacebookBudget, type PlatformBudgetSnapshot, type BudgetCheckResult } from '@sms/shared';
import { DateTime } from 'luxon';

export async function loadLinkedInWindowUsage(db: WorkerDb, profileId: string): Promise<PlatformBudgetSnapshot> {
  const [row] = await db
    .select({
      limit: socialProfiles.linkedinDailyLimit,
      count: socialProfiles.linkedinDailyCount,
      windowStart: socialProfiles.linkedinWindowStartUtc,
      warnThresholdPercent: socialProfiles.warnThresholdPercent,
    })
    .from(socialProfiles)
    .where(eq(socialProfiles.id, profileId));
  if (!row) throw new Error(`Profile ${profileId} not found`);
  const dayStart = DateTime.utc().startOf('day').toJSDate();
  const isExpired = !row.windowStart || row.windowStart < dayStart;
  const nextDay = DateTime.utc().startOf('day').plus({ days: 1 }).toJSDate();
  return {
    currentCount: isExpired ? 0 : row.count,
    limit: row.limit,
    warnThresholdPercent: row.warnThresholdPercent ?? 90,
    windowStartUtc: isExpired ? dayStart : row.windowStart,
    windowResetAt: nextDay,
  };
}

export async function loadFacebookWindowUsage(db: WorkerDb, profileId: string): Promise<PlatformBudgetSnapshot> {
  const [row] = await db
    .select({
      limit: socialProfiles.facebookHourlyLimit,
      count: socialProfiles.facebookHourlyCount,
      windowStart: socialProfiles.facebookWindowStartUtc,
      warnThresholdPercent: socialProfiles.warnThresholdPercent,
    })
    .from(socialProfiles)
    .where(eq(socialProfiles.id, profileId));
  if (!row) throw new Error(`Profile ${profileId} not found`);
  const hourThreshold = new Date(Date.now() - 60 * 60 * 1000);
  const isExpired = !row.windowStart || row.windowStart < hourThreshold;
  const nextHour = DateTime.utc().startOf('hour').plus({ hours: 1 }).toJSDate();
  return {
    currentCount: isExpired ? 0 : row.count,
    limit: row.limit,
    warnThresholdPercent: row.warnThresholdPercent ?? 90,
    windowStartUtc: isExpired ? new Date() : row.windowStart,
    windowResetAt: nextHour,
  };
}

export async function checkLinkedInBudgetForWorker(
  db: WorkerDb,
  args: { profileId: string; additionalCount: number },
): Promise<BudgetCheckResult & { snapshot: PlatformBudgetSnapshot }> {
  const snapshot = await loadLinkedInWindowUsage(db, args.profileId);
  return { ...checkLinkedInBudget(snapshot, args.additionalCount), snapshot };
}

export async function checkFacebookBudgetForWorker(
  db: WorkerDb,
  args: { profileId: string; additionalCount: number },
): Promise<BudgetCheckResult & { snapshot: PlatformBudgetSnapshot }> {
  const snapshot = await loadFacebookWindowUsage(db, args.profileId);
  return { ...checkFacebookBudget(snapshot, args.additionalCount), snapshot };
}
```
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/worker build &amp;&amp; pnpm --filter @sms/worker test post-lifecycle-rate-limit -- --run</automated>
  </verify>
  <acceptance_criteria>
    - `rg "rate_limit_exhausted" packages/worker/src/post-lifecycle.service.ts` returns >= 2 matches (union member + thrown reason)
    - `rg "checkLinkedInBudgetForWorker|checkFacebookBudgetForWorker" packages/worker/src/post-lifecycle.service.ts` returns >= 2 matches
    - `rg "linkedin_window_start_utc.*CASE WHEN|CASE.*WHEN.*linkedin_window_start_utc" packages/worker/src/post-lifecycle.service.ts` returns >= 1 match
    - `rg "facebook_hourly_count.*CASE|CASE.*WHEN.*facebook_window" packages/worker/src/post-lifecycle.service.ts` returns >= 1 match
    - `rg "loadLinkedInWindowUsage|loadFacebookWindowUsage" packages/worker/src/rate-limit.ts` returns >= 2 matches
    - `pnpm --filter @sms/worker test post-lifecycle-rate-limit -- --run` exits 0 (Plan 01 lifecycle test flips GREEN)
  </acceptance_criteria>
  <done>publishPost issues a graceful rate_limit_exhausted abort when at the platform limit; Phase 3 success path increments the per-platform counter via single-statement CAS UPDATE; worker-side rate-limit module mirrors API-side shape.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Wire publish-worker dispatcher + extend error classifier</name>
  <files>
    packages/worker/src/publish-worker.ts,
    packages/shared/src/lib/error-classifier.ts
  </files>
  <read_first>
    - packages/worker/src/publish-worker.ts (full file — refactor target)
    - packages/shared/src/lib/error-classifier.ts (extend with classifyLinkedInError, classifyFacebookError)
    - packages/worker/src/__tests__/twitter-401-detection.test.ts (worker test pattern reference)
    - .planning/phases/08-linkedin-facebook-post-creation/08-PATTERNS.md (lines 209-244 for dispatch + graceful list extension)
  </read_first>
  <behavior>
    publish-worker.ts:
      - Factory accepts callLinkedInImpl, callFacebookImpl in addition to callTwitterImpl
      - Inside handler: dispatch on post.platform → callTwitter / callLinkedIn / callFacebook
      - Translate post fields into platform-specific args using TYPED post.visibility / post.linkUrl (Plan 02 columns) — NO `as Record<string, unknown>` casts
      - 'rate_limit_exhausted' added to graceful-abort list (no retry consumed, post stays scheduled)
      - Error classifier dispatch: classifyTwitterError | classifyLinkedInError | classifyFacebookError based on post.platform

    error-classifier.ts:
      - Add classifyLinkedInError(err): { type: 'transient' | 'permanent' | 'auth_revoked' }
      - Add classifyFacebookError(err): same shape
      - Pattern matches LinkedInPublishApiError.status (429 transient, 401 auth_revoked, 4xx permanent, 5xx transient)
      - Same for FacebookPublishApiError; FB Graph API codes 4 (app rate-limit), 17 (user rate-limit), 32 (page rate-limit) → transient
  </behavior>
  <action>
1. Update `packages/worker/src/publish-worker.ts`. Plan 02 added typed `post.visibility` (varchar(16) nullable) and `post.linkUrl` (text nullable) columns — read them directly via the Drizzle-inferred type, NO casts:
```typescript
import { callLinkedIn } from './linkedin-publish.service.js';
import { callFacebook } from './facebook-publish.service.js';
import { classifyLinkedInError, classifyFacebookError, classifyTwitterError } from '@sms/shared';

export interface CreatePublishHandlerOpts {
  db: WorkerDb;
  callTwitterImpl: typeof callTwitter;
  callLinkedInImpl: typeof callLinkedIn;       // NEW
  callFacebookImpl: typeof callFacebook;       // NEW
  // ... existing opts
}

export function createPublishHandler(opts: CreatePublishHandlerOpts) {
  return async (job: Job<PublishJobData>): Promise<PublishHandlerResult> => {
    // ... existing job lookup + media gather

    const callPlatform = async (
      profile: typeof socialProfiles.$inferSelect,
      post: typeof posts.$inferSelect,
      mediaItems: Array<{ bytes: Buffer; fileName: string; mimeType: string }>,
    ) => {
      if (profile.platform === 'linkedin') {
        // Typed access — Plan 02 added posts.visibility (varchar(16) nullable).
        const visibility = (post.visibility as 'PUBLIC' | 'CONNECTIONS' | null) ?? 'PUBLIC';
        const imageBytes = mediaItems[0]?.bytes;
        return opts.callLinkedInImpl({
          profile,
          postText: post.text,
          visibility,
          imageBytes,
          correlationId: job.data.correlationId,
        });
      }
      if (profile.platform === 'facebook') {
        // Typed access — Plan 02 added posts.linkUrl (text nullable).
        const linkUrl = post.linkUrl;
        const videoItem = mediaItems.find((m) => m.mimeType.startsWith('video/'));
        const photoItems = mediaItems.filter((m) => !m.mimeType.startsWith('video/'));
        if (videoItem) {
          return opts.callFacebookImpl({
            profile, postText: post.text, linkUrl,
            videoBytes: videoItem.bytes, videoFileName: videoItem.fileName,
            correlationId: job.data.correlationId,
          });
        }
        return opts.callFacebookImpl({
          profile, postText: post.text, linkUrl,
          mediaItems: photoItems,
          correlationId: job.data.correlationId,
        });
      }
      return opts.callTwitterImpl({
        profile, postText: post.text, isThread: post.isThread,
        correlationId: job.data.correlationId,
      });
    };

    try {
      const result = await runPublish(opts.db, {
        // ... existing ctx
        callTwitter: (profile, postText, isThread) => callPlatform(profile, post, mediaItems),
        // ... rest of ctx
      });
      return { skipped: false, result };
    } catch (err) {
      if (err instanceof PostLifecycleAbort) {
        if (
          err.reason === 'version_mismatch' ||
          err.reason === 'budget_exhausted' ||
          err.reason === 'not_scheduled' ||
          err.reason === 'thread_unsupported' ||
          err.reason === 'media_pending' ||
          err.reason === 'token_unhealthy' ||
          err.reason === 'rate_limit_exhausted'  // NEW Phase 8
        ) {
          return { skipped: true, skipReason: err.reason };
        }
      }
      // Error classifier dispatch by platform.
      const classifier = post.platform === 'linkedin'
        ? classifyLinkedInError
        : post.platform === 'facebook'
          ? classifyFacebookError
          : classifyTwitterError;
      const classification = classifier(err);
      // existing retry / dead-letter handling continues
      throw err;
    }
  };
}
```

The narrow `as 'PUBLIC' | 'CONNECTIONS' | null` cast on `post.visibility` is purely a string-literal narrowing of a `string | null` column and is allowed (the schema permits any varchar(16) and we constrain to two values at the boundary). It is NOT a `Record<string, unknown>` shape cast — those are forbidden.

2. Extend `packages/shared/src/lib/error-classifier.ts`:
```typescript
export interface ErrorClassification {
  type: 'transient' | 'permanent' | 'auth_revoked';
}

// Existing classifyTwitterError (untouched).

export function classifyLinkedInError(err: unknown): ErrorClassification {
  // LinkedIn HTTP semantics:
  //   401 → auth_revoked (token invalid; needs re-auth)
  //   403 → permanent (insufficient scope)
  //   429 → transient (rate limited)
  //   5xx → transient
  //   other 4xx → permanent
  const status = (err as { status?: number }).status;
  if (status === 401) return { type: 'auth_revoked' };
  if (status === 429) return { type: 'transient' };
  if (status && status >= 500) return { type: 'transient' };
  if (status && status >= 400) return { type: 'permanent' };
  return { type: 'transient' };
}

export function classifyFacebookError(err: unknown): ErrorClassification {
  // Facebook Graph error envelope: { error: { code, type, message } }
  // Codes: 4 (app rate-limit), 17 (user rate-limit), 32 (page rate-limit), 613 (permission rate-limit) → transient
  // Code 190 → auth_revoked (access token invalid)
  // Code 200, 230 → permanent (permission missing)
  const status = (err as { status?: number }).status;
  // FacebookPublishApiError carries fbCode in the message for now; downstream may add a dedicated field.
  if (status === 401) return { type: 'auth_revoked' };
  const message = err instanceof Error ? err.message : '';
  if (/code["\s:]+190/.test(message)) return { type: 'auth_revoked' };
  if (/code["\s:]+(4|17|32|613)\b/.test(message)) return { type: 'transient' };
  if (status === 429) return { type: 'transient' };
  if (status && status >= 500) return { type: 'transient' };
  if (status && status >= 400) return { type: 'permanent' };
  return { type: 'transient' };
}
```

Run `pnpm --filter @sms/shared build` after editing so the worker's import resolves to fresh dist.
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm --filter @sms/shared build &amp;&amp; pnpm --filter @sms/worker build &amp;&amp; pnpm --filter @sms/worker test -- --run</automated>
  </verify>
  <acceptance_criteria>
    - `rg "callLinkedInImpl|callFacebookImpl" packages/worker/src/publish-worker.ts` returns >= 4 matches (factory params + dispatch usage)
    - `rg "rate_limit_exhausted" packages/worker/src/publish-worker.ts` returns >= 1 match (graceful list)
    - `rg "post.platform === 'linkedin'|profile.platform === 'linkedin'" packages/worker/src/publish-worker.ts` returns >= 1 match
    - `rg "classifyLinkedInError|classifyFacebookError" packages/shared/src/lib/error-classifier.ts` returns >= 2 matches
    - `rg "as Record<string, unknown>" packages/worker/src/publish-worker.ts` returns 0 matches (B-01 cascade complete)
    - `rg "post.visibility|post.linkUrl" packages/worker/src/publish-worker.ts` returns >= 2 matches (typed access)
    - `pnpm --filter @sms/worker test -- --run` exits 0 (full worker suite GREEN — Plan 01 worker tests pass)
  </acceptance_criteria>
  <done>publish-worker dispatches on post.platform; rate_limit_exhausted joins the graceful list; error classifier dispatches by platform; worker test suite is GREEN; ALL `as Record<string, unknown>` casts removed from publish-worker.ts (typed access via Plan-02 columns).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| BullMQ job payload → worker handler | Job carries postId + correlationId; never carries token (T-WORKER-03) |
| Worker → external platform HTTP | New code paths for LinkedIn /rest/posts and Facebook Graph; both sanitize error bodies before logging |
| Worker → social_profiles row UPDATE | Phase 3 success path uses single-statement CAS to increment counters atomically (T-API-02 / T-LIMITS-01) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-WORKER-01 | Tampering / Information Disclosure | LinkedIn 3-step image upload chain | mitigate | callLinkedIn throws BEFORE the /posts call when initializeUpload or PUT fails; Plan 01 Test 3 enforces this with fetch-call-count assertions |
| T-WORKER-02 | Tampering | Facebook multi-photo orphans | mitigate | callFacebook throws FacebookPublishApiError with collected uploadedPhotoIds when a photo upload fails mid-sequence; lifecycle service can record the orphans for Phase 11 cleanup |
| T-WORKER-03 | Information Disclosure | token leakage in logs / job payload | mitigate | Both services use logger.child with whitelisted fields only; sanitizeErrorBody strips token-shaped sequences from error bodies; BullMQ payload contains only postId + correlationId |
| T-API-02 | Tampering | Worker counter increment race | mitigate | Phase 3 success path uses single-statement UPDATE with CASE-WHEN; concurrent updates serialize on row lock; no read-then-write loop |
| T-LIMITS-01 | Tampering | Window reset atomicity in worker | mitigate | Same single-statement CASE-WHEN as Plan 03 — runs inside the existing Phase 3 transaction, so the window reset is committed atomically with the post status transition |
</threat_model>

<verification>
This plan is complete when:
1. `pnpm --filter @sms/worker test -- --run` is GREEN (linkedin-publish, facebook-publish, post-lifecycle-rate-limit tests all pass)
2. `pnpm --filter @sms/shared build` and `pnpm --filter @sms/worker build` exit 0
3. callLinkedIn never issues /rest/posts after a PUT failure (verified by Plan 01 fetch-call-count assertion)
4. callFacebook returns FacebookPublishApiError.uploadedPhotoIds on partial failure (verified by Plan 01 Test 5)
5. publishPost throws PostLifecycleAbort('rate_limit_exhausted') for at-limit profiles and inserts a post_attempts row with errorCode='rate_limit_exhausted'
6. rate_limit_exhausted is in the graceful-abort list of publish-worker.ts (no retry consumed)
7. `rg "as Record<string, unknown>" packages/worker/src/` returns 0 matches across all worker package source files
</verification>

<success_criteria>
- All Plan 01 worker tests flip RED→GREEN
- callLinkedIn and callFacebook follow the same factory shape as callTwitter (drop-in replacements selected by post.platform)
- post-lifecycle.service.ts adds 'rate_limit_exhausted' to LifecycleAbortReason and increments per-platform counters via single-statement CAS UPDATE
- publish-worker dispatches by post.platform; graceful-abort list extended; uses TYPED post.visibility / post.linkUrl access
- @sms/shared error-classifier exports classifyLinkedInError + classifyFacebookError with conservative transient/permanent/auth_revoked partitions
- ZERO `as Record<string, unknown>` casts in any worker source file (Plan-02 columns made these unnecessary)
</success_criteria>

<output>
After completion, create `.planning/phases/08-linkedin-facebook-post-creation/08-04-SUMMARY.md`
</output>
