# OAuth Connect stays procedural; no sealed `ConnectAttempt` object

During the architectural review that produced ADRs 0001–0005, the OAuth Connect flow was flagged as "no state machine enforces ordering" and a candidate refactor was sketched: a sealed `ConnectAttempt` object that owns the full `createOAuthState → callback → maybe peekPendingSelection → consumePendingSelection` lifecycle and exposes only safe transitions. After a closer look at the implementation, we decided not to do that refactor. The friction was over-pitched and the existing code earns its keep.

The OAuth service's functions (`createOAuthState`, `consumeOAuthState`, `createPendingSelection`, `consumePendingSelection`, `peekPendingSelection`, plus the private `atomicConsume<T>` helper) are doing real work: pipelined Redis `GET+DEL` prevents double-callback wins (per T-07-01), nonces are securely generated, and logging uses SHA-256 fingerprint prefixes rather than nonce slices to avoid leaking entropy across log entries (per WR-07). A sealed-object rewrite would have to re-implement all of that. The only friction that's genuinely shallow is the route-side error-shape decoding (`if (err instanceof OAuthServiceError) switch (err.code) ...`), which is addressed by a small mapping table — see R4.1 / gh#72 — using the same pattern as the `PostInvariantError → HTTP` mapping from Candidate 2.

## Considered Options

- **Keep procedural functions, add a small error→HTTP mapping at the route** *(chosen)* — Closes the only real friction with ~30 lines of code. Existing service stays as-is.
- **Sealed `ConnectAttempt` object owning the full lifecycle** — Highest locality on paper; rejected because the existing service's behavior (atomic consume, nonce discipline, fingerprint logging) is already deep enough that wrapping it in a class buys ceremony, not safety. The "ordering not enforced" complaint is technically true but unobserved — there is no bug report or test gap attributable to it.
- **Group `OAuthState` + `PendingSelection` into a unified `oauthStore` factory** — Modest cleanup; rejected because the two concepts have meaningfully different shapes (state is one-shot, selection is peek-then-consume) and grouping them produces a factory with awkward dual-purpose methods.

## Consequences

- The OAuth service stays at six exported functions plus the private `atomicConsume<T>`. Reviewers may continue to be tempted by a sealed-object rewrite; pointing at this ADR is the answer.
- If a future bug *does* show up that's attributable to unenforced ordering (a route calls `consumeOAuthState` without `createOAuthState`, or skips the `peekPendingSelection` step), revisit this ADR. The friction would then be observable rather than theoretical.
- The route-side error mapping introduced by R4.1 means new `OAuthServiceError.code` values must be added to the mapping table at the same time they're introduced — a small contract worth calling out in code review for OAuth route changes.
