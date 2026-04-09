---
phase: 4
slug: publish-worker-scheduled-posts
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | packages/*/vitest.config.ts (per-package) |
| **Quick run command** | `pnpm -w vitest run --changed` |
| **Full suite command** | `pnpm -w vitest run` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm -w vitest run --changed`
- **After every plan wave:** Run `pnpm -w vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | WORKER-03 / SCHED-01 | — | N/A | unit | `pnpm -F @sms/worker vitest run idempotency.test` | ❌ W0 | ⬜ pending |

*Populated incrementally by the planner — this is a placeholder row.*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/worker/src/__tests__/helpers/test-redis.ts` — docker-compose.test Redis fixture
- [ ] `packages/worker/src/__tests__/helpers/test-db.ts` — Postgres testcontainer fixture
- [ ] `packages/worker/src/__tests__/helpers/fake-twitter.ts` — MSW handler for Twitter API
- [ ] `packages/worker/vitest.config.ts` — worker package test config (if missing)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bull-Board UI loads and shows queues behind auth | WORKER-08 | Visual/session-cookie flow hard to test end-to-end in unit tests | Log in via browser → navigate to `/admin/queues` → confirm queue list loads; logout → confirm 401 |
| DST transition honored during a real schedule | SCHED-04 | Requires wall-clock to advance through a DST boundary or explicit system clock spoofing | Schedule post for 1:30 AM local on DST spring-forward day → verify fires at correct UTC instant via worker log |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
