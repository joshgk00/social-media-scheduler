# Shared Package Standards

## Purpose

Home for patterns used by 2+ packages. Confirm multi-consumer need before adding — single-consumer utilities stay in their package.

## Crypto

- Validate all inputs before crypto calls (format, length, hex charset)
- Wrap `crypto.*` in try-catch, rethrow with application context
- Never expose raw OpenSSL errors to callers
- Test: round-trip, tamper detection (ciphertext/IV/authTag), IV uniqueness, key validation boundaries (off-by-one, invalid chars, empty)

## Utilities

- Validation functions: test all boundaries (exact limits, off-by-one, invalid format, empty)
- `requireEnv()`: throw naming the missing variable
- Logger factory: consistent config across all consumers

## Exports

- All public symbols re-exported from `src/index.ts`
- Minimal public API — no internal helpers exported
