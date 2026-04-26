---
phase: 08-linkedin-facebook-post-creation
plan: 04
subsystem: worker
tags: [worker, linkedin, facebook, publish, rate-limit, error-classifier, bullmq, drizzle]

# Dependency graph
requires:
  - phase: 08-linkedin-facebook-post-creation/02
    provides: socialProfiles linkedinAccountType + window columns, posts.platform / visibility / linkUrl columns, checkLinkedInBudget / checkFacebookBudget pure calculators
  - phase: 08-linkedin-facebook-post-creation/01
    provides: 3 RED worker test stubs (linkedin-publish, facebook-publish, post-lifecycle-rate-limit) — Plan 04 turns them GREEN
provides:
  - callLinkedIn worker service with 3-step image upload (initializeUpload + PUT + /rest/posts) and PUT-failure abort before /posts
  - callFacebook worker service with text-only feed, multi-photo carousel, single-stage video, and link-URL paths
  - FacebookPublishApiError with orphanedPhotoIds payload for partial multi-photo failure cleanup
  - publishPost rate_limit_exhausted graceful abort + atomic per-platform CAS counter increment in Phase 3 success path
  - publish-worker platform dispatcher branching on post.platform (twitter/linkedin/facebook)
  - rate-limit.ts worker module gains loadLinkedInWindowUsage / loadFacebookWindowUsage / checkLinkedInBudgetForWorker / checkFacebookBudgetForWorker
  - @sms/shared error-classifier exports classifyLinkedInError + classifyFacebookError
affects: [08-05a-web-forms-and-previews, 08-05b-dashboard-and-rate-limit-chip, 08-07-integration-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Worker hot-path platform dispatch: Drizzle SELECT FOR UPDATE row carries denormalized platform/visibility/link_url so the publish-worker branches without a second SELECT — no `as Record<string, unknown>` casts (B-01 cascade complete)"
    - "DI-style budget injection: lifecycle calls a single ctx.checkBudget callback; the publish-worker wires per-platform checkers and tags the result with platform + blockThresholdHit so the lifecycle emits rate_limit_exhausted (D-05 / D-07) for non-Twitter at-limit profiles"
    - "Atomic per-platform counter increment in Phase 3 success transaction via tx.update(socialProfiles).set({ field: sql\`CASE WHEN ... END\` }) — same row-lock serialization guarantee as the API-side pre-flight (T-API-02 / T-LIMITS-01)"
    - "Post-fail classifier dispatch by platform: LinkedIn → 401 auth_revoked, 429/5xx transient, other 4xx permanent; Facebook layers Graph code 190 (auth_revoked) + 4/17/32/613 (rate-limit transient) on top of HTTP status"
    - "Buffer normalization helper asHexString() lets the publish services accept either Drizzle text/varchar (production) or Buffer (test fixtures) without leaking the conversion concern into call sites"

key-files:
  created:
    - packages/worker/src/linkedin-publish.service.ts
    - packages/worker/src/facebook-publish.service.ts
  modified:
    - packages/worker/src/post-lifecycle.service.ts
    - packages/worker/src/publish-worker.ts
    - packages/worker/src/rate-limit.ts
    - packages/shared/src/lib/error-classifier.ts
    - packages/worker/src/__tests__/helpers/seed-post.ts
    - packages/worker/src/__tests__/linkedin-publish.test.ts
    - packages/worker/src/__tests__/facebook-publish.test.ts
    - packages/worker/src/__tests__/post-lifecycle-rate-limit.test.ts

key-decisions:
  - "DI-style budget callback rather than direct lifecycle imports of checkLinkedInBudgetForWorker / checkFacebookBudgetForWorker. The lifecycle stays platform-agnostic — it consumes ctx.checkBudget which the publish-worker wires per platform. Same observable behavior as the plan's direct-import design; cleaner test-injection surface (existing twitter-401 tests with `checkBudget: vi.fn().mockResolvedValue({wouldExceed: false})` keep working unchanged)."
  - "callTwitter callback signature gained optional `extras { platform, visibility, linkUrl }` so the publish-worker dispatcher reads typed Plan-02 columns without a second SELECT. Backward compatible — Twitter callbacks ignore the extras and existing tests pass without modification."
  - "Mocked @sms/shared/encryption in linkedin-publish.test.ts and facebook-publish.test.ts. The Wave-0 test fixtures use placeholder Buffer payloads (`Buffer.from('iv-bytes-12345678')` is 17 bytes, AES-GCM requires 12) that would fail real validation. The test contract under verification is the FETCH chain — credential decryption is covered by @sms/shared crypto tests."
  - "Sentinel test 3 in post-lifecycle-rate-limit was tightened during GREEN — Wave-0 used ad-hoc field names (`platformWindowCount`, `windowCount`, `rateLimitWindowCount`) that don't exist in the schema. Plan 03 set the precedent for tightening Wave-0 stubs during GREEN. Replaced with assertions on the real Drizzle column property names (`facebookHourlyCount`, `linkedinDailyCount`)."
  - "Multi-photo / video model: facebook-publish accepts a single `mediaItems` array tagged with `kind: 'image' | 'video'`. The dispatcher picks the video path if any item is `kind: 'video'`, else the multi-photo path. Matches the Wave-0 test contract exactly. The `videoBytes` / `videoFileName` separate args from the plan sketch were dropped in favor of the unified array."
  - "FacebookPublishApiError exposes the partial-failure photo ids on `orphanedPhotoIds` (matching the test contract) — not `uploadedPhotoIds` as the plan sketch suggested. The success-path return still carries `uploadedPhotoIds` so callers see successful uploads separately from the cleanup payload."

patterns-established:
  - "Per-platform classifier dispatch in publish-worker: a single `resolvedPlatform` variable captured by the budget callback drives the catch-block error classifier selection. TypeScript narrowing across async-closure mutations needed an explicit `as string` re-widen at the catch site."
  - "Worker-side window loaders mirror the API-side rate-limit.service.ts shape: same column reads, same expiry rule (UTC-day for LinkedIn, rolling-hour for Facebook). Code is duplicated by design — the worker must not depend on @sms/api (revision Blocker 4)."
  - "Sanitize-error helper inline-defined in each publish service rather than re-exported from @sms/shared. Each service is self-contained and the redaction regex is one line — the shared abstraction would just add coupling without reducing duplication."

requirements-completed:
  - POST-LI-01
  - POST-LI-02
  - POST-FB-01
  - POST-FB-02
  - POST-FB-03
  - POST-FB-04
  - LIMIT-06
  - LIMIT-07

# Metrics
duration: 12min
completed: 2026-04-26
---

# Phase 08 Plan 04: Worker Publish Services Summary

**Worker hot-path now publishes to Twitter, LinkedIn, and Facebook based on post.platform — text-only LinkedIn shares, LinkedIn 3-step image upload, multi-photo Facebook carousels with orphan cleanup, single-stage Facebook video, and rolling-window rate-limit pre-flight + atomic CAS counter increment in the Phase 3 success path. All 154 worker tests GREEN.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-26T14:35:00Z
- **Completed:** 2026-04-26T14:47:55Z
- **Tasks:** 4
- **Files modified:** 9 (2 new services, 4 modified worker source, 1 modified shared, 2 modified tests, 1 modified seed helper)

## Accomplishments

- Plan 01's three worker-side RED tests are now GREEN: `linkedin-publish.test.ts` (6 tests), `facebook-publish.test.ts` (6 tests), `post-lifecycle-rate-limit.test.ts` (4 tests including a new linkedinDailyCount counterpart).
- Full worker test suite is **154/154 GREEN** (was 138/138 + 3 expected failures in Wave 0). API + shared suites unchanged: 413/413 + 13 todo and 140/140.
- callLinkedIn ships the 3-step image flow with a hard pre-condition: PUT failure throws BEFORE the /rest/posts call (T-WORKER-01). Verified by the test's `expect(fetchSpy).toHaveBeenCalledTimes(2)` assertion on the failure path.
- callFacebook handles four shapes — text + link, multi-photo carousel with attached_media, single-stage video upload, and partial-failure with `FacebookPublishApiError.orphanedPhotoIds` so the caller can mark the leaked photo URNs for Phase 11 cleanup (T-WORKER-02).
- Phase 3 success transaction now issues a per-platform `tx.update(socialProfiles).set({ ... CASE WHEN ... END })` so concurrent callers serialize on the row lock — same atomicity guarantee as the API-side pre-flight (T-API-02 / T-LIMITS-01).
- The publish-worker dispatcher reads typed `posts.platform / posts.visibility / posts.linkUrl` from the locked-row payload — no second SELECT, no `as Record<string, unknown>` casts. The B-01 cascade is complete: every `extras?.X` access is statically typed.
- @sms/shared exports two new classifiers — `classifyLinkedInError` and `classifyFacebookError` — that map platform errors into the same `transient | permanent | auth_revoked` partition the BullMQ retry/dead-letter loop already understands.

## Task Commits

1. **Task 1: callLinkedIn worker service with 3-step image upload** — `5eb2ad5` (feat)
2. **Task 2: callFacebook with multi-photo + video paths** — `8e77758` (feat)
3. **Task 3: rate_limit_exhausted abort + per-platform CAS counter increment** — `b8ea48d` (feat)
4. **Task 4: publish-worker dispatcher + error classifier extension** — `3840857` (feat)

## Files Created/Modified

### Worker package — new services
- `packages/worker/src/linkedin-publish.service.ts` *(new)* — callLinkedIn, LinkedInPublishCredentialError, LinkedInPublishApiError, 3-step image upload helpers, person/organization URN dispatch
- `packages/worker/src/facebook-publish.service.ts` *(new)* — callFacebook, FacebookPublishCredentialError, FacebookPublishApiError (with orphanedPhotoIds), uploadUnpublishedPhoto helper, sanitizeErrorBody redaction

### Worker package — modified
- `packages/worker/src/post-lifecycle.service.ts` — `LifecycleAbortReason` gains `rate_limit_exhausted`; pre-flight branches on `budget.platform` to emit either `budget_exhausted` (twitter) or `rate_limit_exhausted` (linkedin/facebook); Phase 3 success transaction adds per-platform CASE-WHEN UPDATE; callTwitter callback signature gains optional `extras { platform, visibility, linkUrl }`; LockedPostRow + SELECT FOR UPDATE extend with platform/visibility/link_url columns
- `packages/worker/src/publish-worker.ts` — handler dispatches on post platform via `extras?.platform`, calls callLinkedInImpl / callFacebookImpl / callTwitterImpl; checkBudget callback resolves the platform via a profile SELECT and tags the budget result with platform + blockThresholdHit; rate_limit_exhausted joins the graceful-abort list; classifier dispatch by platform in the catch block
- `packages/worker/src/rate-limit.ts` — gains `loadLinkedInWindowUsage`, `loadFacebookWindowUsage`, `checkLinkedInBudgetForWorker`, `checkFacebookBudgetForWorker` with the same UTC-day / rolling-hour expiry rules as the API service

### Shared package
- `packages/shared/src/lib/error-classifier.ts` — adds `classifyLinkedInError` (HTTP-status-driven) + `classifyFacebookError` (HTTP status + Graph code 190/4/17/32/613); doc header generalized to "Multi-platform publish error classifier"

### Tests
- `packages/worker/src/__tests__/linkedin-publish.test.ts` — added `vi.mock('@sms/shared/encryption')` so tests exercise the FETCH chain (Wave-0 fixtures use placeholder Buffer payloads that fail real GCM validation)
- `packages/worker/src/__tests__/facebook-publish.test.ts` — same encryption mock; tightened the `.find()` callback parameter type to silence implicit-any
- `packages/worker/src/__tests__/post-lifecycle-rate-limit.test.ts` — sentinel test 3 tightened to assert real Drizzle column names (`facebookHourlyCount`); new test added for `linkedinDailyCount` symmetry
- `packages/worker/src/__tests__/helpers/seed-post.ts` — backfill phase-8 columns (linkedinDailyLimit/Count/WindowStartUtc, facebookHourlyLimit/Count/WindowStartUtc, linkedinAccountType) so the typed `socialProfiles.$inferSelect` shape resolves cleanly

## Decisions Made

- **DI-style budget callback** (vs. direct lifecycle import of `checkLinkedInBudgetForWorker`). The lifecycle stays platform-agnostic — it consumes `ctx.checkBudget` and reads optional `platform` + `blockThresholdHit` from the result. The publish-worker wires per-platform checkers in its handler. Same observable behavior, cleaner test-injection surface.
- **callTwitter callback signature gained `extras { platform, visibility, linkUrl }`** instead of renaming the callback to a generic `callPlatform`. Backward compatible — every existing test that mocks `callTwitter: vi.fn().mockResolvedValue(...)` still passes without modification.
- **Mocked @sms/shared/encryption in the publish tests.** The Wave-0 fixtures use `Buffer.from('iv-bytes-12345678')` (17 bytes; AES-GCM requires 12) — real validation would throw before any FETCH. The contract under test in these files is the HTTP chain, not the credential pipeline. Encryption round-trip is covered by `packages/shared/src/__tests__/encryption.test.ts`.
- **Tightened the Wave-0 sentinel test 3** during GREEN. Plan 03 set the precedent (`Tightened Wave-0 stubs during GREEN`). The Wave-0 stub asserted on `platformWindowCount` / `windowCount` / `rateLimitWindowCount` field names that don't exist in the schema — replaced with assertions on real Drizzle column property names (`facebookHourlyCount`, `linkedinDailyCount`).
- **Single `mediaItems` array tagged with `kind: 'image' | 'video'`** in callFacebook (vs. separate `mediaItems` + `videoBytes` args from the plan sketch). Matches the Wave-0 test contract exactly. The dispatcher picks the video path if any item is `kind: 'video'`, else multi-photo.
- **`orphanedPhotoIds` (not `uploadedPhotoIds`) on the error**. The test contract uses `orphanedPhotoIds` for the cleanup payload. The success-path return still carries `uploadedPhotoIds` so callers can distinguish "uploaded successfully and attached to feed" from "uploaded then leaked when feed POST failed".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Backfilled phase-8 columns in seedSocialProfile helper**
- **Found during:** Task 1 (worker build failed because the Plan-02 schema added new NOT-NULL columns to `socialProfiles` that the existing seed helper didn't return)
- **Issue:** `seedSocialProfile` returned a Partial-shaped row missing `linkedinDailyLimit`, `linkedinDailyCount`, `linkedinWindowStartUtc`, `facebookHourlyLimit`, `facebookHourlyCount`, `facebookWindowStartUtc`, `linkedinAccountType`. Build failed with `Type 'number | undefined' is not assignable to type 'number'`.
- **Fix:** Added the seven columns with their Plan-02 default values (`linkedinDailyLimit: 100`, `facebookHourlyLimit: 200`, `linkedinAccountType: 'person'`, etc.).
- **Files modified:** `packages/worker/src/__tests__/helpers/seed-post.ts`
- **Verification:** `pnpm --filter @sms/worker build` no longer reports the seed-post error; full worker suite stays GREEN.
- **Committed in:** `5eb2ad5`

**2. [Rule 1 - Bug] Buffer→Uint8Array wrap for LinkedIn image PUT**
- **Found during:** Task 4 (typecheck after the dispatcher wire-up)
- **Issue:** `fetch(url, { method: 'PUT', body: imageBytes })` fails to typecheck because Node `Buffer` is no longer assignable to `BodyInit` in the current `lib.dom.d.ts` typings (undici expects `ArrayBufferView` or one of the more specific subtypes).
- **Fix:** `body: new Uint8Array(args.imageBytes)`. Same wire format on the network — Buffer wraps a Uint8Array internally — but TypeScript-clean.
- **Files modified:** `packages/worker/src/linkedin-publish.service.ts`
- **Committed in:** `3840857` (Task 4)

**3. [Rule 1 - Bug] Re-widen `resolvedPlatform` for catch-block classifier dispatch**
- **Found during:** Task 4 (typecheck after Task 4)
- **Issue:** TypeScript's control-flow analysis can't see across async-closure mutations. The `let resolvedPlatform: SupportedPlatform = 'twitter'` declaration narrows back to the literal `'twitter'` at the catch site, breaking the `=== 'linkedin'` / `=== 'facebook'` discriminators.
- **Fix:** `const platformAtFailure = resolvedPlatform as string;` re-widens before the comparisons. Annotated with a comment explaining the CFA limitation.
- **Files modified:** `packages/worker/src/publish-worker.ts`
- **Committed in:** `3840857`

---

**Total deviations:** 3 auto-fixed (1 schema-drift seed helper backfill, 2 typing fix-ups). No architectural escalations needed.

## Issues Encountered

- `pnpm --filter @sms/worker build` continues to report the pre-existing transcode.service.ts / transcode.test.ts ChildProcess `.on` / `.emit` typings drift. These were logged by Plan 03 in `deferred-items.md` and are out of scope for Plan 04 per the SCOPE BOUNDARY rule. Plan 04 source files compile cleanly.
- Test 3 (`atomic CAS counter increment...`) in the Wave-0 stub asserted `rejects.toBeDefined()` against the success path — the stub was written as a sentinel knowing it would fail. Tightened during GREEN per Plan 03 precedent.

## User Setup Required

None. All changes are server-side; no external configuration or new credentials required.

## Verification Snapshot

| Acceptance criterion | Threshold | Actual |
|---|---|---|
| `export async function callLinkedIn` matches in `linkedin-publish.service.ts` | >= 1 | 1 |
| `initializeImageUpload` / `putImageBinary` matches | >= 2 | 4 |
| `x-restli-id` matches in linkedin-publish | >= 1 | 2 |
| `LinkedIn-Version` matches in linkedin-publish | >= 1 | 2 |
| `process.env.ENCRYPTION_KEY` inside callLinkedIn | >= 1 | 1 |
| `as Record<string, unknown>` casts in linkedin-publish | 0 | 0 (1 doc-comment reference only) |
| `profile.linkedinAccountType` typed access | >= 1 | 1 |
| `linkedin-publish.test.ts` exit | 0 | 0 (6/6 GREEN) |
| `export async function callFacebook` matches | >= 1 | 1 |
| `uploadUnpublishedPhoto` matches | >= 2 | 2 |
| `attached_media` matches | >= 1 | 1 |
| `orphanedPhotoIds` / `uploadedPhotoIds` matches | >= 4 | 13 |
| `process.env.ENCRYPTION_KEY` in facebook-publish | >= 1 | 1 |
| `TOKEN_SHAPED_SEQUENCE_RE` / `sanitizeErrorBody` matches | >= 2 | 6 |
| `as Record<string, unknown>` casts in facebook-publish | 0 | 0 |
| `facebook-publish.test.ts` exit | 0 | 0 (6/6 GREEN) |
| `rate_limit_exhausted` matches in post-lifecycle.service.ts | >= 2 | 5 |
| `linkedinDailyCount` CASE-WHEN UPDATE shape | >= 1 | 1 |
| `facebookHourlyCount` CASE-WHEN UPDATE shape | >= 1 | 1 |
| `loadLinkedInWindowUsage` / `loadFacebookWindowUsage` matches in rate-limit.ts | >= 2 | 4 |
| `post-lifecycle-rate-limit.test.ts` exit | 0 | 0 (4/4 GREEN) |
| `callLinkedInImpl` / `callFacebookImpl` matches in publish-worker | >= 4 | 4 |
| `rate_limit_exhausted` matches in publish-worker | >= 1 | 3 |
| `platform === 'linkedin'` matches in publish-worker | >= 1 | 2 |
| `classifyLinkedInError` / `classifyFacebookError` in error-classifier | >= 2 | 2 |
| `as Record<string, unknown>` casts in publish-worker | 0 | 0 (1 doc-comment reference only) |
| Typed `extras?.visibility` / `extras?.linkUrl` access | >= 2 | 2 |
| Full @sms/worker suite | all GREEN | 154/154 |
| Full @sms/api suite | all GREEN | 413/413 + 13 todo |
| Full @sms/shared suite | all GREEN | 140/140 |

## TDD Gate Compliance

This plan is `type: execute` with `tdd="true"` on all four tasks. The RED tests come from Plan 01 (committed in `bb93448`). Plan 04 ships the implementation that drives the worker-side subset GREEN.

- **RED gate:** Plan 01 commit `bb93448` (`test(08-01): add API + worker test stubs`) covers `linkedin-publish.test.ts`, `facebook-publish.test.ts`, `post-lifecycle-rate-limit.test.ts` — all failing for the structural reason that the production modules were intentionally absent.
- **GREEN gate:** Plan 04 commits `5eb2ad5` (Task 1) + `8e77758` (Task 2) + `b8ea48d` (Task 3) + `3840857` (Task 4) ship the production code that makes them pass. All Wave-0 worker tests are now GREEN; full worker suite is 154/154.
- **REFACTOR:** Wave-0 mock tightening (encryption mock + sentinel test 3 column-name update) folded into the relevant Task commits.

## Next Plan Readiness

- **Plan 05a (Web forms + previews):** the worker now publishes LinkedIn shares with typed `visibility` and Facebook posts with typed `linkUrl`. The web layer's submit shape (createPost POST body) carries those columns end-to-end.
- **Plan 05b (Dashboard + rate-limit chip):** the per-platform window counters now advance correctly on every successful publish (LinkedIn → linkedinDailyCount, Facebook → facebookHourlyCount). The dashboard widget can read these directly via the GET /api/rate-limit endpoint Plan 03 shipped.
- **Plan 07 (Integration verification):** has the full worker pipeline available to mount against the MSW handlers from Plan 01. The publish-worker dispatcher branches by platform; the rate-limit pre-flight + atomic CAS increment work end-to-end.

No blockers.

## Self-Check

- [x] All created files exist on disk (`linkedin-publish.service.ts`, `facebook-publish.service.ts` confirmed).
- [x] All 4 task commits exist on the current branch (`5eb2ad5`, `8e77758`, `b8ea48d`, `3840857`) — verified via `git log --oneline -8`.
- [x] All 3 Plan-01 worker-side RED tests now pass (verified via `pnpm --filter @sms/worker exec vitest run`).
- [x] Full @sms/worker suite is 154/154 GREEN.
- [x] Full @sms/api suite is 413/413 + 13 todo (unchanged from Plan 03).
- [x] Full @sms/shared suite is 140/140 GREEN (gained 2 new classifiers; existing tests unaffected).
- [x] @sms/shared and @sms/worker (Plan 04 source files) build cleanly. Pre-existing transcode errors remain in `deferred-items.md` per SCOPE BOUNDARY.
- [x] T-WORKER-01 (no /posts after PUT failure) verified by `expect(fetchSpy).toHaveBeenCalledTimes(2)` on the failure path.
- [x] T-WORKER-02 (orphaned photo cleanup) verified by `rejects.toMatchObject({ orphanedPhotoIds: ['photo_1', 'photo_2'] })`.
- [x] T-WORKER-03 (no token in logs) — logger child contexts include only profileId, correlationId, textLength, hasImage/hasVideo/hasLink, durationMs; no token, no Authorization header. Sanitize-error helper redacts long base64url/hex sequences from captured error bodies.
- [x] T-API-02 / T-LIMITS-01 (atomic CAS) verified by the new tests asserting tx.update(socialProfiles).set({ ... CASE-WHEN ... }) shape.
- [x] Zero `as Record<string, unknown>` casts in the three Phase-8 source files (publish-worker.ts, linkedin-publish.service.ts, facebook-publish.service.ts). The two remaining matches in those files are inside doc comments referencing the absence of casts.

## Self-Check: PASSED

---
*Phase: 08-linkedin-facebook-post-creation*
*Completed: 2026-04-26*
