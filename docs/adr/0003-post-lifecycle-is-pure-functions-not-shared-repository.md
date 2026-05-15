# Post Lifecycle is pure functions in shared, not a shared repository

The **Post Lifecycle** (rules and invariants for state changes on a Post) lives as pure functions in `@sms/shared/post/aggregate.ts` — the `plan*` family that returns a **PostPatch** describing what to write. Each package has its own thin repository that loads the row, asks the Post Lifecycle for a patch, then writes. We rejected the alternative of a `PostRepository` in `@sms/shared` that owns both the rules and the SQL.

The deciding factor is the test surface. A shared repository would pull `drizzle-orm` into `@sms/shared` as a runtime dep, and every shared unit test could plausibly need a DB fixture. Project convention (see `publish-worker.ts` comments — "exported so unit tests can invoke it directly without standing up a BullMQ Worker") is to keep core logic exercisable as pure functions. A shared repository would also confuse callers: it ends up with worker-specific methods (`transitionToPublishingWithLock`) and API-specific methods (`updateAsUser`) — same noun, two audiences. The pure-function shape keeps the audience split where it already is, in the package-local repositories.

## Considered Options

- **Pure `plan*` functions in `@sms/shared/post/aggregate.ts`** *(chosen)* — Concentrates invariants without coupling shared to drizzle or to DB I/O. Test surface stays pure.
- **`PostRepository` class in `@sms/shared` owning rules + DB I/O** — Most-concentrated locality on paper. Rejected: shared becomes DB-aware, and the repository serves two audiences with different needs.
- **Keep two services as-is, extract shared validator helpers** — Smallest change. Rejected because it leaves the cognitive cost (two services to navigate for one concept) intact — duplication isn't the problem we're solving, locality is.
- **Rename services without merging logic (`post-commands.ts` + `post-lifecycle.ts`)** — Honest naming, but doesn't move any logic. Strictly weaker than the chosen option.

## Consequences

- The aggregate has no DB or async surface. Tests are `(currentRow, input) → expected PostPatch | expected PostInvariantError`.
- Each repository (API + worker) is the one place where a "load → ask → write" sequence appears for its concern. The transaction boundary lives in the repository, not the aggregate.
- Tags and media stay in the API repository — the aggregate only reasons about the Post row.
- `planCreate` is deliberately omitted. Creation is defaults + Zod schema validation, not state-machine semantics; symmetry isn't worth pulling a non-state operation into the aggregate.
