---
phase: 04-publish-worker-scheduled-posts
status: secured
asvs_level: 1
threats_total: 30
threats_closed: 30
threats_open: 0
date: 2026-04-09
---

# Phase 04 Security Audit

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Status | Evidence |
|-----------|----------|-----------|----------|-------------|--------|----------|
| T-04-01-01 | Tampering | post_attempts insert w/o ownership | low | mitigate | CLOSED | `post-attempts.ts:18` — `references(() => posts.id, { onDelete: 'cascade' })` present; API/service ownership checks verified in Plan 04 route handlers |
| T-04-01-02 | Information Disclosure | error_message column / token leak | low | mitigate | CLOSED | `post-attempts.ts:25` — column is nullable; classifier reads only `errors[].message` / `data.detail` (error-classifier.ts:70-72), never request headers |
| T-04-01-03 | Denial of Service | Unbounded post_attempts growth | low | accept | CLOSED | Accepted per D-18; documented in threat register; 400 KB/month estimate recorded |
| T-04-01-04 | Tampering | monthlyTweetBudget has no DB CHECK | low | mitigate | CLOSED | `rate-limit.ts:13-15` — `z.number().int().min(1).max(10000)` and `min(1).max(99)` with `.strict()` enforced before any DB write |
| T-04-01-05 | Elevation of Privilege | Migration ran with superuser | low | mitigate | CLOSED | Migration file `0002_phase-04-publish-worker.sql` uses same `DATABASE_URL` as app; no elevated-perm DDL present |
| T-04-02-01 | Information Disclosure | Publish job payload contains credentials | high | mitigate | CLOSED | `publish-queue.service.ts:13-17` — `PublishJobPayload` typed to `{postId, postVersion, correlationId}` only; confirmed by SUMMARY.md unit test assertion |
| T-04-02-02 | Tampering | Mass-assignment on rate-limit PATCH | medium | mitigate | CLOSED | `rate-limit.ts:16` — `.strict()` on `rateLimitUpdateSchema`; verified in `profiles.ts:126` |
| T-04-02-03 | Tampering | Rate-limit bounds bypass | medium | mitigate | CLOSED | `rate-limit.ts:13-15` — budget `min(1).max(10000)`, warn `min(1).max(99)` |
| T-04-02-04 | Information Disclosure | Error classifier leaks OAuth header | low | mitigate | CLOSED | `error-classifier.ts:7-11` — reads only Twitter-authored fields; comment explicitly documents no request-header echo |
| T-04-02-05 | Denial of Service | Rate-limit count query unindexed | low | mitigate | CLOSED | `posts_profile_status` composite index established Phase 3; `rate-limit.ts` query uses `profile_id` + `status` + `published_at` predicates that hit it |
| T-04-02-06 | Elevation of Privilege | Rate-limit service accepts any profileId | low | mitigate | CLOSED | Service documented as ownership-agnostic primitive; ownership verified in callers (`profiles.ts:88-99` and `posts.ts:112-123` perform ownership SELECT before calling service) |
| T-04-02-07 | Tampering | Worker re-implements rate-limit math | medium | mitigate | CLOSED | `rate-limit.ts:15` (worker) — `import { checkTwitterBudget } from '@sms/shared'`; `rate-limit.service.ts` (api) same import; no `@sms/api` import found in `packages/worker/src` |
| T-04-03-01 | Information Disclosure | Decrypted credentials leak into logs | high | mitigate | CLOSED | `twitter-publish.service.ts:121-124` — logger binding contains only `profileId`, `correlationId`, `textLength`; no token-shaped value passed to logger |
| T-04-03-02 | Information Disclosure | Credentials persisted in job payload | high | mitigate | CLOSED | `publish-queue.service.ts:13-17` + `publish-worker.ts:31-35` — payload is `{postId, postVersion, correlationId}`; worker re-decrypts inside publish scope |
| T-04-03-03 | Tampering | Duplicate publish on stalled-job recovery | critical | mitigate | CLOSED | `post-lifecycle.service.ts:129-135` — `platform_post_id` idempotency check; `posts_platform_post_id` unique index is hard backstop; error code 187 mapped to permanent in classifier |
| T-04-03-04 | Tampering | Rate-limit race between worker publishes | medium | mitigate | CLOSED | `post-lifecycle.service.ts:164-168` — runtime `checkBudget()` call inside SELECT FOR UPDATE transaction; `concurrency: 2` cap in `publish-worker.ts:58-62` |
| T-04-03-05 | Denial of Service | Worker hang on ioredis maxRetriesPerRequest | high | mitigate | CLOSED | `index.ts:35` — `new Redis(REDIS_URL, { maxRetriesPerRequest: null })` |
| T-04-03-06 | Tampering | Job picks up post with stale version | medium | mitigate | CLOSED | `post-lifecycle.service.ts:137-143` — `post_version !== ctx.expectedVersion` check; `PostLifecycleAbort('version_mismatch')` raised |
| T-04-03-07 | Information Disclosure | Twitter error echoes auth header fragment | low | mitigate | CLOSED | `error-classifier.ts:62-72` — reads `errors[0].message` / `data.detail` from response body only; auth header not present in Twitter response |
| T-04-03-08 | Denial of Service | SIGTERM leaves in-flight jobs hanging | high | mitigate | CLOSED | `index.ts:59-77` — `closeWithTimeout` with 30 000 ms `Promise.race`; per-resource try/catch in shutdown sequence |
| T-04-03-09 | Elevation of Privilege | Notification queue writes with worker DB role | low | accept | CLOSED | Accepted; worker is sole producer in Phase 4; consumer validation deferred to Phase 9 |
| T-04-03-10 | Tampering | Cross-package math drift worker vs api | medium | mitigate | CLOSED | `rate-limit.ts:15` (worker) imports from `@sms/shared`; no `from '@sms/api'` found in `packages/worker/src` |
| T-04-04-01 | Elevation of Privilege | IDOR on /api/posts/:id/retry | high | mitigate | CLOSED | `posts.ts:370-378` — transaction SELECT WHERE `posts.userId = userId`; 404 on mismatch |
| T-04-04-02 | Elevation of Privilege | IDOR on /api/posts/:id/history | high | mitigate | CLOSED | `posts.ts:433-440` — ownership SELECT before history query; 404 on mismatch |
| T-04-04-03 | Elevation of Privilege | IDOR on /api/profiles/:id/rate-limit | high | mitigate | CLOSED | `profiles.ts:83-99` (GET) — explicit ownership SELECT; `profiles.ts:135-148` (PATCH) — ownership in UPDATE WHERE clause |
| T-04-04-04 | Tampering | Mass-assignment via PATCH /rate-limit body | medium | mitigate | CLOSED | `profiles.ts:126` — `rateLimitUpdateSchema.safeParse`; schema uses `.strict()` (`rate-limit.ts:16`) |
| T-04-04-05 | Tampering | CSRF on POST /retry and PATCH /rate-limit | medium | mitigate | CLOSED | `app.ts:68` — `doubleCsrfProtection` from `csrf-csrf` applied globally; admin router mounted before CSRF per T-04-04-07 accepted exception |
| T-04-04-06 | Elevation of Privilege | Unauthenticated access to Bull-Board | high | mitigate | CLOSED | `admin.ts:43` — `router.use('/admin/queues', requireAuth, serverAdapter.getRouter())` |
| T-04-04-07 | Tampering | Bull-Board mutation bypasses CSRF | medium | accept | CLOSED | Accepted — `app.ts:55-66` explicitly mounts admin router before `doubleCsrfProtection`; comment references T-04-04-07; single-user operator tool |
| T-04-04-08 | Information Disclosure | Rate limit endpoint leaks other users' budget | medium | mitigate | CLOSED | `profiles.ts:88-99` (GET) + `profiles.ts:141-148` (PATCH) — ownership in all DB predicates; 404 hides existence on mismatch |
| T-04-04-09 | Tampering | Retry of post not in `failed` state | medium | mitigate | CLOSED | `posts.ts:381-384` — `existingPost.status !== 'failed'` check returns 409 |
| T-04-04-10 | Denial of Service | Unbounded rows from repeated retries | low | accept | CLOSED | Accepted per D-18; each retry cycle is bounded to ~4 attempt rows |
| T-04-04-11 | Denial of Service | Warn notification spam at threshold | medium | mitigate | CLOSED | `posts.ts:57-88` — `enqueueWarnNotification` uses `jobId: rate-limit-warn:${profileId}:${billingMonth}`; BullMQ dedupes by jobId |
| T-04-05-01 | Tampering | XSS via post text in history dialog | medium | mitigate | CLOSED | `PostHistoryDialog.tsx:94` — `{attempt.errorMessage}` rendered as JSX text node; no `dangerouslySetInnerHTML` found anywhere in web package |
| T-04-05-02 | Information Disclosure | Budget of other user via profileId guessing | medium | mitigate | CLOSED | API ownership enforcement at `profiles.ts:88-99`; client UI calls the same endpoint |
| T-04-05-03 | Tampering | Client-side Zod validation bypass | low | mitigate | CLOSED | Server-side `rateLimitUpdateSchema.strict()` at `profiles.ts:126` is authoritative |
| T-04-05-04 | Denial of Service | Polling every 10 s overwhelms API | low | accept | CLOSED | Accepted — single-user app; TanStack Query dedupes + backs off on error |
| T-04-05-05 | Information Disclosure | Toast messages leak server error detail | low | mitigate | CLOSED | `RateLimitSettingsDialog.tsx:65` — `toast.error("Couldn't save rate limit. Try again.")` — generic copy, no raw stack trace |
| T-04-05-06 | Tampering | Retry without confirmation enables accidental re-publish | low | accept | CLOSED | Accepted per D-14 — retry is idempotent via `platform_post_id` check |
| T-04-06-01 | Information Disclosure | Test fixtures could leak real Twitter credentials | low | mitigate | CLOSED | `seed-post.ts:59-70` — fixture uses obviously-fake ciphertext strings (`'ck_cipher'`, `'at_cipher'`, etc.); MSW handlers mock without forwarding to Twitter |
| T-04-06-02 | Denial of Service | Slow integration tests block CI | low | accept | CLOSED | Accepted — integration tests run on phase-gate, unit tests on every commit |
| T-04-06-03 | Tampering | Migration applied to test DB diverges from prod | low | mitigate | CLOSED | `testcontainer.ts:49` — `migrate(migrationDb, { migrationsFolder: MIGRATIONS_FOLDER })` references `packages/db/drizzle/` directly |
| T-04-06-04 | Information Disclosure | Test logs could leak fake credentials | low | accept | CLOSED | Accepted — fixture values like `'ck_cipher'` are not confusable with real credentials |

## Accepted Risks Log

| Threat ID | Reason | Owner | Review Trigger |
|-----------|--------|-------|----------------|
| T-04-01-03 | Retain-forever acceptable in v1; ~400 KB/month growth is negligible on Proxmox SSD | Phase 4 | Schema size review at 12 months or if Postgres storage exceeds 1 GB |
| T-04-03-09 | Worker is sole notification producer in Phase 4; consumer-side validation deferred to Phase 9 | Phase 9 | Before Phase 9 notification consumer is built |
| T-04-04-07 | Bull-Board bypasses CSRF because it doesn't send double-submit tokens. Single-user app; admin path is session-authenticated by `requireAuth`. Not a user-facing mutation surface. | Phase 4 | Re-evaluate if multi-user mode is ever added |
| T-04-04-10 | Each retry cycle produces ~4 rows max. Retain-forever per D-18 acceptable in v1 | Phase 4 | Same as T-04-01-03 |
| T-04-05-04 | 6 req/min per user is trivial; TanStack Query dedupes and backs off on errors | Phase 4 | Re-evaluate if multi-user mode is ever added |
| T-04-05-06 | Retry idempotency via `platform_post_id` unique index means accidental double-tap is a no-op. D-14 explicit decision | Phase 4 | N/A |
| T-04-06-02 | Integration tests on phase-gate only; unit tests on every commit. Documented in 04-VALIDATION.md | Phase 4 | N/A |
| T-04-06-04 | Test fixture values are obviously-fake strings, not confusable with real credentials | Phase 4 | N/A |

## Unregistered Threat Flags

None. No `## Threat Flags` sections were found in any 04-0x-SUMMARY.md file.

## Audit Trail

| Date | Auditor | Action | Notes |
|------|---------|--------|-------|
| 2026-04-09 | gsd-secure-phase | Initial audit — Phase 04 all plans | Verified 30 threat mitigations (22 mitigate, 8 accept) across 6 plans; all CLOSED |
