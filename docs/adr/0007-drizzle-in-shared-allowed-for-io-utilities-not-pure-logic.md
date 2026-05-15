# `drizzle-orm` is allowed in `@sms/shared` for I/O utilities, not for pure domain logic

Candidate 2 (Post Lifecycle, ADR-0003) deliberately kept Drizzle out of `@sms/shared`: the Post aggregate is a pure-function module so its tests don't need a DB harness. Candidate 6 (rate-limit loader dedupe) takes the *opposite* call — it moves DB-querying loader functions into `@sms/shared/rate-limit/loaders.ts`, which adds `drizzle-orm` as a runtime dep of shared. This ADR records the principle that resolves the apparent contradiction.

The rule: **`@sms/shared` MAY contain code that does database I/O, but ONLY when the code is inherently I/O-bound (a SELECT, an INSERT, a transactional helper)**. Pure domain decisions stay pure — they don't get a DB dep just because they sit next to an I/O utility. The Post aggregate (`@sms/shared/post/aggregate.ts`) remains a Drizzle-free zone. The rate-limit loaders (`@sms/shared/rate-limit/loaders.ts`) bring Drizzle in, because there's no pure decomposition to be had — a `SELECT count(*) FROM posts WHERE ...` is the whole behavior.

The deciding question for any candidate "move this to shared": **does the unit have a pure decomposition?** If yes, put the pure piece in shared and keep the I/O piece in the consumer's package. If no, the unit IS inherently I/O, and `@sms/shared` is still the right home if multiple packages need it.

## Considered Options

- **Allow Drizzle in shared for I/O-bound utilities, ban it for pure logic** *(chosen)* — Lets us deduplicate genuinely identical I/O code (rate-limit loaders, future shared queries) without compromising the test surface of pure-decision modules.
- **Ban Drizzle from shared entirely** — Forces continued duplication of inherently I/O-bound code that has no pure decomposition. The worker's existing "we deliberately duplicate" comment exists because of exactly this constraint; closing it is the locality win Candidate 6 is built around.
- **Allow Drizzle in shared with no rules** — Risk: aggregate modules drift toward DB I/O, the "pure functions for test surface" guarantee of Candidate 2 erodes, and reviewers lose the principled answer to "why isn't this in shared?"

## Consequences

- `@sms/shared/package.json` lists `drizzle-orm` as a runtime dep starting with R6.1.
- New code in `@sms/shared` must answer the deciding question explicitly when it's added. If the module is pure-decision, no Drizzle import. If the module is inherently I/O, Drizzle is fine and the module's tests use integration fixtures.
- Code review heuristic: a file in `@sms/shared` that imports both `drizzle-orm` *and* exports pure-decision functions (returning patches, raising invariant errors, etc.) is a smell — split the file.
- ADR-0003's rejection of "α — `PostRepository` in `@sms/shared` owning rules + DB I/O" is unchanged. That rejection was about mixing pure rules and I/O in the same module, which is still the wrong shape.
