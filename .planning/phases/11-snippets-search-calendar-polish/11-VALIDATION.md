---
phase: 11
slug: snippets-search-calendar-polish
status: complete
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-01
updated: 2026-05-01
---

# Phase 11 — Validation Strategy

> Per-task verification map filled by the planner from the 11 plans. Detailed background lives in `11-RESEARCH.md` `## Validation Architecture`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (workspace) |
| **Config file** | `vitest.config.ts` (root) + per-package configs in `packages/{api,web,shared,worker,db}` |
| **Quick run command** | `pnpm -w vitest run --changed` |
| **Full suite command** | `pnpm -w test` |
| **Integration suite** | `INTEGRATION=1 pnpm -w test` (real Postgres tests gated by env var) |
| **Estimated runtime** | ~45 seconds (full unit); ~90 seconds (with integration) |

Integration tests requiring Postgres FTS run against the docker-compose `pgsql` service; tests are tagged `@integration` and gated by `INTEGRATION=1`.

---

## Sampling Rate

- **After every task commit:** Run quick command (`pnpm -w vitest run --changed`)
- **After every plan wave:** Run full suite (`pnpm -w test`)
- **Before `/gsd-verify-work`:** Full suite + integration suite (`INTEGRATION=1 pnpm -w test`) must be green
- **Phase-gate manual:** `rg -i "openai" packages/api/src` must match only the two SEC-07 test files

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-T1 | 01 | 0 | SNIP-03 | T-11-01-04, T-11-01-05 | Token regex bounded charset; length-guard short-circuit; missing-name path returns identifier without exposing data | unit | `pnpm --filter @sms/shared test -- --run snippet-tokens.test` | ❌ wave 0 | ⬜ pending |
| 11-01-T2 | 01 | 0 | SNIP-01, CAL-01..04, SEARCH-01..02 | T-11-01-01, T-11-01-02, T-11-01-03 | Strict schemas reject extra keys; window cap 100 days; charset regex on snippet name | unit (tsc) | `pnpm --filter @sms/shared exec tsc --noEmit` | ❌ wave 0 | ⬜ pending |
| 11-02-T1 | 02 | 0 | SEC-07 | T-11-02-01 | pino redacts openai_api_key + 2 case variants + nested-object wildcards | unit | `pnpm --filter @sms/api test -- --run logger.test` | ✓ extend | ⬜ pending |
| 11-02-T2 | 02 | 0 | SEC-07 | T-11-02-02 | Static contract test enumerates every BullMQ job-data Zod schema, fails CI if any field name matches /openai\|api[_-]?key/i | unit (contract) | `pnpm --filter @sms/api test -- --run sec-07-job-schema.test` | ❌ wave 0 | ⬜ pending |
| 11-02-T3 | 02 | 0 | SEC-07 | T-11-02-05, T-11-02-06 | Policy doc at SECURITY.md; grep gate excludes prod AI code | shell check | `rg -li "openai" packages/api/src \| rg -v "__tests__/(logger\|sec-07-job-schema)\.test\.ts"` returns empty | ❌ wave 0 | ⬜ pending |
| 11-03-T1 | 03 | 1 | SNIP-01, SEARCH-02 | T-11-03-01, T-11-03-02 | snippets userId NOT NULL FK cascade; case-insensitive unique at DB level | unit (tsc) | `pnpm --filter @sms/db exec tsc --noEmit` | ❌ wave 0 | ⬜ pending |
| 11-03-T2 | 03 | 1 | SEARCH-01..02 | T-11-03-03, T-11-03-04 | Migration SQL: GENERATED ALWAYS with regconfig literal (immutable); idempotent re-apply via DROP TRIGGER IF EXISTS + CREATE INDEX IF NOT EXISTS | shell check | grep checks (5 tokens) in 11-03 verify command | ❌ wave 0 | ⬜ pending |
| 11-04-T1 | 04 | 2 | SNIP-01, SEARCH-01..02 | T-11-04-01, T-11-04-02 | Live DB has table + cols + GIN + trigger; advisory-locked migration runner | shell check (psql) | `docker exec pgsql psql ... -c "\d posts"` and grep checks in 11-04 verify command | ❌ wave 1 | ⬜ pending |
| 11-05-T1 | 05 | 3 | SNIP-01 | T-11-05-01 | Service every CRUD filters by userId; cross-user 404; 23505 → 409 | unit (mock-db) | `pnpm --filter @sms/api test -- --run snippet.service.test` | ❌ wave 0 | ⬜ pending |
| 11-05-T2 | 05 | 3 | SNIP-01 | T-11-05-01, T-11-05-02, T-11-05-04 | Routes use requireAuth + safeParse; cross-tenant integration test; duplicate-name 409 | integration | `pnpm --filter @sms/api test -- --run snippets-api.test` | ❌ wave 0 | ⬜ pending |
| 11-06-T1 | 06 | 3 | SEARCH-01..02 | T-11-06-01, T-11-06-02 | Drizzle sql template parameter-binds search input; userId filter preserved; scope-by-view enforced | unit | `pnpm --filter @sms/api test -- --run post.service.test` | ✓ extend | ⬜ pending |
| 11-06-T2 | 06 | 3 | SEARCH-01..02 | T-11-06-01, T-11-06-02 | Real-Postgres integration: ranked headline, GIN hit (EXPLAIN parse), scope isolation, cross-tenant, injection-safety | integration | `INTEGRATION=1 pnpm --filter @sms/api test -- --run posts-search.test` | ❌ wave 0 | ⬜ pending |
| 11-07-T1 | 07 | 3 | CAL-01..04 | T-11-07-02, T-11-07-03, T-11-07-07 | userId filter; checkConflicts reused (no duplicate logic); window cap; tag filter via EXISTS | unit (tsc) | `pnpm --filter @sms/api exec tsc --noEmit` | ❌ wave 0 | ⬜ pending |
| 11-07-T2 | 07 | 3 | CAL-01..04 | T-11-07-01, T-11-07-02 | 7 integration tests: window bounds, window cap (100 days), hasConflict same/different profile, scope filters, platform/profile/tags filters, cross-tenant, text-preview truncation | integration | `INTEGRATION=1 pnpm --filter @sms/api test -- --run calendar-api.test` | ❌ wave 0 | ⬜ pending |
| 11-08-T1 | 08 | 3 | SNIP-03 | T-11-08-01, T-11-08-04 | Snippets fetched by job.userId only; Pitfall guards in token regex; rows with missing snippets land in error report; stored text contains no `{{`/`}}` | integration | `pnpm --filter @sms/worker test -- --run csv-import` | ❌ wave 0 | ⬜ pending |
| 11-09-T1 | 09 | 4 | SNIP-01, SNIP-02, POST-CMN-08 | T-11-09-01, T-11-09-02 | Cursor-position capture in onPointerDown; insertion via React-controlled value (no innerHTML); Escape returns focus | component | `pnpm --filter @sms/web test -- --run SnippetPicker.test` | ❌ wave 0 | ⬜ pending |
| 11-09-T2 | 09 | 4 | SNIP-01, SNIP-02 | T-11-09-01, T-11-09-04 | RHF + Zod resolver for create/edit dialog; toast wording verbatim; ConfirmDestructiveDialog reused for delete | component | `pnpm --filter @sms/web test -- --run SharedPostFields.test SnippetPicker.test` | ❌ wave 0 | ⬜ pending |
| 11-10-T1 | 10 | 4 | SEARCH-02 | T-11-10-01 | Allowlist parser maps <b> to <mark> via React; never dangerouslySetInnerHTML; <script> renders as text | unit | `pnpm --filter @sms/web test -- --run headline-to-mark.test` | ❌ wave 0 | ⬜ pending |
| 11-10-T2 | 10 | 4 | SEARCH-01..02 | T-11-10-04 | QueuePostsPage 1:1 search input; debounced URL state via setSearchParams replace:true | component | `pnpm --filter @sms/web test -- --run QueuePostsPage.test` | ❌ wave 0 | ⬜ pending |
| 11-11-T1 | 11 | 4 | CAL-01..04 | T-11-11-04 | rbc CSS imported in exactly one module (CalendarPage); platform color tokens added | shell check | `rg "react-big-calendar/lib/css" packages/web/src \| wc -l` returns 1; grep platform colors in index.css | ❌ wave 0 | ⬜ pending |
| 11-11-T2 | 11 | 4 | CAL-01..04 | T-11-11-01, T-11-11-03, T-11-11-06 | Per-platform eventPropGetter; conflict left-border destructive; normalizeRange handles all three onRangeChange shapes; click navigation | component | `pnpm --filter @sms/web test -- --run CalendarPage.test` | ❌ wave 0 | ⬜ pending |
| 11-11-T3 | 11 | 4 | CAL-01 | — | Sidebar entry + /calendar route reachable | shell check | grep checks in 11-11 Task 3 verify command | ❌ wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/shared/src/lib/snippet-tokens.ts` + tests — plan 11-01
- [ ] `packages/shared/src/schemas/snippets.ts` — plan 11-01
- [ ] `packages/shared/src/schemas/calendar.ts` — plan 11-01
- [ ] `packages/api/src/__tests__/sec-07-job-schema.test.ts` — plan 11-02
- [ ] `SECURITY.md` — plan 11-02
- [ ] No new framework install — Vitest 4 already configured
- [ ] react-big-calendar install — plan 11-11 Task 1 (web only, tilde-pinned)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Snippet picker keyboard insertion in mobile Safari (cursor-position trap) | SNIP-02 | Mobile Safari blurs textarea on popover open; jsdom can't reproduce focus/selection semantics | On iOS Safari real device: open composer, place cursor mid-text, open snippet picker, insert snippet, verify text inserts at original cursor position (not appended) |
| Search highlight readability against the dark theme | SEARCH-02 | Color contrast is qualitative | Manual: query "newsletter"; confirm highlighted spans pass WCAG AA contrast |
| Calendar visual parity across M/W/D | CAL-01 | rbc internal layout differences across views | Manual: switch M → W → D; confirm event positioning, color-coding, conflict indicators all render correctly |
| Cross-platform color contrast on calendar entries | CAL-02 | OKLCH platform colors against dark zinc require eyeball check | Manual: confirm Twitter / LinkedIn / Facebook entries are visually distinct against background |
| Calendar entry click in production-like build | CAL-02 | rbc + React Router interaction differs slightly between dev and prod | Manual: build production assets, click an event, verify navigation works |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references from RESEARCH §Validation Architecture
- [x] No watch-mode flags in CI commands
- [x] Feedback latency < 90s (45s unit + 45s integration)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** filled
