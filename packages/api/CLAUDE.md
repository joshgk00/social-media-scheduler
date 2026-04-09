# API Package Standards

## Express Middleware

- Catch-all 404 handler returning JSON — between routes and error handler
- Error handler: differentiate known types (`SyntaxError` → 400) before defaulting to 500
- Production error responses: generic messages only, no stack traces
- `express.json()`: explicit `limit` (e.g., `'1mb'`)

## Health Checks

- Independent checks run in parallel via `Promise.all()`
- Timeout protection via `Promise.race()` (~5s limit)
- No internal error messages in production responses
- Test all states: healthy, timed out, errored, stale, missing

## Request Handling

- Validate `x-request-id` format/length before trusting
- Logging via `pino-http` with correlation ID in child logger context

## Shutdown

- `redis.quit()` (waits for pending) not `redis.disconnect()` (drops)
- Log each cleanup step for operator visibility

## Redis

- `redis.on('error')` immediately after instantiation — unhandled events crash the process
- Health checks use the application Redis instance, not a separate connection

## Security

- Rate-limit all credential-changing endpoints (password, 2FA, recovery) — session auth alone is insufficient
- User/email lookups: constant-time responses to prevent enumeration (same query path or ~100ms floor)
- Redirect URLs from query params: only relative paths starting with `/` but not `//`, default to `/`
- `path.resolve()` on DB/user paths: verify `resolvedPath.startsWith(rootPath + path.sep)`
- CSRF: handle anonymous sessions via `req.session?.id ?? 'anonymous'` fallback
- Destroy current session before bulk `invalidateAllSessions()` to prevent orphans

## Naming

- DB client: `pgClient` not `sql`. Health results: `healthChecks` not `checks`
- Response booleans: consistent pattern (all `.ok`)
- Verification results: `isPasswordValid` not `valid`
- Params: `userInput`, `profilePatch` — never bare `data`
- Query results: `userRow`, `sessionRows` — never bare `result`
- Counters include subject: `sessionCount` not `count`
- Crypto/TOTP returns: domain terms (`validationOffset` not `delta`)
