---
phase: 1
slug: infrastructure-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `pnpm --filter @sms/api test -- --run` |
| **Full suite command** | `pnpm -r test -- --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @sms/api test -- --run`
- **After every plan wave:** Run `pnpm -r test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | INFRA-01 | — | N/A | integration | `test -f pnpm-workspace.yaml` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | INFRA-02 | — | N/A | integration | `docker compose config --quiet` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | INFRA-04 | — | N/A | unit | `pnpm --filter @sms/db test -- --run` | ❌ W0 | ⬜ pending |
| 1-02-02 | 02 | 1 | INFRA-05 | — | N/A | integration | `docker compose exec redis redis-cli CONFIG GET maxmemory-policy` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 2 | INFRA-06 | — | N/A | integration | `curl -s http://localhost:3000/health \| jq .status` | ❌ W0 | ⬜ pending |
| 1-03-02 | 03 | 2 | INFRA-07 | — | N/A | unit | `pnpm --filter @sms/worker test -- --run` | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 2 | SEC-01 | T-1-01 | AES-256-GCM encrypt/decrypt round-trip | unit | `pnpm --filter @sms/shared test -- --run` | ❌ W0 | ⬜ pending |
| 1-04-02 | 04 | 2 | SEC-05 | T-1-02 | CSRF rejects POST without token | integration | `pnpm --filter @sms/api test -- --run` | ❌ W0 | ⬜ pending |
| 1-05-01 | 05 | 2 | INFRA-08 | — | Sensitive data never logged | unit | `pnpm --filter @sms/api test -- --run` | ❌ W0 | ⬜ pending |
| 1-05-02 | 05 | 2 | INFRA-09 | — | N/A | unit | `pnpm --filter @sms/api test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/vitest.config.ts` — vitest config for API package
- [ ] `packages/shared/vitest.config.ts` — vitest config for shared package
- [ ] `packages/worker/vitest.config.ts` — vitest config for worker package
- [ ] `packages/db/vitest.config.ts` — vitest config for db package
- [ ] vitest + supertest installed as dev dependencies

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HTTPS via Cloudflare Tunnel | INFRA-03 | Requires external Cloudflare Tunnel on Proxmox host | Configure tunnel, verify `curl https://yourdomain.com/health` returns 200 |
| Docker Compose full startup | INFRA-02 | Requires Docker runtime on Proxmox | Run `docker compose up -d`, verify all 5 services healthy via `docker compose ps` |
| Worker heartbeat in Redis | INFRA-07 | Requires running worker service | Start worker, wait 30s, check Redis key `worker:heartbeat` exists and is < 60s old |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
