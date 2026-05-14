# Phase 5: Queue Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-10
**Phase:** 05-queue-engine
**Areas discussed:** Schedule configuration, Post recycling, Queue post assignment, Auto-destruct behavior

---

## Schedule Configuration

### Hour Windows

| Option | Description | Selected |
|--------|-------------|----------|
| Individual hour slots | Multi-select checkboxes for each hour (6am-11pm). Queue publishes only during checked hours. Matches SocialOomph. | :heavy_check_mark: |
| Time range pairs | Define start-end ranges (e.g., 9am-12pm, 2pm-5pm). Simpler but less granular. | |
| Preset time slots | Pre-defined groups ("Morning", "Business hours", etc.) plus custom. Fastest but least flexible. | |

**User's choice:** Individual hour slots
**Notes:** None

### Interval Type

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed = clock-aligned, Variable = since-last-publish | Fixed: regular clock times. Variable: N time after last publish. Both respect hour windows and day-of-week. | :heavy_check_mark: |
| Only one interval type | Just since-last-publish. Simpler config. | |
| Cron expression for power users | Raw cron input. Maximum flexibility but harder UX. | |

**User's choice:** Fixed = clock-aligned, Variable = since-last-publish
**Notes:** None

### Seasonal Window

| Option | Description | Selected |
|--------|-------------|----------|
| Date range restriction | Start/end date with optional annual repeat. Queue auto-pauses outside window. | :heavy_check_mark: |
| Month-of-year checkboxes | Multi-select months. Simpler but less precise. | |
| Skip seasonal window entirely | Remove from Phase 5 scope. | |

**User's choice:** Date range restriction
**Notes:** None

---

## Post Recycling

### Default Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Opt-in per queue | Toggle on queue config, off by default. Queue stops when empty if disabled. | :heavy_check_mark: |
| On by default | Enabled by default, matches SocialOomph. | |
| Separate queue types | "One-shot" vs "recurring" queue types. | |

**User's choice:** Opt-in per queue
**Notes:** None

### Spinnable Text on Recycle

| Option | Description | Selected |
|--------|-------------|----------|
| New variant each publish | Fresh random selection from spin syntax on every publish including recycles. | :heavy_check_mark: |
| Same variant until manually changed | Resolved once, stays the same across recycles. | |

**User's choice:** New variant each publish
**Notes:** None

### Recycling and Auto-Destruct Interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Independent concerns | Separate features, no coupling. Recycled post can have auto-destruct; multiple platform posts can coexist. | :heavy_check_mark: |
| Auto-destruct required for recycling | Forces cleanup before re-posting. | |
| Warn but allow | Warning if recycling on without auto-destruct, but non-blocking. | |

**User's choice:** Independent concerns
**Notes:** None

### Queue Cursor

| Option | Description | Selected |
|--------|-------------|----------|
| Position-based cursor | "Next position" pointer. Advances N+1 after publish. Wraps to 1 on recycle. | :heavy_check_mark: |
| Timestamp-based (oldest first) | Always publishes oldest "last published" post. Self-healing. | |
| Random selection | Random unpublished post each time. Loses deliberate ordering. | |

**User's choice:** Position-based cursor
**Notes:** None

---

## Queue Post Assignment

### Post Multiplicity

| Option | Description | Selected |
|--------|-------------|----------|
| One queue per post | Post belongs to exactly one queue via queue_id FK, or no queue. Copy to reuse. | :heavy_check_mark: |
| Many-to-many via junction table | Post in multiple queues with different positions. Complex state management. | |
| Queue posts are copies | Adding to queue creates a copy. Independent but leads to content drift. | |

**User's choice:** One queue per post
**Notes:** None

### Post Creation Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Create in queue directly | Queue posts created from queue's post list view. Born as scheduled OR queued. | :heavy_check_mark: |
| Move between scheduled and queued | Posts can be reassigned between modes. Blurs mental model. | |
| Queue posts are a different entity | Separate table. Cleaner separation but duplicates logic. | |

**User's choice:** Create in queue directly
**Notes:** None

### Queue Post Form

| Option | Description | Selected |
|--------|-------------|----------|
| Same form, fewer scheduling fields | Reuse post form, hide date picker and "publish now". Keep auto-destruct, spin, tags, notes. | :heavy_check_mark: |
| Identical form with mode switch | Same form with toggle between queue/schedule mode. | |
| Completely separate form | Dedicated queue post form from scratch. | |

**User's choice:** Same form, fewer scheduling fields
**Notes:** None

### Post Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Both places | Queue posts in main /posts list (filterable) AND queue's dedicated post list. | :heavy_check_mark: |
| Queue list only | Queue posts don't appear in /posts. Separate worlds. | |
| Main list with queue column | All posts in /posts with queue column. No separate queue post list. | |

**User's choice:** Both places
**Notes:** None

---

## Auto-Destruct Behavior

### Failure Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Retry with backoff, then fail gracefully | 3 retries, exponential backoff. Stays in auto_destructing with error on exhaustion. | :heavy_check_mark: |
| Best-effort, no retry | Try once, mark destroyed regardless of result. | |
| Retry indefinitely until success | Keep retrying with increasing delays. | |

**User's choice:** Retry with backoff, then fail gracefully
**Notes:** None

### Platform 404 Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Treat as success | Post already gone = desired state achieved. Transition to destroyed. | :heavy_check_mark: |
| Treat as error | Log error and notify user. | |

**User's choice:** Treat as success
**Notes:** None

### Timer Start Point

| Option | Description | Selected |
|--------|-------------|----------|
| From published_at timestamp | Countdown from when tweet went live. Worker calculates remaining delay. | :heavy_check_mark: |
| From when the worker processes it | Timer from job enqueue time. Simpler but less accurate. | |

**User's choice:** From published_at timestamp
**Notes:** None

---

## Claude's Discretion

- Queue scheduling engine architecture (single scanner vs per-queue repeatable jobs)
- `queues` table schema design
- Queue position storage strategy
- Auto-destruct scanner query pattern and tick interval
- Spinnable text parser implementation
- "View spinnable variants" modal layout
- Queue pages layout and filter design
- Schedule builder form UX
- BullMQ auto-destruct queue concurrency
- Seasonal window storage and evaluation logic

## Deferred Ideas

- Moving posts between scheduled and queued (Phase 10 bulk op)
- Bulk queue operations (Phase 10)
- CSV bulk upload to queues (Phase 10)
- Queue empty notification delivery (Phase 9)
- Cross-queue analytics (future enhancement)
- Queue templates (not needed for single-user)
