# Security Policy

## Reporting a Vulnerability

This is a self-hosted single-user application. If you find a security issue, open a GitHub issue with the label `security` or contact the repository owner directly.

## Sensitive Credentials

### OAuth Tokens

All Twitter, LinkedIn, and Facebook OAuth tokens are encrypted at rest using AES-256-GCM with a key supplied via the `ENCRYPTION_KEY` environment variable. The key is never persisted to the database, source control, Redis, or logs. See `packages/shared/src/encryption/` for the implementation.

### Session Cookies

Sessions use HTTP-only Secure cookies with `SameSite=Strict`. Session storage is Redis-backed via `connect-redis`. CSRF protection is enforced on all state-changing requests via the `csrf-csrf` Double Submit Cookie pattern.

## OpenAI API Key Handling (SEC-07)

The OpenAI API key used by future AI generation features follows a strict per-request handling policy:

1. **Per-request only.** The key is supplied in the request body of a single AI endpoint call. It is never read from environment variables on the server, and there is no persistent key store.
2. **Never persisted.** The key is never written to the database, Redis, BullMQ job payloads, files on disk, or any audit trail.
3. **Never logged.** The Pino logger config in `packages/shared/src/logger.ts` redacts the keys `openai_api_key`, `openaiApiKey`, and `OPENAI_API_KEY` before serialization. Request-body paths and nested object variants are covered by the redaction rules.
4. **Never queued.** A static Vitest contract test at `packages/api/src/__tests__/sec-07-job-schema.test.ts` enumerates BullMQ job-data Zod schemas and fails if any schema field name matches `/openai|api[_-]?key/i`.
5. **Per-call lifetime.** The key lives only on the call stack of the AI generation handler: read from `req.body`, passed to the OpenAI client, and discarded when the function returns. No caching and no retained closures.

This policy is enforced by:

- The redaction config at `packages/shared/src/logger.ts` (`DEFAULT_REDACT.paths`).
- The contract test at `packages/api/src/__tests__/sec-07-job-schema.test.ts`.
- The unit tests at `packages/api/src/__tests__/logger.test.ts` covering the supported key-name variants and nested-object redaction behavior.

Phase 11 ships these guardrails ahead of any AI feature so Phase 12 inherits the policy by default.

## Encryption Key Rotation

The `ENCRYPTION_KEY` rotates without user re-authentication via the `token_encryption_version` column on the `social_profiles` table. The migration runs decrypt-with-old, re-encrypt-with-new in batches; see `packages/api/src/services/oauth.service.ts`.
