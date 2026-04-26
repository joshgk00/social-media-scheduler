---
phase: 8
slug: linkedin-facebook-post-creation
verified_at: 2026-04-26T15:27:04Z
nyquist_compliant: true
manual_signoff_pending: true
---

# Phase 8 Verification

## Automated Test Suite

`pnpm -r test --run` — exited 0

**Aggregate totals across all packages:**

| Package | Test Files | Tests Passed | Tests Todo | Duration |
|---------|------------|--------------|------------|----------|
| @sms/shared | 8 | 140 | 0 | 0.43s |
| @sms/db | 1 | 6 | 0 | 5.30s |
| @sms/web | 18 | 119 | 13 | 5.57s |
| @sms/api | 38 | 413 | 13 | 10.43s |
| @sms/worker | 20 | 154 | 0 | 12.55s |
| **Total** | **85** | **832** | **26** | — |

<details>
<summary>Test output (tail — last 200 lines)</summary>

```
packages/api test: {"level":30,...,"name":"media-service","mediaId":"media-uuid-1","msg":"Image uploaded and processed"}
packages/api test: {"level":30,...,"name":"media-service","mediaId":"media-video-1","msg":"Video uploaded and transcode job enqueued"}
packages/api test: {"level":30,...,"name":"media-service","mediaId":"media-1","msg":"Transcode retry enqueued"}
packages/api test: {"level":30,...,"name":"post-service","postId":"00000000-0000-4000-8000-00000000bbbb","msg":"Post created"}
packages/api test: {"level":30,...,"name":"post-service","postId":"00000000-0000-4000-8000-00000000bbbb","msg":"Post updated"}
packages/api test:  Test Files  38 passed (38)
packages/api test:       Tests  413 passed | 13 todo (426)
packages/api test:    Start at  11:26:33
packages/api test:    Duration  10.43s
packages/api test: Done
packages/worker test: {"level":30,...,"name":"post-lifecycle","msg":"Publish lifecycle succeeded"}
packages/worker test: {"level":30,...,"name":"publish-worker","msg":"Publish succeeded"}
packages/worker test: {"level":40,...,"name":"publish-worker","errorCode":"auth_revoked","httpStatus":401,"msg":"Permanent failure — skipping retries"}
packages/worker test: {"level":30,...,"name":"post-lifecycle","msg":"Idempotent skip — post already has platform_post_id"}
packages/worker test: {"level":40,...,"name":"publish-worker","errorCode":"http_503","httpStatus":503,"msg":"Transient failure — will retry"}
packages/worker test: {"level":30,...,"name":"post-lifecycle","msg":"Publish lifecycle succeeded"}
packages/worker test: {"level":40,...,"name":"post-lifecycle","msg":"Budget exhausted at runtime — leaving post scheduled"}
packages/worker test: {"level":30,...,"name":"publish-worker","reason":"budget_exhausted","msg":"Graceful abort — scanner will re-evaluate"}
packages/worker test:  Test Files  20 passed (20)
packages/worker test:       Tests  154 passed (154)
packages/worker test:    Start at  11:26:33
packages/worker test:    Duration  12.55s
packages/worker test: Done

(Full log preserved at /tmp/phase8-final.log on the executor host; size ~456 KB. The
above tail trims pino-emitted JSON request/response noise but preserves the
per-package summary lines that matter for the green-suite gate.)
```

</details>

## Per-Requirement Verification

| Requirement | Test File | Status |
|-------------|-----------|--------|
| POST-LI-01 | packages/api/src/__tests__/posts-platform.test.ts | green |
| POST-LI-02 | packages/worker/src/__tests__/linkedin-publish.test.ts | green |
| POST-LI-03 | packages/web/src/__tests__/VisibilitySelector.test.tsx | green |
| POST-LI-04 | packages/shared/src/__tests__/platform-text-limits.test.ts | green |
| POST-LI-05 | packages/web/src/__tests__/LinkedInPreview.test.tsx | green |
| POST-FB-01 | packages/api/src/__tests__/posts-platform.test.ts | green |
| POST-FB-02 | packages/worker/src/__tests__/facebook-publish.test.ts | green |
| POST-FB-03 | packages/worker/src/__tests__/facebook-publish.test.ts | green |
| POST-FB-04 | packages/worker/src/__tests__/facebook-publish.test.ts | green |
| POST-FB-05 | packages/shared/src/__tests__/platform-text-limits.test.ts | green |
| POST-FB-06 | packages/web/src/__tests__/FacebookPreview.test.tsx | green |
| LIMIT-06 | packages/api/src/__tests__/rate-limit-platform.test.ts | green |
| LIMIT-07 | packages/api/src/__tests__/rate-limit-platform.test.ts | green |
| LIMIT-08 | packages/web/src/__tests__/RateLimitsCard.test.tsx | green |

## Suite-Level Notes

- **Web package now wired into root recursive test command.** Plan 08-07 Task 1 surfaced that `packages/web/package.json` had no `test` script, so `pnpm -r test --run` was silently skipping the web suite (Plans 05a / 05b verifications were running only via direct `vitest run` in those plans). Added `"test": "vitest"` to `packages/web/package.json` so the recursive command exercises every package the validation strategy enumerates. Tracked as Rule 2 deviation in the SUMMARY.
- **`pretest` builds prior to test run.** Root `package.json` declares `"pretest": "pnpm -r build"`. The recursive `test --run` invocation bypasses that hook (it runs the `test` script directly per package), so this verification reflects the test suite alone, not the build. Builds were exercised separately during prior plan executions and remain green.

## Manual Verifications Pending

The five manual verifications listed in 08-VALIDATION.md "Manual-Only Verifications" remain pending. They require:

1. Live LinkedIn sandbox publish (text-only + with image)
2. Live Facebook sandbox publish (multi-image + video)
3. LinkedIn preview fidelity side-by-side comparison
4. Facebook preview fidelity (image grid + +N overlay + video placeholder)
5. Rate-limit color band visual verification at 30% / 60% / 95% / red threshold

See Task 2 (`checkpoint:human-verify`) in `08-07-integration-verification-PLAN.md` for the operator walkthrough. Once approved, Task 3 will flip `manual_signoff_pending` to `false`, set `08-VALIDATION.md` `nyquist_compliant: true` and `wave_0_complete: true`, and commit the close-out.
