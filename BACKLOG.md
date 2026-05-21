# Backlog

Single index of pending work: open GitHub issues + architectural refactors with locked designs + deferred candidates. Ordered roughly by what should be picked up next. Sub-section ordering is editorial — feel free to re-rank.

**How this relates to other artifacts:**
- `.planning/` is the GSD milestone planning machinery (long-running phases, requirements, roadmap). v1.0 is shipped; no active milestone phase right now.
- `docs/adr/` records load-bearing architectural decisions. Refactor items below link to the ADRs that fix their shape.
- `CONTEXT.md` is the domain glossary. Terms used here (`Publisher`, `Post Lifecycle`, etc.) are defined there.
- GitHub issues are the canonical record of bugs and enhancements. This doc is the **ordering view** over them, plus refactor work that has no issue yet.

**Status legend:** `[ ]` pending · `[~]` in progress · `[x]` done · `[-]` deferred / blocked

**Definition of Done:** A row only flips to `[x]` when `pnpm test`, `pnpm typecheck`, and `pnpm lint` all pass from the repo root, every new file is committed, and the linked issue's acceptance criteria are met. See [CLAUDE.md → Definition of Done](./CLAUDE.md#definition-of-done).

---

## Next up

Top-of-queue. An automated workflow should pull from here first.

### P0 — Production blockers

- [ ] **gh#95** — Import Posts template download links do not provide CSV templates
- [ ] **gh#96** — CSV import failures return 500 and hidden toast instead of visible validation errors
- [x] **gh#54** — Profile edit returns 500 (`Couldn't save profile: Internal server error`) *(merged in #77 / 93510a0)*
- [x] **gh#53** — Profile delete returns 500 (`Couldn't delete profile: Internal server error`) *(merged in cbde4a0)*
- [x] **gh#49** — Prod docker-compose.yml doesn't pass OAuth/notification env vars to api+worker containers

### P1 — Security & infra correctness

- [x] **gh#6** — Add `user_id` column to `post_media` to prevent IDOR *(merged in #81 / 293fc46)*
- [x] **gh#26** — Web-production Docker stage runs as root *(merged in #82 / 8e32ee8)*
- [x] **gh#25** — Add nginx security headers and rate limiting *(implemented in PR #83)*
- [x] **gh#15** — Auto-destruct 401/403 should throw `UnrecoverableError` *(merged in #84, released in v1.0.1)*
- [~] **gh#18** — Media cleanup deletes storage before DB row (ordering risk) *(in worktree `.claude/worktrees/18-fix-media-cleanup-deletes-storage-before-db-row/`)*
- [~] **gh#36** — Dev images bake `packages/shared/dist` at build time, breaking after shared exports change *(in worktree `.claude/worktrees/36-dev-infra-api-worker-dev-images-bake-packages/`)*

---

## Architectural Deepening

Locked designs from grilling sessions. Each row is one PR. ADR references make each PR self-contained for review. Listed in dependency order within each candidate.

### Candidate 1 — Publisher seam

**ADRs:** [0001](docs/adr/0001-publish-failure-is-thrown-not-returned.md) (failure shape), [0002](docs/adr/0002-publisher-receives-raw-profile-row.md) (staged scope)
**Domain term:** `Publisher` ([CONTEXT.md](CONTEXT.md))
**Why:** Collapse the two parallel platform switches in `publish-worker.ts`; concentrate platform-specific failure classification and redaction inside each Publisher; open the path to a clean test fake.

- [ ] **R1.1** (gh#56) — Add `Publisher` interface + `PublishFailure` discriminated class to `@sms/shared/publisher.ts`. No callers yet.
- [ ] **R1.2** (gh#57) — Implement `TwitterPublisher` in `@sms/worker/src/publishers/twitter.ts`. Move `classifyTwitterError` inside as a private function. Existing `twitter-publish.service.ts` stays until R1.5.
- [ ] **R1.3** (gh#58) — Implement `LinkedInPublisher` and `FacebookPublisher` the same way.
- [ ] **R1.4** (gh#59) — Switch `publish-worker.ts` to use the `publishers` map. Drop `resolvedPlatform` mutable state and the parallel classifier switch.
- [ ] **R1.5** (gh#60) — Sweep: delete `twitter-publish.service.ts` / `linkedin-publish.service.ts` / `facebook-publish.service.ts` and `@sms/shared/lib/error-classifier` exports. Closes #14. Update tests to use `Partial<Record<Platform, Publisher>>` override.

### Candidate 2 — Post Lifecycle aggregate

**ADRs:** [0003](docs/adr/0003-post-lifecycle-is-pure-functions-not-shared-repository.md) (pure functions vs shared repo), [0004](docs/adr/0004-publish-cycle-orchestration-stays-in-the-worker.md) (5A — worker keeps orchestration)
**Domain terms:** `Post Lifecycle`, `PostPatch` ([CONTEXT.md](CONTEXT.md))
**Why:** Concentrate Post state invariants and `PostPatch` decisions in one place (`@sms/shared/post/aggregate.ts`). Shrink `post.service.ts` and `post-lifecycle.service.ts` to repositories.

- [ ] **R2.1** (gh#61) — Add `@sms/shared/post/aggregate.ts` skeleton + `PostInvariantError` + `planUpdate`. Switch `api/post.service.updatePost` to call it.
- [ ] **R2.2** (gh#62) — Add `planDelete`. Switch `api/post.service.deletePost`.
- [ ] **R2.3** (gh#63) — Add `planTransitionToPublishing` + `TransitionDecision`. Switch the inside-FOR-UPDATE block of `worker/publishPost`.
- [ ] **R2.4** (gh#64) — Add `planRecordSuccess` + `planRecordFailure`. Switch worker's success/failure paths.
- [ ] **R2.5** (gh#65) — Sweep: narrow or delete `PostServiceError`; narrow `PostLifecycleAbort` to a `PostInvariantError` wrapper. Remove dead inline logic.

### Candidate 3 — TokenVault

**ADRs:** [0005](docs/adr/0005-tokenvault-typed-credentials-bag-dispatcher-unseals.md) (supersedes [0002](docs/adr/0002-publisher-receives-raw-profile-row.md) on R3.6 merge)
**Domain terms (introduced by R3.6):** `TokenVault`, `Credentials`, `SafeProfile`
**Why:** Eliminate cipher-field leakage across the six current cipher-handling callsites (Publishers, twitter-delete, token-refresh-worker, profile.service). Plaintext discipline (function-scope, no caching, no logging) moves from "documented in six places" to "enforced by one interface." Closes the deferral noted in ADR-0002.

- [ ] **R3.1** (gh#66) — Add `@sms/shared/tokens/{types,vault}.ts` with `TokenVault` interface, `Credentials` discriminated union, `createTokenVault` factory, fake-vault test helper. No callers yet.
- [ ] **R3.2** (gh#67) — Switch `api/profile.service.ts` (seal direction for Twitter + OAuth 2.0 connect callbacks) to vault.
- [ ] **R3.3** (gh#68) — Switch `worker/token-refresh-worker.ts` (both directions) to vault.
- [ ] **R3.4** (gh#69) — Switch `worker/twitter-delete.service.ts` (auto-destruct, Twitter unseal) to vault.
- [ ] **R3.5** (gh#70) — Switch Publishers to receive `Credentials` from the dispatcher. Strips cipher-handling from the three Publisher files entirely. *Depends on Candidate 1 R1.5 (gh#60).*
- [ ] **R3.6** (gh#71) — Sweep: narrow `@sms/shared` encryption exports, write ADR-0005, mark ADR-0002 superseded, add domain terms to CONTEXT.md.

### Candidate 4 — OAuth route error-mapping

**ADRs:** [0006](docs/adr/0006-oauth-stays-procedural-no-sealed-connectattempt.md)
**Why (narrow scope):** Grilling concluded the original "sealed `ConnectAttempt` object" pitch was over-scoped — the existing OAuth service does real work (atomic GET+DEL, secure nonce generation, fingerprint-only logging). The only earned-its-keep deepening is consolidating the route-side error-to-HTTP mapping. The bigger refactor is recorded as rejected in ADR-0006.

- [ ] **R4.1** (gh#72) — Single `oauthErrorToHttpResponse(err)` mapping table at the route boundary. Same pattern as R2.1's `PostInvariantError` mapping.

### Candidate 5 — BulkOperationFactory

**Why:** The "bulk-ops service" is a 36-line BullMQ wrapper; the real orchestration (idempotency parsing + bulk_operations insert + enqueue) copies between routes. Three PRs: build the factory, switch each consumer. Two adapters proves the seam.

- [ ] **R5.1** (gh#73) — Add `BulkOperationFactory` absorbing the full chain (parse → existence check → insert → enqueue). Unit tests. No callers.
- [ ] **R5.2** (gh#74) — Switch `routes/bulk-import.ts` to the factory.
- [ ] **R5.3** (gh#75) — Switch `routes/queues.ts` bulk-ops path to the factory; sweep stale helpers.

### Candidate 6 — Rate-limit loader dedupe

**ADRs:** [0007](docs/adr/0007-drizzle-in-shared-allowed-for-io-utilities-not-pure-logic.md)
**Why:** Worker explicitly comments *"we deliberately duplicate"* — the loaders are identical to the API's. Pure calculator already lives in `@sms/shared`. One PR, one cohesive move.

- [ ] **R6.1** (gh#76) — Push `loadXUsage` loaders into `@sms/shared/rate-limit/loaders.ts`; both packages compose them.

---

## Open issues — by category

These are tracked in GitHub. Listed here for completeness so an automated workflow can see the whole queue. Pull these after Next-up + Architectural Deepening unless something jumps the queue.

### Bugs

- [ ] **gh#87** — nginx: add real_ip module support so rate limits + audit logs key on real client IP behind layered proxies *(surfaced in #86 review — limitation of #25's rate-limit zones + #50's XFF overwrite)*
- [ ] **gh#112** — queue-empty notification payload doesn't match `queueEmptyNotificationSchema` — 8,297 silent failures accumulated *(sibling of gh#85, surfaced during 2026-05-21 Bull Board screenshot pass)*
- [ ] **gh#85** — Auto-destruct failure notification payload doesn't match `autoDestructFailedNotificationSchema` *(surfaced in #84 review — pre-existing, predates #15)*
- [ ] **gh#52** — Date picker icon barely visible on new-post page in dark mode
- [ ] **gh#50** — Secure cookies + CSRF fail behind reverse proxy (trust proxy + nginx X-Forwarded-Proto) — *partial fix already merged in `0824e22`*
- [ ] **gh#34** — Auto-destruct help copy hardcoded to "Twitter/X" on LinkedIn and Facebook composer forms
- [ ] **gh#31** — Phase 6 leftovers: worker TS build errors + posts-api test failure on develop
- [ ] **gh#21** — `MediaStatusPoller` never updates parent state after transcode completes

### Performance

- [ ] **gh#7** — Sharp triple-decode in `processImageUpload`
- [ ] **gh#8** — Serial UPDATE loop in `associateMediaToPost`
- [ ] **gh#9** — Cache `/api/settings/storage` aggregate query
- [ ] **gh#16** — N+1 DELETE and unbounded SELECT in `media-cleanup-worker`
- [ ] **gh#24** — Upload files concurrently instead of sequentially

### Refactoring / type safety

- [ ] **gh#78** — Express Request module augmentation for `req.id` to remove ad-hoc type casts *(follow-up from PR #77 review)*
- [ ] **gh#10** — Split `media.service.ts` god module
- [ ] **gh#11** — Move `@aws-sdk/client-s3` out of `@sms/shared`
- [-] **gh#14** — Extract shared Twitter client factory from publish/delete services *(superseded by R1.5 / gh#60 — will close on that PR's merge)*
- [ ] **gh#22** — Extract shared `usePostMedia` hook from `NewPostPage`/`EditPostPage`
- [ ] **gh#23** — Add `media` field to `Post` interface instead of `as unknown` cast
- [ ] **gh#27** — `StorageBackend` interface gaps — `contentType` discard, no destroy lifecycle
- [ ] **gh#29** — Nginx `proxy_pass` URI inconsistency between prod and dev

### Tests

- [ ] **gh#12** — Add real auth middleware coverage for media/settings routes
- [ ] **gh#13** — Fix mock-db `updateChainable` and centralize mock factories
- [ ] **gh#20** — Transcode worker processor has zero test coverage
- [ ] **gh#28** — Shared storage test coverage gaps
- [ ] **gh#41** — Phase 11 follow-up: SnippetPicker arrow-nav + Enter regression test
- [ ] **gh#42** — Phase 11 follow-up: calendar today-cell highlighting regression test
- [ ] **gh#43** — Phase 11 follow-up: calendar conflict tooltip interaction regression test
- [ ] **gh#79** — Assert handler-level + central log both fire on PATCH 500 (prevent silent regression) *(follow-up from PR #77 review)*
- [ ] **gh#80** — Refactor `error-handler.test.ts` — hoist `logger.error` spy setup to helper or `beforeEach` *(follow-up from PR #77 review)*

### Enhancements / config

- [ ] **gh#94** — Queue creation: add inline help + live "Next 5 publish times" preview *(operator confusion — interval modes vs hour windows aren't legible from the form alone)*
- [ ] **gh#19** — Transcode worker missing retry attempts and backoff

---

## Deferred candidates

Identified during architectural review, deliberately not in scope right now.

- [x] **Candidate 3 — TokenVault** — Designed; moved to Architectural Deepening section as R3.1–R3.6 (gh#66–71).
- [x] **Candidate 6 — Rate-limit DB-loader dedupe** — Designed; moved to active section as R6.1 (gh#76).
- [x] **Candidate 4 — OAuth Connect** — Grilled; full sealed-object refactor rejected per ADR-0006. Narrow route-error mapping work moved to active section as R4.1 (gh#72).
- [x] **Candidate 5 — `BulkOperationFactory`** — Designed; moved to active section as R5.1–R5.3 (gh#73–75).
- [x] **Candidate 7 — `PostMedia` aggregate** — Rejected as architectural-deepening framing. The real friction (god module) is already tracked as **gh#10** (Split media.service.ts) — see Open Issues → Refactoring section.

---

## Automation notes

A future workflow can read this file by:
1. Walking the markdown task lists in order (`Next up` → `Architectural Deepening` → `Open issues`)
2. Picking the first `[ ]` row
3. Resolving its GitHub issue (`gh#NN`) or refactor identifier (`R{n}.{m}`)
4. Creating a branch named per the [user's branch convention](.claude/CLAUDE.md) and opening a PR

For refactor rows without an issue yet (R1.1, R1.2, …), the workflow can create the issue on the fly using the row title as the issue title and the linked ADRs as the issue body.
