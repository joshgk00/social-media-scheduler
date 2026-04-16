---
phase: 06
slug: media-handling
status: compliant
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-14
audited: 2026-04-16
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/api/vitest.config.ts`, `packages/web/vitest.config.ts`, `packages/worker/vitest.config.ts`, `packages/shared/vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npm run test --workspaces` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npm run test --workspaces`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | MEDIA-07 | T-06-01 | StorageBackend rejects path traversal | unit | `pnpm --filter @sms/shared exec npx vitest run src/__tests__/storage.test.ts` | ✅ | ✅ green |
| 06-01-02 | 01 | 1 | MEDIA-01 | — | N/A | unit | `pnpm --filter @sms/api exec npx vitest run src/__tests__/services/media.test.ts` | ✅ | ✅ green |
| 06-02-01 | 02 | 1 | MEDIA-02, MEDIA-03 | T-06-02 | Multer rejects oversized/wrong-type files | integration | `pnpm --filter @sms/api exec npx vitest run src/__tests__/routes/media.test.ts` | ✅ | ✅ green |
| 06-03-01 | 03 | 2 | MEDIA-04 | — | N/A | unit | `pnpm --filter @sms/worker exec npx vitest run src/__tests__/transcode.test.ts` | ✅ | ✅ green |
| 06-03-02 | 03 | 2 | MEDIA-05 | — | Publish worker skips pending media | unit | `pnpm --filter @sms/worker exec npx vitest run src/__tests__/post-lifecycle.test.ts` | ✅ | ✅ green |
| 06-04-01 | 04 | 2 | MEDIA-06 | — | N/A | unit | `pnpm --filter @sms/web exec npx vitest run src/hooks/__tests__/use-media-upload.test.ts src/hooks/__tests__/use-media.test.ts` | ✅ | ✅ green |
| 06-05-01 | 05 | 3 | MEDIA-08 | — | N/A | unit | `pnpm --filter @sms/worker exec npx vitest run src/__tests__/media-cleanup.test.ts` | ✅ | ✅ green |
| 06-05-02 | 05 | 3 | MEDIA-09 | — | N/A | unit | `pnpm --filter @sms/api exec npx vitest run src/__tests__/routes/settings.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Test Coverage Summary

| Package | Test File | Tests | Result |
|---------|-----------|-------|--------|
| @sms/shared | `src/__tests__/storage.test.ts` | 19 | ✅ pass |
| @sms/api | `src/__tests__/services/media.test.ts` | 18 | ✅ pass |
| @sms/api | `src/__tests__/routes/media.test.ts` | 9 | ✅ pass |
| @sms/api | `src/__tests__/routes/settings.test.ts` | 3 | ✅ pass |
| @sms/worker | `src/__tests__/transcode.test.ts` | 8 | ✅ pass |
| @sms/worker | `src/__tests__/post-lifecycle.test.ts` | 15 | ✅ pass |
| @sms/worker | `src/__tests__/media-cleanup.test.ts` | 7 | ✅ pass |
| @sms/web | `src/hooks/__tests__/use-media-upload.test.ts` | 5 | ✅ pass |
| @sms/web | `src/hooks/__tests__/use-media.test.ts` | 5 | ✅ pass |
| **Total** | **9 test files** | **89** | **✅ all pass** |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. All tests were created during plan execution (Plans 01-05) using the pre-existing vitest framework across all four packages.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-and-drop reorder in post form | MEDIA-01 | Browser interaction required | Upload 3 images, drag to reorder, verify sortOrder updates |
| Video transcoding progress UI | MEDIA-04 | Visual polling state | Upload video, observe spinner and status transitions |
| Storage usage card display | MEDIA-09 | Visual layout verification | Upload media, navigate to settings, verify card shows correct totals |
| End-to-end upload pipeline | MEDIA-01 thru MEDIA-09 | Requires running dev environment | Full `docker compose up`, upload image+video, verify transcoding, check cleanup |

---

## Validation Sign-Off

- [x] All tasks have automated verification
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 not needed — tests created during execution
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** compliant 2026-04-16

---

## Validation Audit 2026-04-16

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 8 verification map entries resolved to COVERED status. 89 tests across 9 test files in 4 packages, all passing green. The original VALIDATION.md was created pre-execution with Wave 0 stubs; all stubs were superseded by real test implementations during Plans 01-05. No auditor agent spawn was needed.
