# Phase 4: Publish Worker & Scheduled Posts - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 04-publish-worker-scheduled-posts
**Areas discussed:** Scheduling mechanism, Retry & failure surfacing, Publish history storage, Rate limit window

---

## Gray Area Selection

**Question:** Which gray areas do you want to discuss for Phase 4?

| Option | Description | Selected |
|--------|-------------|----------|
| Scheduling mechanism | How scheduled posts enter BullMQ. Delayed job on save vs periodic DB scanner vs hybrid. | ✓ |
| Retry & failure surfacing | Retry/backoff tuning and how dead-lettered posts appear (in-list, separate view, Bull-Board, combination). | ✓ |
| Publish history storage | New post_attempts table vs JSONB column on posts vs BullMQ job history only. | ✓ |
| Rate limit window | Calendar month UTC vs rolling 30 days vs user-timezone month. | ✓ |

**User's choice:** All four areas selected for discussion.

---

## Scheduling Mechanism

### Q1: Which scheduling approach for the publish worker?

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid (Recommended) | Delayed BullMQ job on save + 60s reconciliation scanner for stragglers/orphans. Self-healing. | ✓ |
| Delayed jobs only | Enqueue delayed job on save, update/remove job on edit/delete. Simpler, no self-healing. | |
| Scanner only | Repeatable scanner every 15–60s queries due posts. Up-to-interval latency. | |

**User's choice:** Hybrid (Recommended)
**Notes:** Self-healing across Redis restarts and worker downtime was the deciding factor for a Proxmox self-hosted deployment where the worker will restart from time to time.

### Q2: How should edits to an already-scheduled post interact with the worker?

| Option | Description | Selected |
|--------|-------------|----------|
| post_version optimistic lock (Recommended) | Worker re-checks post_version in transaction; aborts if changed, scanner re-enqueues. Phase 3 already added post_version. | ✓ |
| Job-level cancellation | API cancels/removes existing delayed job on edit, re-enqueues new one. More complex on API side. | |
| Publishing-state lock | API rejects edits with 409 once state = publishing. Simplest, worst UX if publishes stall. | |

**User's choice:** post_version optimistic lock (Recommended)

### Q3: Auto-destruct worker is explicitly Phase 5 per REQUIREMENTS.md (WORKER-09). Should Phase 4 still stub the queue and transition states?

| Option | Description | Selected |
|--------|-------------|----------|
| Defer completely to Phase 5 (Recommended) | Phase 4 ignores auto_destructing/destroyed entirely. Cleanest phase boundary. | ✓ |
| Stub queue and enum transitions | Create auto-destruct queue now, Phase 5 wires logic. Avoids a Phase 5 queue-creation migration. | |

**User's choice:** Defer completely to Phase 5 (Recommended)

---

## Retry & Failure Surfacing

### Q1: What retry timing for transient Twitter publish failures?

| Option | Description | Selected |
|--------|-------------|----------|
| 30s → 5min → 30min (Recommended) | 4 attempts across ~36 min. Rides out Twitter blips without indefinite limbo. Honor Retry-After header on 429. | ✓ |
| BullMQ default exponential | Starts ~2s, doubles. Too aggressive for Twitter rate-limit buckets. | |
| 1min → 10min → 1hr | 4 attempts across ~70 min. Conservative, better for long incidents. | |

**User's choice:** 30s → 5min → 30min (Recommended)

### Q2: How should permanent errors (401 auth, 403 forbidden, 422 duplicate content) be handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Fail fast, no retries (Recommended) | Classifier flags 401/403/422 as permanent, fail on first attempt, emit notification event. | ✓ |
| Retry everything uniformly | All errors get full 4-attempt treatment. Simpler but wastes ~36 min on hopeless errors. | |

**User's choice:** Fail fast, no retries (Recommended)

### Q3: How should failed posts surface to you as a user?

| Option | Description | Selected |
|--------|-------------|----------|
| List + Retry + Bull-Board (Recommended) | Failed badge + error column + Retry action in /posts; Bull-Board at /admin/queues for operator debugging. | ✓ |
| List + Retry only | User-facing only. No operator visibility. | |
| Bull-Board only | Ops through /admin/queues, no user-facing retry UI. | |

**User's choice:** List + Retry + Bull-Board (Recommended)

### Q4: Should the Retry action reset the attempt counter or continue from where it left off?

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh 4-attempt budget (Recommended) | Manual retry starts over. Prior attempts preserved in history. | ✓ |
| Single manual attempt | Retry = one more shot, then back to failed. Debug-probe semantics. | |

**User's choice:** Fresh 4-attempt budget (Recommended)

---

## Publish History Storage

### Q1: Where should publish attempt history live?

| Option | Description | Selected |
|--------|-------------|----------|
| New post_attempts table (Recommended) | Dedicated relational table with clean queries, retention policies, survives Redis resets. | ✓ |
| JSONB column on posts | Append to array on posts row. One read, no join. Row bloat on frequent retries. | |
| BullMQ job history only | Read from Redis via bull-board + API. Auto-prunes, history disappears. | |

**User's choice:** New post_attempts table (Recommended)

### Q2: How long should attempt history be retained?

| Option | Description | Selected |
|--------|-------------|----------|
| Forever (Recommended) | No auto-delete. Disk is cheap on Proxmox, rows are ~200 bytes. | ✓ |
| 90 days | Cleanup job removes attempts older than 90 days. | |
| Tied to post lifecycle | Cascade delete with parent post; retained forever otherwise. | |

**User's choice:** Forever (Recommended)
**Notes:** Aligns with the "own the data" product pitch — history vanishing after a cleanup run would betray that value.

### Q3: Should the post_attempts table also store the full outbound Twitter API response payload?

| Option | Description | Selected |
|--------|-------------|----------|
| Just status + error message (Recommended) | Compact fields: status, error_code, error_message, platform_post_id. Full payloads in pino logs. | ✓ |
| Store full response JSONB | Add response_body JSONB. Richer debugging, larger rows. | |

**User's choice:** Just status + error message (Recommended)

---

## Rate Limit Window

### Q1: How should the monthly Twitter rate limit window be defined?

| Option | Description | Selected |
|--------|-------------|----------|
| Calendar month UTC (Recommended) | Resets 00:00 UTC on the 1st. Matches Twitter dev portal billing cycle. | ✓ |
| Rolling 30 days | Sliding window over publishedAt in last 30 days. Never matches Twitter dashboard. | |
| User-timezone month | Resets at local midnight on the 1st. Drifts from Twitter billing. | |

**User's choice:** Calendar month UTC (Recommended)

### Q2: How should the rate limit counter be computed?

| Option | Description | Selected |
|--------|-------------|----------|
| Query on demand from posts (Recommended) | SELECT count(*) against posts table with existing index. No counter table to drift. | ✓ |
| Dedicated counter table | New profile_publish_counters incremented in publish transaction. O(1) reads, new drift surface. | |

**User's choice:** Query on demand from posts (Recommended)

### Q3: LIMIT-04 says pre-flight should warn at 90% and block at 100% of budget. What does 'block' mean?

| Option | Description | Selected |
|--------|-------------|----------|
| Hard block: API returns 409 (Recommended) | API rejects post with 409 Conflict. Frontend shows error. Strict reading of LIMIT-03/04. | ✓ |
| Soft block with confirmation | API accepts, frontend confirms. User can override. Weaker guarantee. | |
| Silent block (skip at publish time) | Accept at schedule, skip at publish. Surprise failures. | |

**User's choice:** Hard block: API returns 409 (Recommended)

### Q4: LIMIT-01 says the monthly budget is user-configurable. Where should that setting live?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-profile on social_profiles row (Recommended) | monthlyTweetBudget + warnThresholdPercent columns on social_profiles. Fits Phase 8 LinkedIn/FB. | ✓ |
| Single global setting | One budget for all Twitter profiles in user settings. Simpler if you only have one account. | |

**User's choice:** Per-profile on social_profiles row (Recommended)

---

## Claude's Discretion

Areas where the user deferred to Claude during discussion:

- Exact BullMQ worker initialization pattern (factory function + injected dependencies)
- Bull-Board integration details (which app mounts it, route prefix, exposed queues)
- Error classification taxonomy — twitter-api-v2 error code to transient/permanent mapping
- notification queue payload shape (event type, profileId, postId, reason)
- Worker test strategy (vitest + msw + fake timers for retries)
- History modal layout specifics (table vs timeline vs grouped list)
- Scanner job initialization pattern (on-boot vs QueueScheduler repeatable)
- Logger correlation ID flow from request → enqueued job → worker → log lines
- Exact placement of the Twitter publish service in the monorepo

## Deferred Ideas

- Real-time push updates via SSE/WebSocket (polling sufficient for now)
- Cross-profile rate limit dashboard (Phase 8 LIMIT-08)
- Facebook/LinkedIn rate limits (Phase 8 LIMIT-06/07)
- Bulk retry of multiple failed posts (Phase 10)
- Custom per-post retry overrides
- Additional BullMQ queues from WORKER-02 owned by other phases (transcode → Phase 6, token-refresh → Phase 7, auto-destruct → Phase 5, media-cleanup → Phase 6, bulk → Phase 10)
