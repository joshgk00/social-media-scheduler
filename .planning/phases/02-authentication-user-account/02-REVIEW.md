---
phase: 02-authentication-user-account
reviewed: 2026-04-08T00:00:00Z
depth: standard
files_reviewed: 43
files_reviewed_list:
  - packages/api/src/app.ts
  - packages/api/src/index.ts
  - packages/api/src/middleware/auth-guard.ts
  - packages/api/src/middleware/csrf.ts
  - packages/api/src/middleware/rate-limiter.ts
  - packages/api/src/middleware/session.ts
  - packages/api/src/routes/auth.ts
  - packages/api/src/routes/recovery.ts
  - packages/api/src/routes/settings.ts
  - packages/api/src/routes/setup.ts
  - packages/api/src/services/auth.service.ts
  - packages/api/src/services/session.service.ts
  - packages/api/src/services/totp.service.ts
  - packages/db/src/client.ts
  - packages/db/src/schema/index.ts
  - packages/db/src/schema/security-questions.ts
  - packages/db/src/schema/users.ts
  - packages/shared/src/constants/date-formats.ts
  - packages/shared/src/constants/security-questions.ts
  - packages/shared/src/index.ts
  - packages/shared/src/schemas/auth.ts
  - packages/shared/src/schemas/recovery.ts
  - packages/shared/src/schemas/settings.ts
  - packages/web/src/App.tsx
  - packages/web/src/components/ProtectedRoute.tsx
  - packages/web/src/components/SetupGuard.tsx
  - packages/web/src/hooks/use-auth.ts
  - packages/web/src/hooks/use-settings.ts
  - packages/web/src/lib/api-client.ts
  - packages/web/src/lib/query-client.ts
  - packages/web/src/main.tsx
  - packages/web/src/pages/login/LoginPage.tsx
  - packages/web/src/pages/recover/RecoverPage.tsx
  - packages/web/src/pages/settings/SettingsPage.tsx
  - packages/web/src/pages/settings/components/ChangePasswordModal.tsx
  - packages/web/src/pages/settings/components/PreferencesSection.tsx
  - packages/web/src/pages/settings/components/ProfileSection.tsx
  - packages/web/src/pages/settings/components/SecurityQuestionsModal.tsx
  - packages/web/src/pages/settings/components/SecuritySection.tsx
  - packages/web/src/pages/settings/components/TwoFactorDisableModal.tsx
  - packages/web/src/pages/settings/components/TwoFactorSetupModal.tsx
  - packages/web/src/pages/setup/SetupPage.tsx
  - packages/web/src/store/auth-store.ts
findings:
  critical: 5
  warning: 8
  info: 6
  total: 19
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-08
**Depth:** standard
**Files Reviewed:** 43
**Status:** issues_found

## Summary

This phase covers the full authentication and user-account stack: session management, login with optional TOTP, account recovery via security questions, and user settings (profile, preferences, password, 2FA, security questions, avatar upload). The implementation is generally well-structured with correct session fixation prevention, argon2id password hashing, and CSRF double-submit protection. However, five critical issues require attention before this goes to production.

The most serious problems are: an open-redirect vulnerability via the `redirect` query parameter, missing rate limiting on the password-reset endpoint, a path traversal risk in the old-avatar cleanup path, and two security questions issues (a timing difference that leaks whether an email is registered, and missing rate-limiting on the reset step). Several warnings cover logic gaps and convention violations from the project's own CLAUDE.md rules.

---

## Critical Issues

### CR-01: Open redirect via unvalidated `redirect` query parameter

**File:** `packages/web/src/pages/login/LoginPage.tsx:49-51` and `packages/web/src/store/auth-store.ts:10`

**Issue:** The `redirect` search param is captured verbatim from the URL and stored in Zustand, then used as the navigation target after login (`navigate(target)`). Any external URL (e.g. `/login?redirect=https://evil.com`) causes the browser to navigate off-site after a successful login, enabling phishing attacks.

**Fix:**
```typescript
// In LoginPage.tsx, validate before storing
useEffect(() => {
  const redirect = searchParams.get('redirect');
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    setRedirectAfterLogin(redirect);
  }
}, [searchParams, setRedirectAfterLogin]);
```
Only accept paths that start with `/` but not `//` (protocol-relative URLs). Reject anything else silently and fall back to `/`.

---

### CR-02: `POST /api/auth/recover/reset-password` has no rate limiter

**File:** `packages/api/src/routes/recovery.ts:108`

**Issue:** The first two recovery steps apply `recoveryLimiter` (5 attempts / 15 min). The reset-password step at line 108 applies no rate limiter at all. An attacker who has already passed the session-cookie check can hammer this endpoint. While the session state provides some protection, the absence of a rate limiter on a password-setting endpoint is a policy gap.

**Fix:**
```typescript
router.post('/api/auth/recover/reset-password', recoveryLimiter, async (req, res) => {
```

---

### CR-03: Old avatar path traversal when cleaning up previous profile image

**File:** `packages/api/src/routes/settings.ts:332-338`

**Issue:** `user.profileImagePath` is read from the database and joined directly to `MEDIA_DIR`:

```typescript
const oldPath = path.join(MEDIA_DIR, user.profileImagePath);
await unlink(oldPath);
```

`profileImagePath` is stored as `/avatars/<filename>`. If a corrupted or manually-altered DB value contains `../../etc/passwd`, `path.join` resolves it outside `MEDIA_DIR`. While exploitation requires a compromised DB row, defense-in-depth requires validating that the resolved path stays within the expected directory.

**Fix:**
```typescript
if (user?.profileImagePath) {
  const oldPath = path.resolve(MEDIA_DIR, user.profileImagePath);
  const mediaRoot = path.resolve(MEDIA_DIR);
  if (oldPath.startsWith(mediaRoot + path.sep)) {
    try { await unlink(oldPath); } catch { /* already deleted */ }
  }
}
```

---

### CR-04: `verify-email` response leaks whether an email is registered (timing side-channel)

**File:** `packages/api/src/routes/recovery.ts:23-51`

**Issue:** When the email is not found the route returns immediately with `{ questionsConfigured: false }`. When the email is found but has no questions it still returns quickly. When the email is found and has questions it performs a database query for the questions before responding. This difference in response time lets an attacker enumerate whether an email is registered. The current code returns the same JSON body for "not found" and "no questions", which is good for the body — but the latency difference between a fast path (no DB hit) and a slow path (secondary DB query) is observable.

**Fix:** Always perform the questions query regardless, using a dummy ID when the user is not found, or introduce a fixed-time constant delay. The simpler option:

```typescript
const user = await findUserByEmail(db, email);
const userId = user?.id ?? '00000000-0000-0000-0000-000000000000';

const questions = await db.select().from(securityQuestions).where(
  eq(securityQuestions.userId, userId),
);

if (!user || questions.length === 0) {
  res.json({ questionsConfigured: false });
  return;
}
// ...
```

---

### CR-05: `express.json()` has no payload size limit

**File:** `packages/api/src/app.ts:33`

**Issue:** `app.use(express.json())` is called without an explicit `limit`. The project's own API package CLAUDE.md states: "`express.json()` must specify an explicit `limit` (e.g., `'1mb'`) to prevent payload abuse." Without a limit, the default is 100kb in Express 5 (technically inherited from `body-parser`), but this is undocumented behavior and could vary.

**Fix:**
```typescript
app.use(express.json({ limit: '1mb' }));
```

---

## Warnings

### WR-01: `securityQuestionsSchema` is in `recovery.ts` but exported from `shared/src/schemas/recovery.ts`

**File:** `packages/shared/src/schemas/recovery.ts:20-28`

**Issue:** `securityQuestionsSchema` is logically a settings schema (it validates the PUT `/api/settings/security-questions` body), but it lives in `recovery.ts` and is imported by the settings route. The naming and file placement will cause confusion — a future developer will look in `settings.ts` for it and not find it. Both `settings.ts` and `recovery.ts` in `shared` import/export it.

**Fix:** Move `securityQuestionsSchema` and its type to `packages/shared/src/schemas/settings.ts` to match where it is actually used.

---

### WR-02: `invalidateAllSessions` deletes the session of the user currently resetting their password

**File:** `packages/api/src/routes/recovery.ts:154`

**Issue:** After a password reset, `invalidateAllSessions(redis)` deletes every session key matching `sms:sess:*`. This includes the current anonymous/recovery session. That is likely intentional, but the response is still sent after the deletion (`res.json({ success: true })`), which works because session data was already read. However, the express-session `rolling: true` option will try to save the session after the response, causing a write to Redis for a key that was just deleted. In practice this re-creates an orphaned recovery session with no state, which could be reused to call the endpoint again within the same session lifetime.

**Fix:** Destroy the session explicitly before (or instead of) invalidating all sessions:
```typescript
await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
await invalidateAllSessions(redis);
res.json({ success: true });
```

---

### WR-03: `updateLastLogin` fire-and-forget swallows errors silently

**File:** `packages/api/src/routes/auth.ts:74` and `auth.ts:119`

**Issue:** `updateLastLogin(db, user.id).catch(() => {})` intentionally discards errors. The API package CLAUDE.md states: "Background operations that intentionally skip `await` must have `.catch()` with logging." The empty catch swallows DB errors without any trace in the log.

**Fix:**
```typescript
updateLastLogin(db, user.id).catch((err) => logger.warn({ err }, 'Failed to update last login'));
```
`logger` would need to be imported from the logger middleware.

---

### WR-04: `db/src/client.ts` exports `sql` instead of `pgClient`

**File:** `packages/db/src/client.ts:11-13`

**Issue:** The DB package CLAUDE.md states "The database client export should be named `pgClient` or `db`, not `sql`." The function returns `{ db, sql }` and the caller in `index.ts` destructures it as `{ sql, db }`. The variable `sql` (a raw postgres client) is then passed to `createApp` and on to the health check router. This violates the naming convention documented for this package.

**Fix:** Rename the postgres client variable to `pgClient` in the return value and update callers:
```typescript
// client.ts
return { db, pgClient: sql };

// index.ts
const { pgClient, db } = createDbClient(DATABASE_URL);
const app = createApp({ redis, pgClient, db, sessionSecret: SESSION_SECRET });
```

---

### WR-05: `recoveryVerifyAnswersSchema` includes an `email` field that the route ignores

**File:** `packages/shared/src/schemas/recovery.ts:7-10` and `packages/api/src/routes/recovery.ts:54-80`

**Issue:** The schema validates `email` in the POST body, but the route ignores `parsed.data.email` entirely — it reads the email from `req.session.recoveryEmail` instead. The schema field is dead code and adds confusion about how the endpoint works. Including the email in the body could mislead future developers into thinking it's used for lookup.

**Fix:** Remove the `email` field from `recoveryVerifyAnswersSchema`:
```typescript
export const recoveryVerifyAnswersSchema = z.object({
  answers: z.array(z.string().min(1, 'Answer required')).length(3, 'All 3 answers required'),
});
```

---

### WR-06: Security questions insert is not atomic — partial write on failure

**File:** `packages/api/src/routes/settings.ts:266-283`

**Issue:** The route deletes all existing security questions first, then inserts new ones in a loop with individual `await` calls. If any insert fails mid-loop (e.g., a DB constraint violation), the existing questions are already deleted and only some new ones are written. The user is left with fewer than 3 questions, breaking account recovery.

**Fix:** Wrap the delete and inserts in a transaction:
```typescript
await db.transaction(async (tx) => {
  await tx.delete(securityQuestions).where(eq(securityQuestions.userId, req.session.userId!));
  for (const q of questions) {
    const normalizedAnswer = q.answer.toLowerCase().trim();
    const answerHash = await argon2.hash(normalizedAnswer, { type: argon2.argon2id });
    await tx.insert(securityQuestions).values({
      userId: req.session.userId!,
      questionIndex: q.questionIndex,
      answerHash,
    });
  }
});
```

---

### WR-07: DB connection pool has no explicit `max` connections

**File:** `packages/db/src/client.ts:11`

**Issue:** `postgres(databaseUrl)` uses the driver's default pool size (10). The DB package CLAUDE.md states "All connection pools must explicitly specify `max` connections — never rely on driver defaults." The migration client (if separate) should also use `max: 1`.

**Fix:**
```typescript
const sql = postgres(databaseUrl, { max: 10 });
```

---

### WR-08: `ProfileSection` constructs the avatar URL by prepending `/avatars/` to a path that already contains `/avatars/`

**File:** `packages/web/src/pages/settings/components/ProfileSection.tsx:80`

**Issue:** The API stores `profileImagePath` as `/avatars/<filename>` (set on line 354 of settings.ts). The frontend then constructs:

```typescript
const avatarSrc = previewUrl ?? (user.profileImagePath ? `/avatars/${user.profileImagePath}` : undefined);
```

This produces `/avatars//avatars/filename.webp` — a broken URL. The `/avatars` static route serves from `MEDIA_DIR/avatars`, so the path stored in DB (`/avatars/filename.webp`) is already the correct public path.

**Fix:**
```typescript
const avatarSrc = previewUrl ?? user.profileImagePath ?? undefined;
```

---

## Info

### IN-01: `CSRF_SECRET` read at module evaluation time inside the factory function

**File:** `packages/api/src/middleware/csrf.ts:7`

**Issue:** `getSecret: () => process.env.CSRF_SECRET!` reads the env var lazily at request time, which is correct. However, the `doubleCsrf()` factory is called at module load time (before `requireEnv` runs in `index.ts`). This means if `CSRF_SECRET` is not set, the error will surface at the first CSRF validation rather than at startup. The non-null assertion (`!`) silently passes `undefined` as a string until then.

`requireEnv('CSRF_SECRET')` is already called in `index.ts:10`, so startup will fail fast in practice. This is acceptable but worth noting for test environments where `index.ts` is not the entry point.

---

### IN-02: `recoveryLimiter` and `loginLimiter` are identical — could be one export

**File:** `packages/api/src/middleware/rate-limiter.ts:4-20`

**Issue:** Both limiters use the same window, max count, headers config, and `skipSuccessfulRequests`. They differ only in name. This is not a bug, but maintaining two identical configurations creates a drift risk.

**Fix:** Export one limiter or use a factory function if the intent is to allow them to diverge in the future.

---

### IN-03: `preferencesUpdateSchema` does not validate `dateFormat` against the known list

**File:** `packages/shared/src/schemas/settings.ts:10-14`

**Issue:** `dateFormat: z.string().min(1)` accepts any non-empty string. The `DATE_FORMATS` constant defines the allowed values. An arbitrary string could be stored and later used unsafely in a formatting context.

**Fix:**
```typescript
import { DATE_FORMATS } from '../constants/date-formats.js';
const DATE_FORMAT_VALUES = DATE_FORMATS.map(f => f.value) as [string, ...string[]];

dateFormat: z.enum(DATE_FORMAT_VALUES),
```

---

### IN-04: `preferencesUpdateSchema` does not validate `timezone` against the IANA list

**File:** `packages/shared/src/schemas/settings.ts:11`

**Issue:** `timezone: z.string().min(1)` accepts any non-empty string. A server-side check against `Intl.supportedValuesOf('timeZone')` (or a static allowlist) would prevent invalid timezone strings from being stored and later causing silent formatting failures with Luxon.

---

### IN-05: Commented-out `// eslint-disable-line react-hooks/exhaustive-deps` suppressions

**File:** `packages/web/src/pages/settings/components/SecurityQuestionsModal.tsx:70` and `packages/web/src/pages/settings/components/TwoFactorSetupModal.tsx:49`

**Issue:** Both files suppress the exhaustive-deps rule. The `useEffect` in `SecurityQuestionsModal` omits `form` from the dependency array — this is intentional (calling `form.reset` on every `form` reference change would loop). The `TwoFactorSetupModal` effect omits `setup2FA` and `onOpenChange`. While the suppression is likely deliberate to avoid infinite loops, the intent should be documented per CLAUDE.md's "comments explain WHY, not WHAT" rule.

---

### IN-06: `securityQuestionsSchema` exported from `shared/src/schemas/recovery.ts` but imported in settings route

**File:** `packages/api/src/routes/settings.ts:16` and `packages/shared/src/schemas/recovery.ts:20`

**Issue:** This is a duplication of WR-01 at the info level — the import works because `@sms/shared` re-exports everything via `export * from './schemas/recovery.js'`, but the logical grouping is wrong. A developer looking for security-question validation would first check `settings.ts`, not `recovery.ts`.

---

_Reviewed: 2026-04-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
