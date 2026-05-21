# Social Media Scheduler

A self-hosted scheduler that composes, queues, and publishes **Posts** to one or more **Social Profiles** on Twitter/X, LinkedIn, and Facebook.

## Language

**Social Profile**:
A set of OAuth credentials for one account on one social network (e.g., one Twitter account, one Facebook Page, one LinkedIn Personal Profile, one LinkedIn Company Page). Owns its own encryption keys and rate-limit budget.
_Avoid_: account, connection, integration

**Post**:
A unit of content authored in the scheduler, destined for a single **Social Profile**, with platform-specific fields (text, media, visibility, link). A Post has a lifecycle: `draft → scheduled → publishing → published | permanent_fail`.
_Avoid_: tweet, status, update (those are platform-specific renderings of a Post)

**Queue**:
An ordered, recycling list of Posts associated with a **Social Profile**. The scheduler pulls the next Post from a Queue at the next scheduled run time. After publish, a recycled Post returns to the end of its Queue.
_Avoid_: list, schedule, backlog

**Publisher**:
A module that knows how to transmit one **Post** to one social network. There is one Publisher per platform (Twitter, LinkedIn, Facebook). A Publisher owns: the API-call sequence (including multi-step flows like LinkedIn image upload or Facebook multi-photo carousels), error classification, and message redaction. A Publisher receives **Credentials** from the dispatcher and does not see cipher fields. A Publisher does **not** own pre-flight checks (budget, token health, thread support) — those belong to the **Post Lifecycle**.
_Avoid_: client, adapter (we use "adapter" for the architectural concept; "Publisher" is the named seam)

**TokenVault**:
A shared capability in `@sms/shared/tokens` that is the only production code allowed to call `encrypt` or `decrypt` for Social Profile credentials. API code uses it to seal incoming tokens before storage; worker code uses it to unseal tokens at dispatch time.
_Avoid_: ad hoc encryption helper, publisher-owned decrypt

**Credentials**:
The typed plaintext credential bag returned by **TokenVault** after unsealing: Twitter credentials are OAuth 1.0a fields, and LinkedIn/Facebook credentials are OAuth 2 access tokens. Credentials stay function-scoped and are never logged, cached, or stored.
_Avoid_: token map, raw secret record

**SafeProfile**:
The Social Profile projection passed to Publishers after cipher fields have been stripped. It contains only routing and platform identity fields needed by the platform API call.
_Avoid_: raw profile row, encrypted profile

**Post Lifecycle**:
The rules governing what state a Post can be in, what transitions are legal, and what each transition implies. Lives as pure operations in `@sms/shared/post/aggregate.ts` (the `plan*` functions). Both user-driven changes (create / update / delete from the API) and scheduler-driven changes (transition to publishing, record success, record failure from the worker) consult the same Post Lifecycle. Each package has a thin **repository** that loads a row, asks the Post Lifecycle for a **PostPatch**, then writes it.
_Avoid_: post service, publish service, post state machine

**PostPatch**:
The output of every Post Lifecycle operation — a description of "what should be written to the Post row" (status, scheduledAt, platformPostId, failureReason, etc., plus a `bumpVersion` boolean). The repository applies the patch in its own transaction. Tags and media are not part of a PostPatch; they're handled separately by the repository.
_Avoid_: update, diff, change set

**Publish Attempt**:
One run of the Post Lifecycle for one Post. May succeed (Post → `published`), fail transiently (retried by BullMQ), fail permanently (Post → `permanent_fail`), or abort gracefully (Post stays in `scheduled` for re-evaluation). Recorded in `post_attempts` for the audit trail.
_Avoid_: try, retry, execution

**Auto-Destruct**:
A scheduled deletion of an already-published Post from the originating social network, configured at compose time (e.g., "delete this tweet after 24 hours"). Owned by the Auto-Destruct Lifecycle, distinct from the Post Lifecycle.
_Avoid_: scheduled deletion, expiry, tombstone

**Rate-Limit Budget**:
The remaining publish capacity for a Social Profile within the current platform window (e.g., Twitter free tier's 500 tweets/month). Pre-flight budget checks may abort a Publish Attempt with `budget_exhausted` or `rate_limit_exhausted` before any API call.
_Avoid_: quota, limit, cap

## Relationships

- A **Social Profile** can be associated with many **Posts** and many **Queues**.
- A **Post** belongs to exactly one **Social Profile** and may belong to one **Queue**.
- A **Publish Attempt** transmits one **Post** to its **Social Profile**'s network via the matching **Publisher**.
- The **Post Lifecycle** orchestrates Publish Attempts; the **Publisher** executes the API call.
- A **Rate-Limit Budget** belongs to a **Social Profile** and gates Publish Attempts at pre-flight.

## Example dialogue

> **Dev:** "When a Post fails to publish, who decides whether to retry?"
> **Reviewer:** "The Publisher classifies its failure as `permanent` or `transient` and throws a `PublishFailure`. The worker's publish handler catches that, asks the Post Lifecycle for a `planRecordFailure` patch, writes it, and either re-throws (transient → BullMQ retries) or throws `UnrecoverableError` (permanent → stops retrying). The Publisher doesn't know what 'retry' means — only what 'permanent vs transient' means for its platform."

> **Dev:** "Where does the budget check live — in the Publisher?"
> **Reviewer:** "No. Budget is pre-flight — the worker checks it, then passes the result into `planTransitionToPublishing` as part of the preflight state. A budget-exhausted Post stays in `scheduled` and the scanner re-evaluates after the window resets. The Publisher's job starts at the API call."

> **Dev:** "Where does input validation for `updatePost` live?"
> **Reviewer:** "Two places, by design. Zod schemas in `@sms/shared/schemas` validate the *shape* of the input. The Post Lifecycle's `planUpdate` validates the *invariants* — is the Post editable, does the version match, is the new transition legal, is the new scheduledAt in the future. The API repository wires them together: parse with Zod, then ask the Post Lifecycle for a PostPatch."

## Flagged ambiguities

- "post" was being used to mean both the **Post** (our domain object) and the platform-specific result (the tweet, the Facebook feed entry, the LinkedIn share). Resolved: **Post** = our object; the platform result is captured as `platformPostId` on the Post row, but is never called a "post" in code or conversation.
- "service" was overloaded across CRUD-style services, state machines, and API-call modules. We are narrowing toward named concepts: the module that calls the platform is a **Publisher**, the state machine is the **Post Lifecycle**.
