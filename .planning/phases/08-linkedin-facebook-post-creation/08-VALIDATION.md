---
phase: 8
slug: linkedin-facebook-post-creation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-26
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `packages/*/vitest.config.ts` (per-package) |
| **Quick run command** | `pnpm --filter @sms/<package> test -- --run path/to/file.test.ts` |
| **Full suite command** | `pnpm -r test --run` |
| **Estimated runtime** | ~30–60 seconds (full), <5s (per-file) |

---

## Sampling Rate

- **After every task commit:** Run quick command for the file under test
- **After every plan wave:** Run `pnpm -r test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | (Wave 0 stubs) | — | N/A | unit (skip) | `pnpm -r test --run` | ❌ W0 | ⬜ pending |
| TBD | shared | 1 | POST-LI-04, POST-FB-05 | — | Char-count rejects oversize input | unit | `pnpm --filter @sms/shared test platform-text-limits.test.ts -- --run` | ❌ W0 | ⬜ pending |
| TBD | shared | 1 | (cross-cutting) | — | Discriminated union rejects mixed payloads | unit | `pnpm --filter @sms/shared test posts.test.ts -- --run` | ❌ W0 | ⬜ pending |
| TBD | api | 2 | POST-LI-01, POST-FB-01 | T-API-01 | Server enforces platform char limits, returns 400 on oversize | integration | `pnpm --filter @sms/api test posts.test.ts -- --run` | ❌ W0 | ⬜ pending |
| TBD | api | 2 | LIMIT-06, LIMIT-07 | T-API-02 | Pre-flight blocks at platform limit; window resets atomically | unit + integration | `pnpm --filter @sms/api test rate-limit.test.ts -- --run` | ❌ W0 | ⬜ pending |
| TBD | worker | 2 | POST-LI-01, POST-LI-02 | T-WORKER-01 | LinkedIn publish performs initializeUpload + PUT + posts call | unit | `pnpm --filter @sms/worker test linkedin-publish.test.ts -- --run` | ❌ W0 | ⬜ pending |
| TBD | worker | 2 | POST-FB-02, POST-FB-03, POST-FB-04 | T-WORKER-02 | FB publish: photo upload chain + feed POST OR single-stage video; URL passes via `link` | unit | `pnpm --filter @sms/worker test facebook-publish.test.ts -- --run` | ❌ W0 | ⬜ pending |
| TBD | web | 3 | POST-LI-03 | — | Visibility selector value passes through to commentary call | unit | `pnpm --filter @sms/web test VisibilitySelector.test.tsx -- --run` | ❌ W0 | ⬜ pending |
| TBD | web | 3 | POST-LI-05 | — | LinkedInPreview renders text + visibility + image | unit | `pnpm --filter @sms/web test LinkedInPreview.test.tsx -- --run` | ❌ W0 | ⬜ pending |
| TBD | web | 3 | POST-FB-06 | — | FacebookPreview renders text + URL + image grid (1/2/3/4 + N>4) | unit | `pnpm --filter @sms/web test FacebookPreview.test.tsx -- --run` | ❌ W0 | ⬜ pending |
| TBD | web | 3 | (cross-cutting) | — | applyPlatformSwitch drops fields/truncates per UI-SPEC toast table | unit | `pnpm --filter @sms/web test cross-platform-switch.test.ts -- --run` | ❌ W0 | ⬜ pending |
| TBD | web | 3 | LIMIT-08 | — | Dashboard widget shows correct color band per thresholds | unit | `pnpm --filter @sms/web test RateLimitsCard.test.tsx -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> Concrete Task IDs are filled in by the planner once PLAN.md files are produced.

---

## Wave 0 Requirements

- [ ] `packages/shared/src/__tests__/platform-text-limits.test.ts` — stubs for POST-LI-04, POST-FB-05
- [ ] `packages/shared/src/__tests__/posts.test.ts` — extend with discriminated-union LinkedIn/Facebook cases
- [ ] `packages/api/src/__tests__/posts.test.ts` — stubs for POST-LI-01, POST-FB-01
- [ ] `packages/api/src/__tests__/rate-limit.test.ts` — stubs for LIMIT-06, LIMIT-07
- [ ] `packages/worker/src/__tests__/linkedin-publish.test.ts` — stubs for POST-LI-01, POST-LI-02
- [ ] `packages/worker/src/__tests__/facebook-publish.test.ts` — stubs for POST-FB-02..04
- [ ] `packages/web/src/__tests__/VisibilitySelector.test.tsx` — stub for POST-LI-03
- [ ] `packages/web/src/__tests__/LinkedInPreview.test.tsx` — stub for POST-LI-05
- [ ] `packages/web/src/__tests__/FacebookPreview.test.tsx` — stub for POST-FB-06
- [ ] `packages/web/src/__tests__/cross-platform-switch.test.ts` — stub for cross-cutting switch logic
- [ ] `packages/web/src/__tests__/RateLimitsCard.test.tsx` — stub for LIMIT-08
- [ ] MSW handlers (`@sms/web` test setup) extended with LinkedIn `/rest/posts`, `/rest/images`, FB `/me/photos`, `/me/feed`, `/me/videos` mocks

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live preview visual fidelity matches LinkedIn rendering | POST-LI-05 | Approximate-rendering judgment, not deterministic | Open `/posts/new?platform=linkedin`, paste sample post, compare to linkedin.com side-by-side |
| Live preview visual fidelity matches Facebook rendering | POST-FB-06 | Same as above | Open `/posts/new?platform=facebook`, paste sample post + 4 images, compare to facebook.com |
| Real LinkedIn publish to a sandbox account succeeds | POST-LI-01..05 | Hitting real LinkedIn API requires live OAuth credential | Connect a test LinkedIn profile; publish a text-only and an image post; confirm both appear |
| Real Facebook publish to a sandbox Page succeeds | POST-FB-01..06 | Hitting real Graph API requires Page access token | Connect a test Page; publish text/multi-image/video/url variants; confirm all appear |
| Rate-limit color band visually matches design | LIMIT-08 | Color and threshold judgment | Force counters to 0/40/80/100 percent; verify badge color transitions on dashboard widget |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
