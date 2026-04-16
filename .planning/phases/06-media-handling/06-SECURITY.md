---
phase: 06-media-handling
asvs_level: 1
audited: 2026-04-16
block_on: critical
---

# Security Audit — Phase 06: Media Handling

**Threats Closed:** 14/20
**Threats Accepted (logged below):** 6/20
**Open Threats:** 0
**ASVS Level:** 1

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-06-01 | Tampering | mitigate | CLOSED | `local-storage.ts:57-63` — `resolveAndGuard()` calls `path.resolve(rootDir, key)` then asserts `startsWith(rootDir + path.sep)` on every storage operation |
| T-06-02 | Info Disclosure | accept | CLOSED | Logged in accepted risks section below |
| T-06-03 | DoS | accept | CLOSED | Logged in accepted risks section below |
| T-06-04 | Tampering | mitigate | CLOSED | `media-upload.ts:9-13` — MIME union filter at multer layer; `media.ts:54-91` — per-platform `allowedImageTypes`/`allowedVideoTypes` check before processing |
| T-06-05 | DoS | mitigate | CLOSED | `media-upload.ts:28` — 100MB absolute `fileSize` limit; `media.ts:63-90` — per-platform size cap with 400 rejection and clear message |
| T-06-06 | Tampering | mitigate | CLOSED | `media.ts:94-117` — `file.originalname` stored as metadata only; storage key generated as UUID in `processImageUpload`/`processVideoUpload`; `local-storage.ts:57-63` provides downstream traversal guard |
| T-06-07 | EoP | mitigate | CLOSED | `media.ts:33,120,132,147` — all four routes include `requireAuth`; global `doubleCsrfProtection` applied at `app.ts:74` covers POST/DELETE |
| T-06-08 | Info Disclosure | accept | CLOSED | Logged in accepted risks section below |
| T-06-09 | Tampering | mitigate | CLOSED | `transcode.service.ts:17-29` — ffmpeg arguments constructed as array; `spawn('ffmpeg', args)` never uses shell string interpolation |
| T-06-10 | DoS | mitigate | CLOSED | `transcode-worker.ts:51` — Worker `concurrency: 1`; `transcode.service.ts:33-38` — `setTimeout(300_000)` calls `proc.kill('SIGKILL')`; `isSettled` flag prevents double-resolution |
| T-06-11 | Tampering | mitigate | CLOSED | `post-lifecycle.service.ts:173-190` — inside publish transaction, counts `post_media WHERE transcodeStatus IN ('pending','processing') AND deletedAt IS NULL`; throws `PostLifecycleAbort('media_pending')` when count > 0 |
| T-06-12 | DoS | mitigate | CLOSED | `transcode-worker.ts:115-116` — `finally` block calls `unlink(inputPath)` and `unlink(outputPath)` with `.catch(() => {})` for ENOENT tolerance |
| T-06-13 | Spoofing | mitigate | CLOSED | `use-media-upload.ts:25-26` — XHR sets `x-csrf-token` header and `withCredentials = true`; server `doubleCsrfProtection` middleware validates both cookie and header |
| T-06-14 | Tampering | accept | CLOSED | Logged in accepted risks section below |
| T-06-15 | Info Disclosure | accept | CLOSED | Logged in accepted risks section below |
| T-06-16 | DoS | mitigate | CLOSED | `media-cleanup-worker.ts:37` — 30-day grace period for soft-deleted files; `media-cleanup-worker.ts:74` — 24-hour grace for orphaned uploads; active files not eligible for either pass |
| T-06-17 | Info Disclosure | accept | CLOSED | Logged in accepted risks section below |
| T-06-18 | Tampering | mitigate | CLOSED | `settings.ts:286-295` — Drizzle `sql` template literal with no user-supplied values; all filter logic uses SQL literals (`LIKE 'image/%'`), not interpolated strings |
| T-06-19 | DoS | mitigate | CLOSED | `media.ts:132` — `requireAuth` on retry route; `retryTranscode` service validates `transcodeStatus === 'failed'` before enqueue, returns 404 otherwise |
| T-06-06-01 | Tampering | accept | CLOSED | Logged in accepted risks section below |

---

## Accepted Risks Log

All six accepted threats apply to this single-user, self-hosted application where the operator and the user are the same person.

| Threat ID | Risk | Justification | Review Trigger |
|-----------|------|---------------|----------------|
| T-06-02 | S3Storage.getUrl() returns direct S3 object URLs without presigned expiry | Single-user app; no public access expected; bucket ACLs are admin-controlled. Presigned URLs add complexity with no practical privacy gain for private self-hosted storage. | If storage backend is changed to a shared or public bucket |
| T-06-03 | S3_ENDPOINT misconfiguration could cause upload failures or unintended routing | S3_ENDPOINT is admin-set via env var on trusted infrastructure. Misconfiguration produces upload errors, not a security breach. No user-supplied input reaches this code path. | If multi-tenant support is added |
| T-06-08 | Media file URLs are guessable to anyone with read access to the server | UUIDs in all paths provide sufficient unpredictability for a single-user app. No sensitive PII or credentials stored as media. | If multi-user support is added or media is classified as sensitive |
| T-06-14 | Client-side upload validation can be bypassed by crafting a direct HTTP request | Client validation is intentional UX convenience only. Server enforces authoritative limits in `media.ts` route handler (T-06-04, T-06-05) regardless of what the client sends. | Never — by design |
| T-06-15 | Thumbnail URLs at `/media/...` paths are accessible to anyone who can reach the server | Single-user self-hosted app with no public network exposure expected. UUIDs in thumbnail paths provide unpredictability. | If app is exposed publicly or multi-user support is added |
| T-06-17 | GET /api/settings/storage exposes file counts and aggregate sizes | User's own data in a single-user app. Endpoint requires authentication. No cross-user data leakage possible. | If multi-tenant support is added |
| T-06-06-01 | Migration SQL file could be tampered with before deployment | File generated by drizzle-kit from version-controlled TypeScript schema. Committed to git with full history. No manual SQL editing. Tampering requires git history rewrite or direct filesystem access — equivalent to full system compromise. | Before any production deployment, verify `git log --follow` hash matches expected |

---

## Unregistered Threat Flags

No unregistered threat flags were present in any `## Threat Flags` section across the six SUMMARY files for this phase.

---

## Notes

- CSRF coverage for media routes is via the global `doubleCsrfProtection` middleware mounted at `app.ts:74`. The media router does not apply CSRF middleware independently, which is consistent with all other authenticated routes in this application.
- The T-06-07 plan description says "CSRF token required on POST/DELETE" — this is satisfied by the global middleware, not route-level middleware.
- T-06-12 temp file cleanup uses `.catch(() => {})` rather than logging ENOENT. This is acceptable since the worker also logs on job failure and the cleanup is best-effort; the orphan cleanup job (T-06-16) handles any leaked files.
