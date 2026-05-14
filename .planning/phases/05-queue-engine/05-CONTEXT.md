# Phase 5: Queue Engine - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Delivers persistent post queues that publish on a recurring schedule with timezone-aware timing, post recycling, and auto-destruct. Users can create queues with flexible schedule configurations (interval type, days-of-week, individual hour slots, start date, seasonal date range), add posts to queues with position-based ordering, and enable optional recycling to loop through content indefinitely. A separate auto-destruct worker handles delayed deletion of published posts from the platform.

**In scope:**
- Queue CRUD (create, read, update, delete) with full schedule configuration
- Queue scheduling engine: evaluates queues on a recurring tick, publishes the next post when interval/day/hour constraints are satisfied
- Queue post management: add posts to a queue, reorder (move up/down), view spinnable text variants
- Position-based cursor tracking for queue progression and recycling
- Post recycling: opt-in per queue, wraps cursor to position 1 after the last post publishes
- Spinnable text resolution at publish time (new random variant each publish, including recycles)
- Auto-destruct worker: BullMQ queue + worker that deletes published posts from the platform after the configured duration
- Auto-destruct state transitions: `published` -> `auto_destructing` -> `destroyed`
- Queue list page, queue detail/edit page, queue posts list page with reorder controls

**Explicitly out of scope (belong in other phases):**
- Media transcoding/upload -- Phase 6
- LinkedIn and Facebook publish paths -- Phase 7/8
- Notification delivery (in-app bell, SMTP) -- Phase 9. Phase 5 emits events to the `notification` queue.
- CSV bulk upload for queue posts -- Phase 10
- Bulk queue operations (randomize, purge, copy, text modify, deduplicate) -- Phase 10
- Moving posts between scheduled and queued states -- Phase 10 bulk operation if needed

</domain>

<decisions>
## Implementation Decisions

### Schedule Configuration

- **D-01:** Hour windows use individual hour slot checkboxes (6am through 11pm). Multi-select -- user checks exactly which hours they want posts going out. Queue publishes only during checked hours. Matches SocialOomph's approach.
- **D-02:** Two interval types: **fixed** (clock-aligned, e.g., every 4h = 8am, 12pm, 4pm, 8pm) and **variable** (since-last-publish, e.g., 4h after the previous post actually went out). Both respect hour windows and day-of-week constraints.
- **D-03:** Seasonal window is a date range restriction with optional annual repeat. Queue auto-pauses outside the window (e.g., Nov 1 - Dec 31 for holiday content) and resumes when the date range is active again. Optional field on queue config.

### Post Recycling

- **D-04:** Recycling is a per-queue toggle, **off by default**. When enabled, published posts move to the bottom of the queue and the cursor wraps to position 1 after the last post publishes. When disabled, queue stops publishing when it runs out of posts (notification event emitted for Phase 9).
- **D-05:** Spinnable text resolves a **new random variant each publish**, including on recycles. Each cycle through the queue produces different content from `{opt1|opt2|opt3}` syntax. This is the core value of combining spin syntax with recycling.
- **D-06:** Recycling and auto-destruct are **independent concerns**. A recycled post can have auto-destruct configured -- the old platform post is destroyed on its own timer while new publishes create fresh platform posts. No coupling between the two features.
- **D-07:** Queue tracks progression via a **position-based cursor**. After publishing position N, cursor advances to N+1. When recycling is on and cursor exceeds max position, it wraps to position 1. Predictable, simple, matches SocialOomph.

### Queue Post Assignment

- **D-08:** **One queue per post**. A post belongs to exactly one queue (via `queue_id` foreign key) or no queue (standalone scheduled post). To reuse content across queues, copy the post. No many-to-many junction table.
- **D-09:** Queue posts are **created directly from the queue's post list view** using the existing post creation form. A post starts life as either a scheduled post OR a queue post -- not both. No moving between the two in Phase 5.
- **D-10:** Queue post form is the **same form as scheduled posts with fewer scheduling fields**. Date/time picker and "publish now" are hidden. Auto-destruct, spinnable text, tags, and notes remain. Button reads "Save to Queue" instead of "Schedule."
- **D-11:** Queue posts appear in **both** the main `/posts` list (filterable by status=`queued`) AND in their queue's dedicated post list. The `/posts` list is the global view; the queue post list is the per-queue management view with reorder controls.

### Auto-Destruct Worker

- **D-12:** Auto-destruct uses the same retry pattern as publish: **3 retries with exponential backoff**. If all retries fail, post stays in `auto_destructing` state with an error flag. User can manually retry or dismiss. Notification event emitted on failure.
- **D-13:** Platform 404 (post already manually deleted) is treated as **success**. Transition straight to `destroyed` without error. The desired end state is achieved regardless of how the post was removed.
- **D-14:** Auto-destruct timer counts from `published_at` timestamp, not from when the job is enqueued. The delayed BullMQ job calculates `delay = autoDestructAfter - (now - publishedAt)`. If the worker was down during publish, the scanner picks it up and calculates remaining delay from `published_at`.

### Claude's Discretion

- Queue scheduling engine architecture: single scanner evaluating all queues on a tick (mirroring Phase 4's 60s scanner pattern) vs. per-queue BullMQ repeatable jobs. Claude picks based on what integrates best with the existing scanner.
- `queues` table schema design: column names, types, index strategy
- Queue position storage: explicit `position` integer column vs. linked list approach
- Auto-destruct scanner: how it discovers posts needing destruction (query pattern, tick interval)
- Spinnable text parser implementation: regex-based resolution of `{opt1|opt2|opt3}` syntax
- "View spinnable variants" modal: how many variants to preview, layout
- Queue list page layout and filter bar design (following existing `/posts` page patterns)
- Queue detail/edit page form layout for the schedule builder
- BullMQ auto-destruct queue concurrency limit
- How `seasonal_start` / `seasonal_end` + `seasonal_repeat` are stored and evaluated

### Folded Todos
(None -- no pending todos matched this phase)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` SS QUEUE -- QUEUE-01 through QUEUE-06 (queue CRUD, list, actions, post management, reorder, timezone-aware scheduling)
- `.planning/REQUIREMENTS.md` SS WORKER -- WORKER-09 (auto-destruct worker)
- `.planning/REQUIREMENTS.md` SS STATE -- STATE-01 (post state machine including `auto_destructing` and `destroyed`)
- `.planning/ROADMAP.md` SS Phase 5 -- Goal and 4 success criteria that must be TRUE for phase completion

### Project Context
- `.planning/PROJECT.md` SS Context -- UTC storage / IANA display rule, Twitter-first strategy, SocialOomph replacement
- `.planning/PROJECT.md` SS Constraints -- BullMQ + Redis, AES-256-GCM token encryption, Docker Compose on Proxmox

### Prior Phase Context
- `.planning/phases/01-infrastructure-foundation/01-CONTEXT.md` -- Factory function pattern, pino logging, Docker Compose structure, Cloudflare Tunnel
- `.planning/phases/02-authentication-user-account/02-CONTEXT.md` -- Settings page with timezone/date format, single-user enforcement, shadcn/ui patterns
- `.planning/phases/04-publish-worker-scheduled-posts/04-CONTEXT.md` -- BullMQ worker architecture (D-01 hybrid scheduling, D-04 queue ownership, D-09 retry policy), publish pipeline, scanner pattern, rate limit tracking, graceful shutdown

### Codebase Integration Points
- `packages/worker/src/index.ts` -- Worker bootstrap; Phase 5 adds auto-destruct queue + worker and queue scheduling worker
- `packages/worker/src/publish-worker.ts` -- Publish worker pattern to mirror for auto-destruct
- `packages/worker/src/post-lifecycle.service.ts` -- Three-phase lifecycle pattern (lock, network call, commit); auto-destruct follows same structure
- `packages/worker/src/scanner.ts` -- 60s reconciliation scanner; queue scheduler may extend or mirror this
- `packages/shared/src/constants/queues.ts` -- Queue names constant; add `autoDestruct` queue name
- `packages/shared/src/constants/post-states.ts` -- State machine with transitions; `auto_destructing` and `destroyed` states already defined
- `packages/db/src/schema/posts.ts` -- Posts table with `autoDestructAfter`, `hasSpinnableText`, `status` enum including `queued`/`auto_destructing`/`destroyed`
- `packages/web/src/components/posts/AutoDestructPicker.tsx` -- Existing UI component for auto-destruct duration config
- `packages/web/src/pages/posts/PostsPage.tsx` -- Existing filterable posts table; queue posts appear here with status=queued filter
- `packages/web/src/pages/posts/NewPostPage.tsx` -- Post creation form to reuse/adapt for queue post creation
- `packages/api/src/services/publish-queue.service.ts` -- API-side queue wrapper for enqueuing jobs

### External Library Docs (resolved during planning via mcp__context7__*)
- `bullmq` -- delayed jobs, repeatable jobs, cron scheduling, timezone parameter (`tz` option)
- `luxon` -- IANA timezone handling, DST-safe date arithmetic for queue scheduling
- `twitter-api-v2` -- tweet deletion endpoint for auto-destruct

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **BullMQ infrastructure** -- `bullmq` and `ioredis` already installed in worker and api packages. Queue constants file ready for extension.
- **Worker bootstrap pattern** -- `packages/worker/src/index.ts` creates queues, workers, and handles graceful shutdown with per-resource try/catch. Phase 5 adds new workers to this same bootstrap.
- **Publish worker + lifecycle service** -- Three-phase transactional pattern (lock row, make API call, commit result) directly applicable to auto-destruct worker.
- **Scanner reconciliation loop** -- 60s scanner that queries for due posts and enqueues jobs. Queue scheduler can mirror this pattern.
- **Post state machine** -- `transitionPost()` function is the single authority. States `queued`, `auto_destructing`, and `destroyed` already defined in the enum.
- **AutoDestructPicker component** -- Full UI component with duration/unit selector already integrated into the post creation form.
- **PostsPage filter bar + table** -- TanStack React Table with status/profile/tag filters, expandable rows, per-row action menus. Queue posts list follows this pattern.
- **Post creation form** -- `NewPostPage.tsx` with character count, spinnable text toggle, auto-destruct picker, tags, notes. Queue post form reuses this with scheduling fields hidden.
- **shadcn/ui components** -- Dialog, DropdownMenu, Table, Badge, Button, Select, Input all available.
- **TanStack Query hooks** -- `use-posts.ts` pattern for data fetching with polling.

### Established Patterns
- Factory functions with injected dependencies (`createApp`, `createWorker`)
- Env vars read at runtime inside functions, never at module scope
- Zod schemas in `packages/shared/src/schemas/` for request/response validation
- Router factory pattern: `createXxxRouter({ db })` returns Express Router
- Drizzle ORM transactions for multi-step mutations
- Vitest fake timers for time-dependent tests

### Integration Points
- **New `queues` table** -- Schema in `packages/db/src/schema/`, migration via drizzle-kit
- **Posts table extension** -- Add `queue_id` FK and `queue_position` column to existing posts table
- **Worker bootstrap** -- Add auto-destruct queue/worker and queue scheduler to `main()` in worker index
- **Queue constants** -- Add `QUEUE_NAMES.autoDestruct` and job names to constants file
- **API routes** -- New `/api/queues/*` endpoints for CRUD, post management, reorder
- **Web pages** -- New queue list, queue detail, queue posts pages following existing patterns
- **Post form adaptation** -- Conditionally hide scheduling fields when creating a queue post
- **Scanner extension or new scanner** -- Queue-aware job picker that evaluates day-of-week, hour window, interval, seasonal window

</code_context>

<specifics>
## Specific Ideas

- **SocialOomph replacement is the mental model** -- queue scheduling should feel familiar to SocialOomph users. Individual hour slots, position-based queue ordering, recycling toggle, variable/fixed intervals are all SocialOomph concepts being replicated.
- **Queue cursor = the core scheduling primitive** -- the position cursor determines what publishes next. Reorder changes positions; recycling wraps the cursor. Everything else (interval, day-of-week, hour window, seasonal) gates WHEN the cursor advances, not WHAT it points to.
- **Spinnable text + recycling = evergreen content engine** -- this combination is the killer feature. A queue of 50 posts with spin syntax recycling indefinitely produces months of varied content from a single content set. New variant resolution on each publish is essential.
- **Auto-destruct is fire-and-forget with safety nets** -- the user sets a duration, forgets about it, and the worker handles the rest. 404 = success (post already gone). Retry with backoff for transient failures. Error state for persistent failures that need attention.
- **Independent timer from published_at** -- auto-destruct doesn't care about recycles, queue position, or scheduling. It counts from when the tweet went live. This means multiple auto-destruct jobs can be in flight for different cycles of the same recycled post.

</specifics>

<deferred>
## Deferred Ideas

- **Moving posts between scheduled and queued** -- explicitly deferred. If needed, it's a Phase 10 bulk operation. Phase 5 keeps a clean separation: posts are born as one or the other.
- **Bulk queue operations** (randomize, purge, copy, text modify, deduplicate) -- Phase 10 scope.
- **CSV bulk upload to queues** -- Phase 10.
- **Queue empty notification delivery** -- Phase 5 emits the event to the notification queue; Phase 9 delivers it via in-app bell and SMTP.
- **Cross-queue analytics** (which queues perform best, optimal posting times) -- not in any phase; future enhancement if needed.
- **Queue templates** -- save a schedule configuration as a reusable template for creating new queues. Not needed for a single-user tool with a handful of queues.

</deferred>

---

*Phase: 05-queue-engine*
*Context gathered: 2026-04-10*
