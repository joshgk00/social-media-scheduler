# TokenVault — typed Credentials bag, dispatcher unseals

OAuth credentials for every connected Social Profile are stored encrypted in `social_profiles` cipher columns. Before this candidate, every cipher-handling callsite (six of them across api/worker) reached into those columns directly, read `process.env.ENCRYPTION_KEY` at function scope, called `decrypt()` per field, and used the plaintext inline — with identical "no caching, no logging, function-scope plaintext" doc comments in each file. The discipline was real, but enforced by review, not by the type system.

This ADR records two coupled decisions:

1. **Typed `Credentials` discriminated union, not a capability-per-call pattern.** `TokenVault.unsealForProfile(profile)` returns `{ kind: 'twitter', consumerKey, consumerSecret, accessToken, accessTokenSecret } | { kind: 'oauth2', accessToken }`. Callers narrow on `kind` and use the plaintext fields directly. We rejected a `withCredentials(profile, cb)` capability that zeroes the buffer after the callback returns — the discipline it adds (no accidental retention) is real, but the existing code is already function-scope and review-enforced, and the capability pattern's verbosity penalty hits every callsite forever.
2. **The dispatcher unseals; Publishers receive plaintext.** In `publish-worker.ts`'s dispatch site (the `publishers[platform].publish(...)` line introduced in Candidate 1 R1.4), the worker computes `Credentials` via `vault.unsealForProfile(fullProfile)` and a `SafeProfile` projection (cipher fields stripped) and passes both to the Publisher. Publishers never see cipher fields and don't import the vault. We rejected having each Publisher import a `TokenVault` dep and call `vault.unsealTwitter(profile)` itself — the per-Publisher control is fictitious here (there's nothing for Publishers to decide), and pushing the vault into every Publisher's import surface enlarges what each Publisher must know about.

Together these decisions mean: cipher fields exist on `socialProfiles.$inferSelect` rows but only flow into the vault. Publishers, twitter-delete, and any future platform-call modules receive pre-unsealed `Credentials` typed exactly for what they need.

## Considered Options

- **Typed `Credentials` bag + dispatcher unseals** *(chosen)* — Single dispatch site owns the unseal; Publishers stay platform-blind to credentials shape; least-privilege by interface.
- **Capability-per-call (`withCredentials(profile, cb)`)** — Strongest discipline; rejected because the existing function-scope-plaintext discipline is already documented and reviewed, and the capability pattern's per-callsite verbosity buys little additional safety in a single-developer codebase.
- **Generic `Record<string, string>` of decrypted fields** — Loses platform shape; rejected for the same reason `Pattern X` won in the Publisher seam (we know the shapes, encode them).
- **Vault-as-dep injected into each Publisher** — Per-Publisher control but enlarges the Publisher interface contract; rejected for least-privilege reasons and to keep the Publisher seam narrow (Candidate 1).
- **Just consolidate cipher-reading into a shared helper, no vault interface** — Smallest change; rejected because it leaves the cipher fields visible to every caller — the boundary doesn't move, only the duplication.

## Consequences

- The `Credentials` discriminator forces each Publisher (and twitter-delete) to do a one-line narrow: `if (credentials.kind !== 'twitter') throw new Error(...)`. This is an unsafe boundary that the dispatcher always guarantees correctly — small cost for a much smaller surface.
- `process.env.ENCRYPTION_KEY` is read exactly once per process, inside `main()`, when the vault is constructed via `createTokenVault(validateEncryptionKey(rawKey))`. The "read env inside function" pattern duplicated across six files is eliminated.
- The vault is shared between api and worker (lives in `@sms/shared/tokens/`). Both packages construct one at startup and inject it where needed.
- ADR-0002 (which staged the cipher-field-leakage deferral) is superseded by this ADR on R3.6 merge.
- Token rotation (PRD requirement) becomes a one-place change inside the vault — `token_encryption_version` discriminates which key to use during unseal.
