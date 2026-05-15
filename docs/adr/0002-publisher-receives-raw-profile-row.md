# Publisher receives the raw Social Profile row, including cipher fields

Each **Publisher** needs OAuth credentials to call its platform's API. The deepened Publisher interface accepts the raw `socialProfiles.$inferSelect` row, and each Publisher decrypts the cipher fields it cares about (Twitter: four OAuth 1.0a cipher pairs; LinkedIn and Facebook: one OAuth 2.0 cipher triple). The cipher fields remain visible to Publishers — there is no `TokenVault` abstraction yet.

This is a deliberately staged refactor. A separate identified candidate — "no TokenVault; cipher fields leak through the Social Profile interface" — closes this boundary by returning either a safe DTO or a decrypted-credential capability instead of the raw row. We did not bundle the two candidates because the Publisher-seam refactor already touches the worker dispatcher, the Post Lifecycle's publish callback, and 10+ test files; folding in TokenVault would double the blast radius and delay the locality win from collapsing the parallel platform switches.

## Considered Options

- **Pass the raw row** *(chosen)* — Smallest blast radius for this refactor. Keeps the TokenVault decision separate and reviewable on its own merits.
- **Decrypt before the Publisher receives the row** — Cleanest seam, but couples two candidates into one PR. The decryption-discipline comments in each Publisher would migrate to one place — a real win, but not at the cost of bundling.
- **Pass a `TokenVault` capability object alongside the row** — Hybrid. Defers the question of "what does the safe profile DTO look like" without solving it. Adds a second parameter that callers must construct.

## Consequences

- Token-handling code is still duplicated across the three Publishers in `packages/worker/src/{twitter,linkedin,facebook}-publish.service.ts`. Acceptable for this round.
- The next architectural review pass should land TokenVault, at which point this ADR is superseded.
- Cipher-field discipline (no caching, no logging, function-scope plaintext) lives in three places. Reviewers must apply the same check to each Publisher until TokenVault arrives.
