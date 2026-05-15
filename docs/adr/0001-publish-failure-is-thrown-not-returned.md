# PublishFailure is thrown, not returned

The **Publisher** seam needs a uniform failure contract across Twitter, LinkedIn, and Facebook. We considered making `publish()` return `Result<PublishResult, PublishFailure>` (forcing callers to handle failure at the type level), but chose to throw a discriminated `PublishFailure` class instead.

The deciding factor is the surrounding code: `PostLifecycleAbort` is thrown, BullMQ's `UnrecoverableError` is thrown, and `publishPost` in the **Post Lifecycle** is already a `try/catch`-shaped function. Adding a `Result` at one seam would force `publishPost` to mix two failure idioms — `if (!result.ok)` for the Publisher and `try/catch` for `PostLifecycleAbort` — which is precisely the "have to read it twice" friction the deepening was meant to remove. `PublishFailure` is a class with a `kind: 'permanent' | 'transient'` discriminator, so the catch site still gets type narrowing and exhaustiveness checks via `assertNever`.

## Considered Options

- **Throw `PublishFailure`** *(chosen)* — One idiom in the codebase, type narrowing via `instanceof` + discriminant, no new dependency.
- **Return `Result<PublishResult, PublishFailure>`** — Stronger type safety and explicit failure handling, but creates two failure idioms inside `publishPost`. Stronger fit in greenfield code; weaker fit here.
- **Throw `Error` subclasses per platform (status quo)** — What we're moving away from. Forces parallel error-classifier switches at the call site.

## Consequences

- If a future change makes the rest of the worker exception-free (e.g., adopting `neverthrow` codebase-wide), revisit this. The argument is contextual, not universal.
- The catch block contract is: any thrown value that is **not** a `PostLifecycleAbort` and **not** a `PublishFailure` is a bug. Such values surface as BullMQ retries and should be investigated, never silently swallowed.
