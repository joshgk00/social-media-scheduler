# API Contract Sketch

The redesign is mostly a frontend overhaul; the existing API should already support most of it. This document lists the endpoints each screen consumes, with **additive** fields the redesign needs that may not exist today. Treat each "needs" as a question for the backend dev — if the field is already there, great; if not, it's a small extension.

If the codebase uses tRPC or GraphQL instead of REST, translate accordingly. The shapes below are what the UI consumes — protocol is incidental.

---

## Authentication (existing)

- `POST /auth/login` — `{ email, password }` → `{ token, requires_2fa?: boolean }`
- `POST /auth/2fa` — `{ token, code }` → `{ token }`
- `POST /auth/recover/start` — `{ email }` → `{ recovery_token }`
- `POST /auth/recover/questions` — `{ recovery_token, answers }` → `{ ok }`
- `POST /auth/recover/reset` — `{ recovery_token, new_password }` → `{ ok }`
- `POST /auth/setup` — `{ email, password, timezone }` → `{ token }` (first-run only)
- `POST /auth/signout-all-other` — `{}` → `{ revoked: number }`

---

## Profiles

### `GET /profiles`
Returns: `Profile[]`

```ts
type Profile = {
  id: string;
  name: string;                     // "Personal Twitter"
  handle: string;                   // "@joshslaughter" or "Clicks & Mortar Websites"
  platform: "twitter" | "linkedin" | "facebook";
  active: boolean;
  deprecated: boolean;              // Needs: surfaces the "Deprecated" pill on the card (issue 5)
  rate_used: number;                // Recent window usage
  rate_max: number;                 // 0 means no per-account cap (LinkedIn, Facebook)
  rate_resets_at: string;           // ISO timestamp — used for dashboard "All reset Jun 1" (issue 16)
  connected_at: string;             // ISO
  last_published_at: string | null;
  next_scheduled_at: string | null; // For history footer on profile card
};
```

### `POST /profiles/connect/:platform/start` — OAuth init for LinkedIn/Facebook
Redirects to platform OAuth.

### `POST /profiles/connect/twitter` — Twitter dev-app credentials
Body: `{ consumer_key, consumer_secret, access_token, access_token_secret }` → `Profile`

### `POST /profiles/:id/reconnect`
### `PATCH /profiles/:id` — `{ name?, rate_max? }`
### `DELETE /profiles/:id`

---

## Posts

### `GET /posts?status&profile_id&tag&search&cursor`
Returns paginated:
```ts
{
  posts: Post[];
  next_cursor: string | null;
  total_by_status: {
    all: number;
    scheduled: number;
    queued: number;
    draft: number;
    failed: number;     // Drives the "Failed (1)" filter count
  };
}

type Post = {
  id: string;
  text: string;
  profile_id: string;
  platform: "twitter" | "linkedin" | "facebook";
  status: "scheduled" | "queued" | "draft" | "published" | "failed";
  scheduled_at: string | null;
  published_at: string | null;
  failed_at: string | null;
  queue_id: string | null;          // If status === "queued", this is set
  error_message: string | null;     // Verbatim — surfaced in the expanded failed row (issue 13)
  retry_count: number;
  media: Array<{ url, type, alt }>;
  tags: string[];
  thread_position: number | null;   // If part of a thread
  spinnable: boolean;
  auto_destruct_at: string | null;
  internal_notes: string;
  created_at: string;
  updated_at: string;
};
```

### `POST /posts` — Create post or draft
### `PATCH /posts/:id`
### `DELETE /posts/:id`
### `POST /posts/:id/retry` — Re-attempt a failed publish
### `POST /posts/bulk` — `{ ids: string[], action: "delete" | "pause" | "resume" | "retag" | "reschedule", payload }`
### `POST /posts/import` — CSV upload; multipart form
Body: `{ target: "scheduled" | "queue", profile_id?, queue_id?, file }`
Returns: `{ imported: number, errors: Array<{row, message}> }`

---

## Queues

### `GET /queues`
```ts
type Queue = {
  id: string;
  name: string;
  profile_id: string;
  status: "active" | "paused";
  cadence: Cadence;                 // See below
  post_count: number;
  last_published_at: string | null;
  next_run_at: string | null;
  recycle: boolean;
  start_date: string | null;
  internal_notes: string;
  created_at: string;
};

type Cadence =
  | {
      mode: "specific";             // New mode — issue 8
      times: string[];              // ["08:00", "12:00", "15:00"]
      days: WeekDay[];              // ["Mon", "Tue", "Wed", "Thu", "Fri"]
    }
  | {
      mode: "fixed";
      every: number;
      unit: "hours" | "minutes";
      days: WeekDay[];
      hour_windows: number[];       // [8,9,10,11,12,13,14,15,16,17]
    }
  | {
      mode: "variable";
      every: number;
      unit: "hours" | "minutes" | "days";
      days: WeekDay[];
      hour_windows: number[];
    };

type WeekDay = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
```

### `GET /queues/:id`
### `GET /queues/:id/preview?count=5` — Returns next N publish times based on current cadence (server-side authoritative version of the client preview)
Returns: `{ times: string[] /* ISO timestamps */ }`

> Why server-side: the client preview is for UX feedback. The server must enforce the same algorithm when actually scheduling; expose `/preview` so client and server agree.

### `POST /queues`
### `PATCH /queues/:id`
### `DELETE /queues/:id`
### `POST /queues/:id/pause` / `POST /queues/:id/resume`
### `GET /queues/:id/posts?cursor` — Ordered list of posts in the queue
### `POST /queues/:id/reorder` — `{ post_id, new_position }`
### `POST /queues/:id/posts` — Add a post to the end

---

## Calendar

### `GET /calendar?start&end&profile_id&type`
- `type`: `scheduled` | `queued` | `both`
- Returns: `Array<{ id, profile_id, platform, text, scheduled_at, type: "scheduled" | "queued", queue_id?, queue_name? }>`

Calendar pulls a window of events; the client renders month/week/day views from the same response.

---

## Dashboard

### `GET /dashboard/timeline?hours=24`
Returns:
```ts
{
  scheduled_hours: number[];    // [9, 12, 14, 15, 17, 20]
  failed_hours: number[];       // [3]
  upcoming: Post[];             // First 4 about-to-publish
}
```

### `GET /dashboard/stats`
```ts
{
  scheduled_24h: number;
  scheduled_24h_delta: number;        // For trend "+3 vs yesterday"
  active_queues: number;
  total_queues: number;
  paused_queues: number;
  errors_7d: number;
  rate_headroom_pct: number;
  rate_resets_at: string;             // Single source for the dashboard footer
}
```

---

## Notifications

### `GET /notifications?status=all|unread|read&type=all|error|warning|info&cursor`
```ts
type Notification = {
  id: string;
  title: string;
  body: string;
  severity: "error" | "warning" | "info";
  related_post_id: string | null;     // For "View post" action on error rows
  related_profile_id: string | null;  // For "Reconnect" action on warning rows
  read: boolean;
  created_at: string;
};
```

### `GET /notifications/unread-count` — Lightweight poll endpoint for topbar bell badge
Returns: `{ count: number }`

### `POST /notifications/:id/read`
### `POST /notifications/mark-all-read`
### `POST /notifications/read-all` — Deprecated legacy alias
Deprecated: true. Sunset: `2026-08-01`. Prefer `POST /notifications/mark-all-read`.
### `POST /notifications/clear-read`
Returns: `{ ok: true, deleted: number }`

---

## Snippets

### `GET /snippets?search`
```ts
type Snippet = {
  id: string;
  name: string;        // mono, kebab-case, unique per user
  category: "Link" | "Hashtags" | "Text" | "Custom";
  body: string;
  updated_at: string;
};
```

### `POST /snippets` / `PATCH /snippets/:id` / `DELETE /snippets/:id`

---

## Settings

### `GET /settings/profile` — Current user profile info
### `PATCH /settings/profile` — `{ first_name, last_name, username, email, avatar_url? }`
### `GET /settings/preferences` — `{ timezone, date_format, entries_per_page, default_landing }`
### `PATCH /settings/preferences`
### `GET /settings/security` — `{ password_changed_at, two_factor_enabled, has_security_questions, last_login_at, last_login_location, active_sessions: number, stale_sessions: number }`
### `POST /settings/password` — `{ current, new }`
### `POST /settings/2fa/setup` → `{ secret, qr_code }`
### `POST /settings/2fa/verify` — `{ code }`
### `DELETE /settings/2fa`
### `GET /settings/notifications` — Per-event preferences
### `PATCH /settings/notifications` — `{ events: Record<string, { in_app, email }> }`
### `GET /settings/storage` — `{ used_bytes, total_files }`
### `GET /system/info` — `{ version, database, worker_status, redis_status, smtp_status, uptime_seconds }`
### `POST /system/export-all` — Streams a JSON dump
### `POST /system/reset` — DANGEROUS; wipes data

---

## Bull Board

No new API needed — Bull Board mounts itself at its existing route (`/admin/bull-board` or wherever the codebase already exposes it). The redesign just iframes that route inside the wrapper page.

The wrapper page additionally calls:
### `GET /admin/queue-health` (additive)
```ts
{
  publish: { active: number, completed: number, failed: number },
  notification: { active: number, completed: number, failed: number },
  bulk_ops: { active: number, completed: number, failed: number },
}
```

This drives the 3-card summary above the iframe so operators see queue health at a glance without diving into Bull Board itself.

---

## Realtime (optional but recommended)

If a websocket layer exists, the redesign benefits from realtime updates for:

- New notifications (push the unread count + new notification payload)
- Post status changes (a scheduled post becomes published or failed)
- Queue run events (queue published successfully, queue paused due to rate limit)

If no websocket exists, the topbar bell endpoint should be polled every 30s.

---

## Open questions

These are decisions the backend dev should make and document:

1. **Pagination strategy** — cursor or offset? The UI assumes cursor.
2. **Timezone handling** — server stores UTC; client converts using user's `timezone` preference? Confirm.
3. **CSV import async-ness** — does the import endpoint block until done, or return a job ID? UI assumes blocking with a synchronous `{imported, errors}` response.
4. **Rate-limit data freshness** — how often does the server update `rate_used`? UI assumes within ~30s of an actual publish.
5. **Spinnable text** — server-side rendering each variant when publishing, or client-side at compose time? Assume server-side at publish.
6. **Audit log** — does deleting a profile/queue/post leave a trail? Out of scope for this redesign but worth confirming.
