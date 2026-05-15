# Publish-cycle orchestration stays in the worker

The worker's `publishPost` function does two kinds of work: (a) **pure decisions** — what state should the Post move to, what should the PostPatch contain — and (b) **orchestration** — the FOR UPDATE transaction, releasing the lock before the network call, calling the Publisher, recording the attempt. We moved (a) into the **Post Lifecycle** in `@sms/shared/post/aggregate.ts`. We deliberately kept (b) in `packages/worker/src/post-lifecycle.service.ts`. The worker is now a thin caller of the aggregate's pure decisions.

We considered moving orchestration into shared as a higher-order function (`runPublishCycle(row, { checkBudget, publish }, ...)`) so the entire publish cycle could be described in one place. Rejected: a "pure" shared function with async callbacks for I/O has the same effective test surface as keeping orchestration in the worker (callbacks must be mocked either way), while making shared dependent on the orchestration's exact shape (callback contract, error propagation rules, retry semantics). The worker is the right owner because the worker is what runs inside BullMQ and is what BullMQ expects to throw / not throw / return a result.

## Considered Options

- **Pure decisions in shared, orchestration in worker** *(chosen — 5A)* — Same pattern we used for the Publisher seam: the seam owns its slice, the worker owns the outer shape.
- **Pure decisions + orchestration in shared** *(5B)* — Maximum locality on paper. Rejected: shared grows an async surface with callback contracts; tests have to mock the same callbacks anyway.
- **Pre-planned "decision union" with synchronous executor** *(5C)* — Aggregate returns `{ kind: 'abort' | 'proceed' | 'recover', ... }` describing the whole cycle. Worker executes. Elegant but premature — the publish cycle is mostly linear, and a function-per-step is more navigable than a union-per-cycle until the decision tree gets deeper.

## Consequences

- `publishPost` in the worker shrinks substantially. What remains is the transaction shape, the lock-release-before-network discipline, the callback wiring (`ctx.checkBudget`, `ctx.callTwitter` — which after ADR-0001 is the Publisher map), and the attempt-recording I/O. Pure decisions delegate to `planTransitionToPublishing`, `planRecordSuccess`, `planRecordFailure`.
- The aggregate's `TransitionDecision` discriminated return covers the recovery path (`{ kind: 'recover', recoveryPlatformPostId }`) so the worker knows when to skip the Publisher call.
- The same pattern repeats across our two recent seams: Publisher seam (ADR-0001) — pure failure classification inside each Publisher, orchestration in the worker. Post Lifecycle (this ADR) — pure decisions in shared, orchestration in the worker. The worker stays the orchestrator; the seams stay pure-or-platform-specific.
