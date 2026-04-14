---
phase: 5
slug: queue-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `packages/api/vitest.config.ts`, `packages/worker/vitest.config.ts`, `packages/web/vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | QUEUE-01 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | QUEUE-02 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | QUEUE-03 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | QUEUE-04 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 2 | QUEUE-05 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 2 | QUEUE-06 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 05-04-01 | 04 | 2 | WORKER-09 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for queue CRUD operations (QUEUE-01, QUEUE-02)
- [ ] Test stubs for queue scheduling engine (QUEUE-05, QUEUE-06)
- [ ] Test stubs for auto-destruct worker (WORKER-09)
- [ ] Shared test fixtures for queue and post factories

*Existing Vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DST transition correctness | QUEUE-06 | Requires real timezone evaluation across DST boundary | Create queue with hour slot at 2am, advance clock through spring-forward, verify no missed/doubled publish |
| UI reorder drag interaction | QUEUE-04 | Visual/interaction verification | Open queue posts page, use move up/down buttons, verify position updates |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
