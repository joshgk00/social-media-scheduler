---
phase: 2
slug: authentication-user-account
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/api/vitest.config.ts`, `packages/web/vitest.config.ts` |
| **Quick run command** | `npm run test -w packages/api -- --run` |
| **Full suite command** | `npm run test --workspaces -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -w packages/api -- --run`
- **After every plan wave:** Run `npm run test --workspaces -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | AUTH-01 | T-02-01 | Argon2id password hashing | unit | `npm run test -w packages/api -- --run` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | AUTH-02 | T-02-02 | 24-hour sliding window session | unit | `npm run test -w packages/api -- --run` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | AUTH-03 | T-02-03 | TOTP verification with clock skew | unit | `npm run test -w packages/api -- --run` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | AUTH-04 | T-02-04 | Rate limiting (5 attempts / 15 min lockout) | integration | `npm run test -w packages/api -- --run` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 2 | AUTH-05 | T-02-05 | Security question answer hashing | unit | `npm run test -w packages/api -- --run` | ❌ W0 | ⬜ pending |
| 02-05-01 | 05 | 3 | AUTH-06 | T-02-06 | Session invalidation on password change | integration | `npm run test -w packages/api -- --run` | ❌ W0 | ⬜ pending |
| 02-06-01 | 06 | 3 | AUTH-07 | — | Setup wizard single-user enforcement | integration | `npm run test -w packages/api -- --run` | ❌ W0 | ⬜ pending |
| 02-07-01 | 07 | 3 | SETTINGS-01 | — | Settings CRUD (timezone, date format, etc.) | unit | `npm run test -w packages/api -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/api/src/__tests__/helpers/` — shared test fixtures (DB setup, session mocks)
- [ ] `packages/api/vitest.config.ts` — vitest config if not already present
- [ ] `packages/web/vitest.config.ts` — vitest config for frontend tests

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| QR code renders correctly | AUTH-03 | Visual verification of QR code image | Enable 2FA, verify QR code scans in authenticator app |
| Profile image upload + display | SETTINGS-01 | Visual verification of image rendering | Upload image, verify thumbnail displays in settings |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
