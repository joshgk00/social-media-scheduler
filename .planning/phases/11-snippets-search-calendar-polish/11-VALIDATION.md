---
phase: 11
slug: snippets-search-calendar-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-01
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Detailed per-task mappings live in `11-RESEARCH.md` `## Validation Architecture`; the planner copies rows into this file as plans are written.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (workspace) |
| **Config file** | `vitest.config.ts` (root) + per-package configs in `packages/{api,web,shared}` |
| **Quick run command** | `pnpm -w vitest run --changed` |
| **Full suite command** | `pnpm -w test` |
| **Estimated runtime** | ~45 seconds (full); ~5 seconds (quick) |

Integration tests requiring Postgres FTS run against the docker-compose `pgsql` service; tests are tagged `@integration` and gated by `INTEGRATION=1`.

---

## Sampling Rate

- **After every task commit:** Run quick command (`pnpm -w vitest run --changed`)
- **After every plan wave:** Run full suite (`pnpm -w test`)
- **Before `/gsd-verify-work`:** Full suite must be green; integration suite (`INTEGRATION=1 pnpm -w test`) must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

> Filled in by the planner as plans are written. Reference rows from `11-RESEARCH.md` `## Validation Architecture`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _to be filled by planner_ | — | — | — | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/shared/src/lib/snippet-tokens.ts` — token regex + substitution helper (shared by API + worker)
- [ ] `packages/shared/src/lib/snippet-tokens.test.ts` — Vitest stubs for SNIP-01 substitution invariants
- [ ] `packages/api/src/__tests__/sec-07-job-schema.test.ts` — enumerates BullMQ Zod job schemas (SEC-07)
- [ ] `packages/api/src/db/__tests__/search-fts.integration.test.ts` — integration harness for `to_tsvector('english', …)` + GIN (SEARCH-01..02)
- [ ] `packages/web/src/test/calendar-fixtures.ts` — deterministic event fixtures across timezones for CAL-01..04
- [ ] No new framework install — Vitest 4 already configured

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Snippet picker keyboard insertion in mobile Safari (cursor-position trap) | SNIP-02 | Mobile Safari blurs textarea on popover open; jsdom can't reproduce focus/selection semantics | On iOS Safari real device: open composer, place cursor mid-text, open snippet picker, insert snippet, verify text inserts at original cursor position (not appended) |
| react-big-calendar drag-to-reschedule visual feedback | CAL-03 | Pointer-drag rendering is visual — Vitest covers handler logic but not animation/drop preview | Manual: drag a scheduled post across days/weeks; confirm preview ghost, drop target highlight, server-confirmed time matches preview |
| Search highlight readability against light/dark themes | SEARCH-02 | Color contrast is qualitative | Manual: query "newsletter"; confirm highlighted spans pass WCAG AA contrast in both themes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references from RESEARCH §Validation Architecture
- [ ] No watch-mode flags in CI commands
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter once planner finalizes per-task map

**Approval:** pending
