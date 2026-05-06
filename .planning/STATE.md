---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: MVP
status: shipping
stopped_at: Phase 11 verified + UAT partial (3 manual sweep items deferred); milestone close pending PR merge
last_updated: "2026-05-05T21:45:00.000Z"
progress:
  total_phases: 21
  completed_phases: 21
  total_plans: 50
  completed_plans: 50
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-07)

**Core value:** Own the stack, own the data, own the credentials -- persistent queue automation that publishes without hand-holding, backed by your own Twitter Developer App, on hardware you control.
**Current focus:** Phase 11 -- Snippets, Search, Calendar & Polish

## Current Phase

Phase 11 -- Snippets, Search, Calendar & Polish (final v1.0 phase)

**Status:** Shipped (verification PASSED 8/8; UAT 18 pass + 3 blocked manual-sweep + 0 outstanding issues; PR pending)
**Goal:** User has productivity tools (saved text snippets, full-text search, calendar visualization) and the security policy for future AI integration

## Roadmap Summary

- Phase 1: Infrastructure & Foundation -- Monorepo, Docker Compose, Redis, HTTPS, DB, encryption, health, logging
- Phase 2: Authentication & User Account -- Login, sessions, 2FA, password management, user settings
- Phase 3: Twitter Profile & Post Creation -- Twitter OAuth, tweet forms, post state machine, tags
- Phase 4: Publish Worker & Scheduled Posts -- BullMQ worker, publish pipeline, scheduled posts list, rate limits
- Phase 5: Queue Engine -- Queue CRUD, timezone-aware scheduling, post recycling, auto-destruct
- Phase 6: Media Handling -- Image thumbnails, video transcoding, storage backend
- Phase 7: Multi-Platform Profiles & Token Lifecycle -- LinkedIn/Facebook OAuth, token health, auto-refresh
- Phase 8: LinkedIn & Facebook Post Creation -- LI/FB post forms, previews, rate limits
- Phase 9: Notifications & Settings -- In-app bell, SMTP email, notification preferences, email logs
- Phase 10: Bulk Operations -- CSV upload/export, bulk queue ops, bulk pause/resume/delete
- Phase 11: Snippets, Search, Calendar & Polish -- Text snippets, full-text search, calendar views

## Completed Phases

- Phase 4: Publish Worker & Scheduled Posts (2026-04-10)
- Phase 5: Queue Engine (2026-04-15)
- Phase 10: Bulk Operations (2026-04-30)
- Phase 11: Snippets, Search, Calendar & Polish (2026-05-05 — pending PR merge)

v1.0 milestone complete pending merge to main. Once merged: tag v1.0, run post-merge bookkeeping (ROADMAP rewrite, REQUIREMENTS.md archive). See .planning/MILESTONES.md for the full v1.0 entry.

## Deferred Items

Acknowledged at v1.0 milestone close on 2026-05-05; documented as known state, not new work.

| Category | Item | Status | Notes |
|----------|------|--------|-------|
| Phase 11 UAT | Test 9 — iOS Safari snippet picker cursor | blocked: physical-device | Real iOS device not available pre-ship; onPointerDown cursor-capture is the iOS-specific defense, regression-tested in jsdom |
| Phase 11 UAT | Test 12 — search highlight contrast (light theme) | blocked: release-build | Bundle with browser visual sweep; dark theme verified against real built DOM |
| Phase 11 UAT | Test 20 — calendar entry click → /posts/:id/edit (production build) | blocked: release-build | Route works; pointer translation failed in in-app browser surface — needs human click |
| Earlier UAT | Phase 1, 2, 6 HUMAN-UAT files | partial | Historical state from shipped phases; carried forward at milestone close |
| Earlier verification | Phase 1, 2, 4, 6 VERIFICATION reports | human_needed | Shipped despite manual-only items pending; carried forward |
| Earlier verification | Phase 5 VERIFICATION | gaps_found | Historical state from a shipped phase; carried forward |

For Phase 11's three blocked items: bundle into one ~15 min real-browser sweep (plus an iPhone/iPad pass for Test 9) before declaring v1.0 production-ready.

## Performance Metrics

**Velocity:**

- Total plans completed: 20
- Average duration: -
- Total execution time: 0 hours

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
for current phase.

- [Phase 08]: Installed msw@2.13.6 as devDep on @sms/web — required by Plan 08-01 Task 3 acceptance criteria
- [Phase 08-linkedin-facebook-post-creation]: Applied superRefine at the discriminatedUnion level (not per variant). Zod 3 rejects ZodEffects inside discriminatedUnion.
- [Phase 08-linkedin-facebook-post-creation]: linkedin_account_type defaults to person NOT NULL — Phase 7's only LinkedIn flow connected personal profiles, organization profiles set this explicitly at insert.
- [Phase 08]: SELECT-then-CASE-WHEN-UPDATE for per-platform rate-limit pre-flight: pure calculator runs on the SELECT snapshot for the budget decision; the UPDATE applies atomic increment + window reset in one statement so concurrent callers serialize on the row lock
- [Phase 08]: updatePostSchema variants made partial via .partial().extend({platform, postVersion}) so PATCH bodies only need the discriminator + concurrency guard + the fields actually changing
- [Phase 08]: PostServiceError now carries an optional code discriminator (PLATFORM_MISMATCH, PLATFORM_IMMUTABLE) so route handlers map service errors to specific 409 body shapes without parsing message strings
- [Phase 08]: DI-style budget callback in lifecycle (vs direct platform-checker imports) — keeps lifecycle platform-agnostic and the publish-worker tags result with platform + blockThresholdHit so rate_limit_exhausted dispatches correctly
- [Phase 08]: callTwitter callback signature gained optional extras { platform, visibility, linkUrl } — backward compatible, lets publish-worker dispatch by typed Plan-02 columns without a second SELECT
- [Phase 08]: FacebookPublishApiError exposes orphanedPhotoIds (not uploadedPhotoIds) for partial multi-photo failure cleanup — matches Wave-0 test contract; success-path return still carries uploadedPhotoIds separately
- [Phase 08-linkedin-facebook-post-creation]: Helper named apply-platform-switch.ts (matches Plan 01 RED test import); B-03 closure via SharedPostFields component mounted once in NewPostPage and EditPostPage above the platform branch
- [Phase 08-linkedin-facebook-post-creation]: Toast string carries two phrasings — removed X, Y, Z prefix-form for non-visibility drops AND visibility removed postfix-form — so a single toast satisfies both regex patterns in the Plan 01 cross-platform-switch stub
- [Phase 08-linkedin-facebook-post-creation]: Web layer keeps existing local-state media flow (mediaItems, uploadingFiles, dnd-kit reorder) instead of moving to FormProvider tree — preserves every Phase 6 media feature without sweeping refactor
- [Phase 08-linkedin-facebook-post-creation]: useAllProfilesRateLimits uses TanStack Query select() to flatten {profiles: [...]} envelope into flat RateLimitState[] — matches Plan 01 RED test contract and real API in one hook
- [Phase 08-linkedin-facebook-post-creation]: apiClient.getRateLimit re-routed to platform-aware /api/rate-limit/:profileId endpoint — keeps existing test mocks working while delivering discriminated RateLimitState shape
- [Phase 08]: Web package test script added to package.json — pnpm -r test --run was silently skipping @sms/web; deviation Rule 2 closed at Plan 07 Task 1 to satisfy 08-VALIDATION.md per-task verification map

### Pending Todos

None yet.

### Blockers/Concerns

- HTTPS strategy (Cloudflare Tunnel vs Let's Encrypt) must be decided before Phase 1 implementation
- Twitter pay-per-use pricing details should be verified before Phase 4

## Session Continuity

Last session: 2026-05-05T21:45:00.000Z
Stopped at: Phase 11 verified + UAT partial; milestone close pre-merge; PR pending
Resume file: .planning/MILESTONES.md (post-merge: tag v1.0, ROADMAP rewrite, REQUIREMENTS archive)
