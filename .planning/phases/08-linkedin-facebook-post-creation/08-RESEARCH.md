# Phase 8: LinkedIn & Facebook Post Creation - Research

**Researched:** 2026-04-25
**Domain:** Multi-platform social publishing (LinkedIn Posts API + Facebook Graph API), discriminated-union schema design, per-platform rate-limit accounting, dashboard widget UX
**Confidence:** HIGH for codebase patterns; MEDIUM for LinkedIn rate-limit specifics; HIGH for LinkedIn/Facebook API surface

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Form architecture**
- **D-01:** One shared `NewPostPage` with platform-aware branching (no separate per-platform routes, no tab strip). Profile picker drives platform; platform-specific blocks (Twitter `ThreadEditor`, LinkedIn visibility selector, Facebook URL/video fields) mount conditionally based on `profile.platform`. Shared scaffolding (date picker, tags, schedule, auto-destruct, draft button, `CharacterCountRing`, `MediaDropZone`) stays one component. `EditPostPage` follows the same shape.
- **D-02:** Post payload schema becomes a Zod discriminated union keyed on `platform`: `z.discriminatedUnion('platform', [twitterPostSchema, linkedinPostSchema, facebookPostSchema])`. Each variant locks its own `text` max length, allowed media constraints, and platform-only fields (`visibility` for LinkedIn, `linkUrl`/`video` for Facebook). The existing single-shape `createPostSchema` becomes the `twitterPostSchema` variant. Type narrowing flows through API route, post service, worker — no `as` casts.
- **D-03:** Entry flow is profile-picker-drives-platform: single "New Post" button in nav; form opens with profile picker at top; choosing a profile sets `platform` and reveals subform.
- **D-04:** Cross-platform profile switch mid-compose preserves text, drops incompatible fields, warns inline. Text truncated to new platform's char limit if longer; platform-specific fields (visibility, linkUrl, thread parts past first, video on non-FB) are dropped; inline toast describes what changed.

**Rate-limit enforcement**
- **D-05:** Hard block at limit, warn at 90% (matches Twitter pattern). `publishPost` pre-flight refuses to publish when `currentCount >= limit` and logs a `post_attempts` row with `errorCode: 'rate_limit_exhausted'`. Banner appears in form at >= 90%. Consistent across all three platforms.
- **D-06:** Per-platform window tracked in `social_profiles` columns, reset by query (no scheduled reset job). New columns: `linkedin_daily_count`, `linkedin_window_start_utc`, `facebook_hourly_count`, `facebook_window_start_utc`. On every publish: check window expiry — if yes, atomically reset count to 0 and bump `window_start` before incrementing.
- **D-07:** Worker treatment when blocked: graceful abort, post stays `scheduled`, no retry consumed. Mirrors Phase 7's `token_unhealthy` abort exactly. Post auto-publishes once window rolls over and next scanner pass picks it up.
- **D-08:** No manual reset / admin override on rate-limit widget. Widget is read-only. Counters reset organically when windows roll over.

**Preview fidelity**
- **D-09:** Medium fidelity preview — structured layout, no brand polish. Card with avatar placeholder, profile name, faint visibility/timestamp line, post text with line breaks preserved, media in platform's grid order (LI: 1 stacked image; FB: 1/2/3/4-grid up to 10). Generic neutral styling — no brand colors, fonts, or fake engagement buttons.
- **D-10:** No live link unfurl fetching. URLs render as plain text in preview. Platform's actual unfurl happens at publish time. Avoids SSRF risk, opengraph parsing edge cases, per-keystroke HTTP fetches.
- **D-11:** Preview pinned beside form on desktop (>= 1024px), stacked below on smaller screens. Reuses existing `TweetPreview` layout pattern.
- **D-12:** Spinnable text `{a|b|c}` renders all variants highlighted inline in preview. `SpinnableVariantsDialog` covers the "show me each rolled outcome" use case.

**Usage widget placement**
- **D-13:** Usage widget appears in two places: a "Rate Limits" card on `/dashboard` listing every connected profile in a table (platform icon, profile name, current/limit, color bar, window-reset-at), AND a compact usage chip on each `ProfileCard` below the token-health badge. Both render the same shared component with different layout props.
- **D-14:** Widget shows window reset time formatted as relative + absolute, respecting user's configured timezone and date format from settings (e.g. "Resets in 47m (3:00 PM ET)" for FB hourly, "Resets in 8h (midnight UTC)" for LI daily).
- **D-15:** Widget is numeric-only for v1 — current/limit + color bar (green <50%, yellow 50–80%, red >80%) + reset time. No sparklines or activity charts.

### Claude's Discretion
- Specific column names for the new `social_profiles` rate-limit columns (so long as they follow existing snake_case convention).
- Exact wording of inline toasts and banner messages (so long as they match the platform-specific copy patterns established in Phase 7).
- Whether to fold the rate-limit widget component into `packages/web/src/components/posts/` (next to `RateLimitBanner`) or a new `dashboard/` folder.
- Drizzle migration filename and number (next available, currently `0006`).

### Deferred Ideas (OUT OF SCOPE)
- Activity-over-time charts on the dashboard (sparklines per profile, full per-platform timeline view, recent-publishes feed). Deferred to a future polish phase.
- Manual rate-limit window reset / override (admin debug). Useful when our counter drifts from platform's actual count, but power-user-only and not needed for v1.
- High-fidelity (screenshot-style) post preview. Heavy design work and risks staleness when platforms tweak their UI.
- Live link-unfurl fetching with og:image preview. Server-side fetch of opengraph metadata for URLs in post body. Needs SSRF mitigations.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POST-LI-01 | Create text-only LinkedIn share | LinkedIn Posts API `/rest/posts` with `commentary` only, no `content` block (§Standard Stack, §Code Examples) |
| POST-LI-02 | LinkedIn share with one image (JPG/GIF/PNG, max 20 MB) | Three-step image flow: `initializeUpload` → binary PUT → reference URN in post (§Pattern 2) |
| POST-LI-03 | Visibility selector: Anyone / Connections only | `visibility` field accepts `PUBLIC` or `CONNECTIONS` (§Code Examples, LinkedIn Posts API docs) |
| POST-LI-04 | Real-time char count, max 3,000 | Plain `.length` count (LinkedIn does not weight URLs/emojis); enforce client + server (§Pitfall 4) |
| POST-LI-05 | Live preview approximating LinkedIn rendering | Medium-fidelity per D-09; new `LinkedInPreview` component (§UI-SPEC) |
| POST-FB-01 | Text-only Facebook post | `POST /{page-id}/feed` with `message` only (§Standard Stack, §Code Examples) |
| POST-FB-02 | Facebook post with up to 10 images (JPG/GIF/PNG/BMP/TIFF, max 5 MB each) | Multi-photo: `POST /{page-id}/photos?published=false` per image, then `POST /{page-id}/feed` with `attached_media[]` (§Pattern 3) |
| POST-FB-03 | Facebook post with one video (max 100 MB) | `POST /{page-id}/videos` with `source` for files <= 100 MB; resumable upload for larger (out of scope at 100 MB cap) (§Pitfall 5) |
| POST-FB-04 | Optional URL on Facebook post | `link` parameter on `/{page-id}/feed` — Facebook generates unfurl preview server-side (§Code Examples) |
| POST-FB-05 | Real-time char count, max 63,206 | Plain `.length` count (§Pitfall 4) |
| POST-FB-06 | Live preview approximating Facebook rendering | Medium-fidelity per D-09; new `FacebookPreview` with image grid logic (§UI-SPEC) |
| LIMIT-06 | Facebook 200 Graph API calls/user/hour; backoff when approaching | Read `X-Page-Usage.call_count` after each API response; track local counter for pre-flight per D-06 (§Pattern 4, Pitfall 6) |
| LIMIT-07 | LinkedIn daily API call limits tracked; backoff when approaching | LinkedIn ~100 calls/day/member for posting endpoints; midnight UTC reset; track local counter per D-06 (§Pattern 4, Pitfall 7) |
| LIMIT-08 | Dashboard widget per profile, color-coded green <50%, yellow 50-80%, red >80% | New `RateLimitsCard` on `/dashboard`; new `RateLimitChip` on `ProfileCard`; both reuse `ProfileRateLimitIndicator` color logic (§UI-SPEC, §Code Examples) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

These directives bind every plan and task in Phase 8:

- **Module structure:** Factory functions (`createApp`, `createWorker`); no top-level side effects; env vars read inside functions, never at module scope; paths via `import.meta.url` not `process.cwd()`.
- **Error handling:** Every async op has explicit handling; no fire-and-forget promises; resource cleanup in `finally`; no empty catch blocks; wrap low-level errors with application context before rethrowing.
- **Naming:** `is`/`are`/`has`/`should` boolean prefixes; no abbreviations (`qc`, `sq`); domain-specific names (`linkedinDailyCount` not `count`); semantic state functions (`resetWindowIfExpired` not `reset`).
- **Validation:** Zod enums for enum-like fields; remove unused schema fields; multi-step DB mutations in transactions.
- **Type safety:** Import actual types from libraries; no `any` for external deps; explicit types for params/returns.
- **Testing:** Security-critical code (auth, encryption, rate-limit gating) at 100% branch coverage; test success AND failure paths; no conditional assertions; shared test setup in `__tests__/helpers/`; `vi.useFakeTimers()` for interval/timeout code.
- **Dependencies:** Production tilde (`~`); CLAUDE.md version specs match installed; shared patterns extracted to `@sms/shared`.
- **Worker package:** All logic in `async function main()` with top-level `.catch()`; `await redis.ping()` before starting work; `redis.quit()` not `disconnect()`.
- **API package:** `express.json({ limit: '1mb' })`; rate-limit credential-changing endpoints; CSRF via `req.session?.id ?? 'anonymous'`.
- **DB package:** `max: 1` for migrations, `max: 10` for app; `pgClient` not `sql`; cleanup in `finally`.
- **Web package:** Every page wraps content in `<main>`; semantic HTML before divs; WCAG AA contrast; ESLint suppressions need WHY comments.
- **Shared package:** Validate inputs before crypto calls; minimal public API.

## Summary

Phase 8 plugs LinkedIn and Facebook publishing into the publish-worker pipeline that already exists from Phase 4 (Twitter), inherits the post lifecycle, idempotency, and `post_attempts` shape unchanged, and extends the post schema and form to a discriminated union over `platform`. The Twitter publish service is the architectural template for the two new services: a single function that takes a profile + post text, decrypts credentials, calls the platform API, and returns `{ platformPostId }`. The lifecycle service `publishPost` already accepts a `callTwitter` callback — Phase 8 generalizes the dispatch by adding `callLinkedIn` and `callFacebook` callbacks selected by `post.platform` inside the publish-worker handler.

The high-risk areas are: (1) **Phase 7 dependency** — Phase 7 (LinkedIn/Facebook OAuth + token lifecycle) is **not yet built**; CONTEXT.md treats Phase 7 outputs as if they exist (`linkedin.service.ts`, `facebook.service.ts`, `oauth2_access_token_ciphertext` columns) — Phase 8 must verify Phase 7 is sequenced before it; (2) **per-platform rate-limit accounting** — LinkedIn does not publish exact daily limits in docs (community-reported ~100/day/member for posting); Facebook 200/hour is documented; the local counter is a best-effort approximation that must reconcile with `X-App-Usage` / `X-Page-Usage` response headers; (3) **Facebook multi-photo** — Facebook does NOT have a single "post N photos" endpoint; you upload each photo with `published=false`, collect `id`s, then `POST /feed` with `attached_media`; this is multi-step and must be atomic-ish; (4) **LinkedIn image upload** — three-step `initializeUpload` → PUT binary → reference URN flow; image URN is reusable for ~24h.

**Primary recommendation:** Build the two new platform services as factories returning `callLinkedIn(args)` / `callFacebook(args)` with the same shape as `callTwitter`. Keep `publishPost` lifecycle unchanged — only the `callPlatform` callback varies. Add a `LifecycleAbortReason` value `rate_limit_exhausted` and reuse the existing graceful-abort code path. Track per-platform window counters in new `social_profiles` columns updated transactionally inside `publishPost` after the API call returns success (D-06).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Profile picker drives `platform` | Browser (React Hook Form state) | API (read profiles list) | UI-only state; profile platform comes from already-loaded `useProfiles()` query |
| Discriminated-union post schema | Shared (Zod) | API (route validation) + Web (form resolver) | Single source of truth in `@sms/shared` so frontend and backend agree on shape |
| Live char count + preview rendering | Browser | — | Pure client-side; no API call per keystroke (D-10 forbids unfurl fetches) |
| LinkedIn API call (`POST /rest/posts`) | Worker | — | Network call lives in worker; matches Twitter pattern (decrypt → call → return platformPostId) |
| Facebook API call (`POST /{page}/feed`, `/{page}/photos`, `/{page}/videos`) | Worker | — | Same as above |
| LinkedIn image upload (3-step) | Worker | — | Performed inside `callLinkedIn` before the `/posts` call; URN passed as `content.media.id` |
| Facebook multi-photo upload | Worker | — | Performed inside `callFacebook`: upload each `published=false`, collect IDs, then create feed post |
| Per-platform rate-limit pre-flight (D-05) | API (POST /api/posts) + Worker (`publishPost`) | — | Pre-flight in route to fail fast; runtime re-check in worker mirrors Twitter `checkBudget` |
| Window reset (D-06: atomic CAS) | DB (Postgres conditional UPDATE) | — | `UPDATE ... WHERE window_start = ? RETURNING ...` inside transaction |
| Cross-platform profile switch field-drop (D-04) | Browser (pure helper function) | — | No persistence; in-memory form state transformation |
| Dashboard `/dashboard` route + `RateLimitsCard` | Browser (new page) | API (existing rate-limit GET extended with platform variants) | New SPA route; data via TanStack Query |
| `RateLimitChip` on `ProfileCard` | Browser | API | Compact widget; same data source as dashboard card |
| Sidebar nav new "Dashboard" entry | Browser | — | Static nav extension |

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `twitter-api-v2` | 1.29.x | Twitter publish (existing) | Already used by Phase 4. Untouched in Phase 8. [VERIFIED: npm view 1.29.0] |
| `facebook-nodejs-business-sdk` | 24.0.x | Facebook **Marketing/Ads** API | Listed as "blessed" in CLAUDE.md, but **important caveat**: this is Meta's Marketing/Business SDK, primarily for ads. Page publishing (`/feed`, `/photos`, `/videos`) is reachable via this SDK's `Page` and `PagePost` classes BUT the simpler path for plain page posting is direct HTTPS via `node:fetch` (§Pitfall 8). [VERIFIED: npm view 24.0.1] |
| `zod` | 3.25.x | Discriminated-union schema | `z.discriminatedUnion('platform', [...])` is the cleanest way to express D-02 |
| `react-hook-form` + `@hookform/resolvers` | 7.x / 5.x | Form state (existing) | Already used in `NewPostPage`; new platform branches use the same form context |
| `bullmq` + `ioredis` | 5.73.x / 5.10.x | Job queue (existing) | Same `publish` queue — only the dispatcher inside the handler picks the platform |
| Drizzle ORM + drizzle-kit | 0.45.x / 0.31.x | Schema migration `0006` for new columns | Existing migration pattern (`0005_phase-07-oauth-token-lifecycle.sql`) |
| `luxon` | 3.7.x | Timezone-aware reset-time formatting on dashboard widget | `DateTime.utc().endOf('day').setZone(userTz)` for "midnight UTC" display |

### New (Phase 8 additions)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| **none** | — | — | Phase 8 introduces zero new runtime dependencies. LinkedIn API uses `node:fetch` (built-in); Facebook API can use `node:fetch` (recommended) or the already-installed `facebook-nodejs-business-sdk` |
| `radio-group` (shadcn) | latest | LinkedIn visibility selector | UI-SPEC §Component Inventory (already declared) |
| `@types/facebook-nodejs-business-sdk` | latest | TypeScript types if SDK path is chosen | Optional — only if Facebook path uses the SDK over direct HTTPS |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct `fetch` for LinkedIn | `linkedin-api-client` (Microsoft official, 2023) | The official client is thin; LinkedIn's REST API churns frequently and direct `fetch` keeps you in control of headers (`LinkedIn-Version`, `X-Restli-Protocol-Version`). Direct fetch is the documented standard approach. [CITED: docs.microsoft.com Posts API] |
| `facebook-nodejs-business-sdk` for page posts | Direct `fetch` to `https://graph.facebook.com/v22.0/{page-id}/feed` | The SDK is Marketing-API-shaped; for plain Page publishing, the direct HTTPS approach is simpler, smaller surface area, and matches how the LinkedIn path will work. The SDK adds value for batch/cursor features Phase 8 doesn't need. **Recommend direct fetch for both platforms** — keeps the two services symmetric. [ASSUMED based on SDK's marketing focus per npm description] |
| `fbgraph` npm package | Direct `fetch` | `fbgraph` is a 2014-era wrapper, last meaningful update years ago. Avoid. [VERIFIED: npm view 1.4.4] |
| Shared LinkedIn/FB SDK abstraction | Direct platform-specific services | Premature abstraction. Twitter, LinkedIn, Facebook have non-isomorphic APIs (OAuth flow, image upload steps, response shapes). Keep three concrete services with the same `(args) => Promise<{platformPostId}>` signature. |

**Installation:**
```bash
# Phase 8 only — frontend
cd packages/web && pnpm dlx shadcn@latest add radio-group

# Phase 8 only — backend
# (none — node:fetch is built-in to Node 22)
```

**Version verification (run before plan execution):**
```bash
npm view facebook-nodejs-business-sdk version  # confirms 24.0.x still latest
npm view twitter-api-v2 version                # confirms 1.29.x still latest
```

## Architecture Patterns

### System Architecture Diagram

```
                     ┌─────────────────────────────────────────────────────┐
                     │                BROWSER (React)                       │
                     │                                                       │
   User picks ───────▶ ProfilePicker  ───── selects ───▶  platform field    │
   profile             (NewPostPage)         (form state, drives branching) │
                                                                              │
                            ▼                                                │
                     branches into one of:                                   │
                     ┌──────────────┐ ┌──────────────────┐ ┌──────────────┐│
                     │ Twitter      │ │ LinkedIn         │ │ Facebook     ││
                     │ subform      │ │ subform          │ │ subform      ││
                     │ (existing)   │ │ + Visibility     │ │ + URL field  ││
                     │              │ │ + 1-image limit  │ │ + 10-image   ││
                     │              │ │                  │ │   grid       ││
                     └──────┬───────┘ └────────┬─────────┘ └──────┬───────┘│
                            │                   │                   │       │
                            └───────────┬───────┴───────────────────┘       │
                                        ▼                                    │
                              POST /api/posts                                │
                              { platform: 'linkedin' | 'facebook' | 'twitter',
                                ...variant-specific fields }                 │
                     └────────────────────┬───────────────────────────────────┘
                                          │
                                          ▼
                     ┌─────────────────────────────────────────────────────┐
                     │                  API (Express)                       │
                     │                                                       │
                     │  routes/posts.ts                                     │
                     │    ↓                                                  │
                     │  parse body via createPostSchema (discriminated      │
                     │     union picks variant by `platform`)               │
                     │    ↓                                                  │
                     │  pre-flight: rate-limit.service.ts                   │
                     │    .checkPlatformBudgetWithDb(profileId, platform)   │
                     │    → if blockThresholdHit → 409 + body.code          │
                     │    → if warnThresholdHit → enqueue warn notification │
                     │    ↓                                                  │
                     │  post.service.ts createPost (insert posts row)       │
                     │    ↓                                                  │
                     │  publish-queue.service.ts enqueue 'publish' job      │
                     │     { postId, postVersion, correlationId }           │
                     └─────────────────────┬─────────────────────────────────┘
                                            │
                                  Redis (BullMQ 'publish' queue)
                                            │
                                            ▼
                     ┌─────────────────────────────────────────────────────┐
                     │             WORKER (BullMQ Worker)                   │
                     │                                                       │
                     │  publish-worker.ts handler                            │
                     │    ↓                                                  │
                     │  publishPost lifecycle (UNCHANGED):                  │
                     │    ↓ FOR UPDATE lock posts row                        │
                     │    ↓ check version, status, idempotency, media       │
                     │    ↓ NEW: per-platform rate-limit re-check           │
                     │    ↓ transition scheduled → publishing                │
                     │    ↓ release lock                                     │
                     │  callPlatform = dispatch on post.platform:           │
                     │    'twitter'  → callTwitter                           │
                     │    'linkedin' → callLinkedIn (NEW)                    │
                     │    'facebook' → callFacebook (NEW)                    │
                     │    ↓                                                  │
                     │  on success: insert post_attempts + update posts     │
                     │              + atomic per-platform counter increment │
                     │  on transient error: classified, retry via BullMQ    │
                     │  on permanent error: UnrecoverableError → failed     │
                     └─────────────────────┬─────────────────────────────────┘
                                            │
                                            ▼
                     ┌──────────────────┬──────────────────┐
                     │   LinkedIn       │   Facebook       │
                     │   /rest/posts    │   Graph API      │
                     │   (callLinkedIn) │   (callFacebook) │
                     │                  │                  │
                     │   3-step image   │   N-photo album: │
                     │   upload first   │   /photos×N then │
                     │   if image       │   /feed with     │
                     │   present        │   attached_media │
                     └──────────────────┴──────────────────┘
```

### Recommended Project Structure (additions to existing layout)

```
packages/
├── shared/src/
│   ├── schemas/
│   │   └── posts.ts                     # EXTEND: createPostSchema → discriminatedUnion
│   ├── lib/
│   │   ├── error-classifier.ts          # EXTEND: classifyLinkedInError, classifyFacebookError
│   │   └── platform-text-limits.ts      # NEW: { twitter: weighted, linkedin: 3000, facebook: 63206 }
│   └── rate-limit/
│       └── check-budget.ts              # EXTEND: checkLinkedInBudget, checkFacebookBudget
├── api/src/
│   ├── routes/posts.ts                  # EXTEND: dispatch pre-flight by platform
│   └── services/
│       ├── rate-limit.service.ts        # EXTEND: loadLinkedInUsage, loadFacebookUsage
│       ├── linkedin-publish-prep.service.ts  # NEW: pure helpers callable from API and worker
│       └── facebook-publish-prep.service.ts  # NEW: ditto
├── worker/src/
│   ├── publish-worker.ts                # EXTEND: dispatch by post.platform
│   ├── post-lifecycle.service.ts        # EXTEND: add 'rate_limit_exhausted' abort reason
│   ├── linkedin-publish.service.ts      # NEW: callLinkedIn(args) → {platformPostId}
│   └── facebook-publish.service.ts      # NEW: callFacebook(args) → {platformPostId}
├── db/src/
│   ├── schema/social-profiles.ts        # EXTEND: 4 new columns (LI/FB counter + window)
│   └── drizzle/0006_phase-08-rate-limit-windows.sql  # NEW: migration
└── web/src/
    ├── pages/dashboard/
    │   └── DashboardPage.tsx            # NEW: /dashboard route
    ├── components/
    │   ├── dashboard/
    │   │   └── RateLimitsCard.tsx       # NEW
    │   ├── posts/
    │   │   ├── ProfilePicker.tsx        # NEW
    │   │   ├── LinkedInPostFields.tsx   # NEW
    │   │   ├── FacebookPostFields.tsx   # NEW
    │   │   ├── TwitterPostFields.tsx    # NEW (extracted from current NewPostPage)
    │   │   ├── VisibilitySelector.tsx   # NEW (uses shadcn radio-group)
    │   │   ├── LinkedInPreview.tsx      # NEW
    │   │   ├── FacebookPreview.tsx      # NEW
    │   │   ├── RateLimitBanner.tsx      # EXTEND: platform prop
    │   │   └── RateLimitBlockError.tsx  # EXTEND: platform prop
    │   └── profiles/
    │       ├── RateLimitChip.tsx        # NEW (slots into ProfileCard)
    │       └── ProfileCard.tsx          # EXTEND: render RateLimitChip
    ├── pages/posts/
    │   ├── NewPostPage.tsx              # REFACTOR: branch by platform; mount field components
    │   └── EditPostPage.tsx             # REFACTOR: same branching; profile picker disabled
    └── components/layout/Sidebar.tsx    # EXTEND: add 'Dashboard' link with LayoutDashboard icon
```

### Pattern 1: Discriminated-Union Schema (D-02)

**What:** A single Zod schema that validates one of three platform-specific shapes based on a discriminator field.

**When to use:** Whenever the post payload, request body, or DB row needs platform-specific fields without runtime type narrowing via `as`.

```typescript
// packages/shared/src/schemas/posts.ts
import { z } from 'zod';

const sharedPostFields = {
  profileId: z.string().uuid('Invalid profile ID'),
  status: z.enum(['draft', 'scheduled']).default('draft'),
  scheduledAt: z.string().datetime().nullable().optional(),
  hasSpinnableText: z.boolean().default(false),
  autoDestructAfter: z.string().regex(/^\d+\s+(minutes?|hours?|days?|weeks?)$/, 'Must be a duration like "30 minutes", "24 hours", or "7 days"').max(50).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  tagIds: z.array(z.string().uuid()).default([]),
  mediaIds: z.array(z.string().uuid()).default([]),
};

const twitterPostSchema = z.object({
  platform: z.literal('twitter'),
  text: z.string().min(1).max(25_000),  // existing thread-aware max
  isThread: z.boolean().default(false),
  ...sharedPostFields,
});

const linkedinPostSchema = z.object({
  platform: z.literal('linkedin'),
  text: z.string().min(0).max(3_000),  // POST-LI-04
  visibility: z.enum(['PUBLIC', 'CONNECTIONS']).default('PUBLIC'),  // POST-LI-03
  ...sharedPostFields,
}).refine(
  (data) => data.text.length > 0 || data.mediaIds.length > 0,
  { message: 'LinkedIn share requires text or an image', path: ['text'] }
);

const facebookPostSchema = z.object({
  platform: z.literal('facebook'),
  text: z.string().min(0).max(63_206),  // POST-FB-05
  linkUrl: z.string().url().nullable().optional(),  // POST-FB-04
  ...sharedPostFields,
}).refine(
  (data) => data.text.length > 0 || data.mediaIds.length > 0 || !!data.linkUrl,
  { message: 'Facebook post requires text, media, or a link', path: ['text'] }
);

export const createPostSchema = z
  .discriminatedUnion('platform', [twitterPostSchema, linkedinPostSchema, facebookPostSchema])
  .refine(
    (data) => !(data.status === 'scheduled' && !data.scheduledAt),
    { message: 'scheduledAt is required when status is scheduled', path: ['scheduledAt'] }
  );

export type CreatePostInput = z.infer<typeof createPostSchema>;
```

**Note:** Update `updatePostSchema` similarly. Pre-existing `posts` table does NOT have a `platform` column today — derived from `social_profiles.platform` via JOIN. Phase 8 should either (a) denormalize `platform` onto `posts` for fast dispatch, or (b) JOIN at every read. Recommend option (a) for the worker hot path.

### Pattern 2: LinkedIn Three-Step Image Upload

**What:** LinkedIn requires images to be uploaded as separate "image assets" before being referenced in a post.

**When to use:** Inside `callLinkedIn` when `mediaIds.length > 0` (LI: max 1).

```typescript
// packages/worker/src/linkedin-publish.service.ts (sketch)
// Source: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api?view=li-lms-2026-03

const LINKEDIN_API_VERSION = '202604';  // YYYYMM, current at research time
const LINKEDIN_BASE = 'https://api.linkedin.com/rest';

async function uploadLinkedInImage(args: {
  accessToken: string;
  ownerUrn: string;          // 'urn:li:person:{id}' or 'urn:li:organization:{id}'
  imageBytes: Buffer;
}): Promise<{ imageUrn: string }> {
  // Step 1: initialize upload
  const initRes = await fetch(`${LINKEDIN_BASE}/images?action=initializeUpload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${args.accessToken}`,
      'LinkedIn-Version': LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      initializeUploadRequest: { owner: args.ownerUrn },
    }),
  });
  if (!initRes.ok) throw new LinkedInPublishError(`initializeUpload failed: ${initRes.status}`);
  const initJson = await initRes.json() as {
    value: { uploadUrl: string; image: string };
  };
  const { uploadUrl, image: imageUrn } = initJson.value;

  // Step 2: PUT binary to uploadUrl (no auth header — pre-signed)
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: args.imageBytes,
  });
  if (!putRes.ok) throw new LinkedInPublishError(`upload PUT failed: ${putRes.status}`);

  // Step 3: imageUrn is immediately usable in /rest/posts content.media.id
  return { imageUrn };
}
```

**Then create the post:**
```typescript
const postRes = await fetch(`${LINKEDIN_BASE}/posts`, {
  method: 'POST',
  headers: { /* same as above */ },
  body: JSON.stringify({
    author: ownerUrn,
    commentary: postText,
    visibility: visibility,        // 'PUBLIC' | 'CONNECTIONS'
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
    ...(imageUrn ? {
      content: { media: { id: imageUrn, title: '' } }
    } : {}),
  }),
});
// LinkedIn returns the post URN in `x-restli-id` header AND in the response body
const platformPostId = postRes.headers.get('x-restli-id') ?? '';
```
[CITED: learn.microsoft.com Posts API view=li-lms-2026-03]

### Pattern 3: Facebook Multi-Photo Post

**What:** Facebook does not have a "post with N photos" endpoint. You upload each photo with `published=false`, collect the photo IDs, then `POST /{page}/feed` with `attached_media[N]={"media_fbid":"<id>"}`.

**When to use:** Inside `callFacebook` when `mediaIds.length > 1` (FB: up to 10).

```typescript
// packages/worker/src/facebook-publish.service.ts (sketch)
// Source: https://developers.facebook.com/docs/graph-api/reference/page/photos/

const FB_GRAPH = 'https://graph.facebook.com/v22.0';

async function uploadUnpublishedPhoto(args: {
  pageId: string;
  pageAccessToken: string;
  imageBytes: Buffer;
  fileName: string;
}): Promise<{ photoId: string }> {
  const formData = new FormData();
  formData.append('source', new Blob([args.imageBytes]), args.fileName);
  formData.append('published', 'false');
  formData.append('access_token', args.pageAccessToken);

  const res = await fetch(`${FB_GRAPH}/${args.pageId}/photos`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new FacebookPublishError(`photo upload failed: ${res.status}`);
  const json = await res.json() as { id: string };
  return { photoId: json.id };
}

async function publishMultiPhotoPost(args: {
  pageId: string;
  pageAccessToken: string;
  message: string;
  photoIds: string[];
  link?: string;
}): Promise<{ platformPostId: string }> {
  const body: Record<string, unknown> = {
    message: args.message,
    access_token: args.pageAccessToken,
  };
  if (args.link) body.link = args.link;
  args.photoIds.forEach((photoId, idx) => {
    body[`attached_media[${idx}]`] = JSON.stringify({ media_fbid: photoId });
  });

  const res = await fetch(`${FB_GRAPH}/${args.pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body as Record<string, string>),
  });
  const json = await res.json() as { id: string };
  return { platformPostId: json.id };
}
```
[CITED: developers.facebook.com/docs/graph-api/reference/page/photos/]

### Pattern 4: Per-Platform Rate-Limit Window with Atomic Reset (D-06)

**What:** Use a conditional `UPDATE ... RETURNING` to either reset a stale window (count→0, window_start→now) or increment within the active window. Single SQL statement = atomic.

**When to use:** Inside `publishPost` lifecycle, in Phase 3 (after successful API call, before transitioning to `published`).

```sql
-- Reset-or-increment pattern, single statement (Phase 8 worker)
UPDATE social_profiles
SET
  linkedin_daily_count = CASE
    WHEN linkedin_window_start_utc < $window_threshold THEN 1
    ELSE linkedin_daily_count + 1
  END,
  linkedin_window_start_utc = CASE
    WHEN linkedin_window_start_utc < $window_threshold THEN $now
    ELSE linkedin_window_start_utc
  END
WHERE id = $profile_id
RETURNING linkedin_daily_count, linkedin_window_start_utc;
```

For Facebook (hourly window): `$window_threshold = now - INTERVAL '1 hour'`. For LinkedIn (daily window aligned to UTC midnight): `$window_threshold = date_trunc('day', now())`.

This is symmetric with how Phase 4 tracks Twitter monthly counters and avoids a scheduled reset job (D-06).

### Pattern 5: Worker Dispatch by Platform

**What:** Generalize the `publish-worker.ts` handler to pick the right `callPlatform` callback based on `post.platform` (denormalized column added in Phase 8).

```typescript
// packages/worker/src/publish-worker.ts (sketch of change)
import { callLinkedIn } from './linkedin-publish.service.js';
import { callFacebook } from './facebook-publish.service.js';

function getPlatformCaller(platform: 'twitter' | 'linkedin' | 'facebook') {
  switch (platform) {
    case 'twitter': return callTwitter;
    case 'linkedin': return callLinkedIn;
    case 'facebook': return callFacebook;
  }
}

// inside handler:
const callPlatform = getPlatformCaller(post.platform);
const result = await runPublish(deps.db, {
  ...
  callTwitter: (profile, postText, isThread) =>
    callPlatform({ profile, postText, isThread, ...platformSpecificArgs, correlationId: job.data.correlationId }),
  ...
});
```

**Refactor note:** The `callTwitter` callback name in `PublishContext` is a Phase-4-era misnomer. Rename to `callPlatform` as part of Phase 8 plan, or keep the name and accept the leakage. Recommend rename for clarity.

### Anti-Patterns to Avoid

- **Per-keystroke unfurl fetching for URL preview** — D-10 explicitly forbids this. SSRF risk + bad UX.
- **`as` casts on the post payload** — discriminated union narrowing must flow naturally; if you reach for `as`, the schema is wrong.
- **Sharing one HTTP client between LinkedIn calls and Facebook calls** — different headers, different retry semantics, different error shapes. Two separate functions, even if both use `fetch`.
- **Module-scope env var reads** — CLAUDE.md forbids it. Read `process.env.LINKEDIN_API_VERSION` inside the function.
- **Counting Facebook calls only when `publishPost` runs** — every API call (image upload, photo upload, feed post) consumes the 200/hour budget. Multi-photo post uses N+1 calls. Pre-flight must account for this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Twitter character counting | Custom URL/emoji counter | `twitter-text` (existing) | Twitter's weighting rules are non-trivial (URLs always 23 chars, emoji NFC, CJK weighting). LinkedIn/FB use plain `.length` so no library needed there. |
| HTTP client for LinkedIn | `axios` wrapper, retry library | `node:fetch` (built-in to Node 22) | LinkedIn's API errors are platform-specific; retries are owned by BullMQ; no third-party HTTP needed. |
| OAuth 2.0 token refresh | Custom refresh middleware | Whatever Phase 7 ships | Phase 7 owns token lifecycle. Phase 8 reads `oauth2_access_token_ciphertext`, decrypts, calls API. |
| Per-platform rate-limit math | New module | Extend `@sms/shared/rate-limit/check-budget.ts` | Pure calculator pattern already exists; add `checkLinkedInBudget` and `checkFacebookBudget` next to `checkTwitterBudget`. |
| Cross-platform field-drop logic | Imperative form mutation | Pure function `applyPlatformSwitch(oldPlatform, newPlatform, formState) → newFormState + droppedFields[]` | Pure function is unit-testable; UI-SPEC declares this as `CrossPlatformSwitchToast` helper. |
| Multipart upload to Facebook | `form-data` npm | Built-in `FormData` + `Blob` (Node 18+) | Modern Node has `FormData` natively. Avoid the legacy `form-data` package. |
| Image dimension validation for LinkedIn/Facebook | Re-implement | Reuse Phase 6 `sharp` pipeline | Already validates and resizes via `sharp`. Just configure platform-specific limits. |
| Date relative-time formatting ("Resets in 47m") | Custom | Luxon `DateTime.fromJSDate(d).toRelative({ unit: 'minutes' })` | Luxon already in dep tree for timezone work. |

**Key insight:** Three-quarters of Phase 8 is configuration changes to existing patterns (schema → discriminated union, rate-limit service → per-platform variants, post.platform column denormalized, dispatch in worker). The genuinely new code is the two `*-publish.service.ts` files in worker and the new dashboard page in web.

## Runtime State Inventory

This is a greenfield phase (new functionality on existing schema). No rename or migration discipline issues.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 8 adds new columns to `social_profiles` and a denormalized `platform` column on `posts`. No data migration needed for existing Twitter rows; default `posts.platform = 'twitter'` is safe via SQL `DEFAULT 'twitter'`. | Migration `0006_phase-08-rate-limit-windows.sql`: ALTER TABLE social_profiles ADD COLUMN linkedin_daily_count INT NOT NULL DEFAULT 0, etc. |
| Live service config | None | None — verified by checking Phase 7 has not shipped (no LinkedIn/Facebook OAuth apps registered yet) |
| OS-registered state | None | None — no Task Scheduler, pm2, or systemd entries reference these features |
| Secrets/env vars | New env vars expected from Phase 7: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI`. **Phase 8 introduces no new env vars** — but does need `LINKEDIN_API_VERSION` (default `202604`, configurable). | Add `LINKEDIN_API_VERSION` to `.env.example` and Docker Compose. |
| Build artifacts | None | None |

## Common Pitfalls

### Pitfall 1: Phase 7 dependency is unbuilt
**What goes wrong:** CONTEXT.md and UI-SPEC describe Phase 7 outputs (`linkedin.service.ts`, `facebook.service.ts`, `oauth2_access_token_ciphertext` columns, `tokenStatus`, `platformAccountId`) as if they exist. They do not — `packages/api/src/services/` has no `linkedin.service.ts` or `facebook.service.ts`, and `social_profiles` has only Twitter (`accessToken*`) credential columns.
**Why it happens:** Phases were planned in dependency order but Phase 7 was not executed before Phase 8 planning began.
**How to avoid:** Phase 8 cannot ship without Phase 7. Before any Phase 8 plan executes, verify Phase 7 is complete: `linkedin.service.ts` + `facebook.service.ts` exist with `publishLinkedInShare`/`publishFacebookPost` extension hooks; `social_profiles` has OAuth 2.0 columns for both platforms; `social_profiles.tokenStatus` enum exists. If Phase 7 is incomplete, Phase 8 plan must either (a) wait, or (b) absorb Phase 7's foundational pieces (OAuth flow excluded — only the schema + service stubs).
**Warning signs:** Plans reference `oauth2AccessTokenCiphertext` field — verify it exists before writing the plan task.

### Pitfall 2: Facebook calls × N — multi-photo posts blow the 200/hour budget fast
**What goes wrong:** A single user-visible "post 10 photos" action consumes 11 API calls (10 photo uploads + 1 feed post). At 200/hour budget, a user can publish ~18 multi-photo posts/hour before hitting the limit — but the UI only counts ONE post.
**Why it happens:** Multi-photo upload requires N unpublished photo POSTs followed by one feed POST.
**How to avoid:** Pre-flight `checkFacebookBudget` must compute `additionalCount = mediaIds.length + 1` for FB posts, not `1`. Document this in the rate-limit service. Do not display only "1 / 200" to the user — display the actual call count for the post they are about to send.
**Warning signs:** User reports "rate limit exceeded" after only a handful of multi-photo posts; per-call counter advances by ~10 per submission.

### Pitfall 3: LinkedIn rate-limit numbers are not officially published
**What goes wrong:** Plan locks "100 calls/day/member" as the LinkedIn limit; real limit is different (LinkedIn applies per-app + per-member limits, varies by endpoint, viewable only in the Developer Portal Analytics tab for the specific app).
**Why it happens:** LinkedIn does not publish exact rate-limit numbers in docs. [CITED: learn.microsoft.com rate-limits page]
**How to avoid:** (1) Make the LinkedIn daily limit user-configurable via `social_profiles.linkedin_daily_budget INT NOT NULL DEFAULT 100` — same pattern as `monthly_tweet_budget`. (2) Treat the local counter as an estimate and reconcile against any LinkedIn 429 response by setting a cooldown and surfacing a notification.
**Warning signs:** 429 from LinkedIn while local counter says "30/100"; user feedback that publishing stops earlier than the dashboard says.

### Pitfall 4: Plain `.length` is NOT the right count for emoji on Twitter, but IS correct for LinkedIn and Facebook
**What goes wrong:** `text.length` counts JavaScript UTF-16 code units, which split astral-plane emoji (`👨‍👩‍👧` = 11 code units, 1 grapheme). For Twitter this is replaced by `twitter-text` weighting. For LinkedIn and Facebook, the platforms count by **code points** (not graphemes, not UTF-16 units).
**Why it happens:** Spec ambiguity — "3,000 characters" doesn't say what a character is.
**How to avoid:** Use `[...text].length` (spread iterator counts code points) on the client and server for LinkedIn/Facebook char counts. This handles astral-plane emoji correctly. Don't use `text.length` (UTF-16 units) and don't pull in `grapheme-splitter` (unnecessary for platform parity).
**Warning signs:** User pastes a long emoji-heavy post that "fits" in our counter but Facebook rejects with 400; or our counter says "4,500 / 3,000 over" for a string LinkedIn would accept.

### Pitfall 5: Facebook video upload is multi-stage for files >= 1 GB; 100 MB cap (POST-FB-03) means single-stage works
**What goes wrong:** Plan tries to use the resumable upload API (3-step start/transfer/finish) when a single-stage `source` upload works for the 100 MB ceiling.
**Why it happens:** Facebook docs default to showing the resumable flow.
**How to avoid:** For files <= 100 MB, single-stage `POST /{page-id}/videos` with `source` (multipart) is the simplest path. Resumable is for the 1+ GB range. Phase 8 caps at 100 MB so always use single-stage.
**Warning signs:** Plan tasks reference `start_offset`, `end_offset`, `upload_phase=transfer`.

### Pitfall 6: Facebook `X-Page-Usage` resets per page, not per app
**What goes wrong:** Plan tracks one global "facebook_hourly_count"; user has two FB Pages connected; one page's usage doesn't affect the other but the local counter says it does.
**Why it happens:** Confusing `X-App-Usage` (app-wide, 200/hour total) with `X-Page-Usage` (per-page, 200/hour each). [CITED: developers.facebook.com/docs/graph-api/overview/rate-limiting/]
**How to avoid:** Track the rate-limit window per `social_profiles.id` (which is per-Page), not per-user or per-app. Local counter columns belong on `social_profiles`, not on `users`.
**Warning signs:** Two Facebook profiles share a counter; a publish on Page A blocks Page B.

### Pitfall 7: LinkedIn daily window aligns to UTC midnight, not "24 hours since first call"
**What goes wrong:** Plan implements rolling 24-hour window; LinkedIn resets at midnight UTC. Post published at 23:55 UTC + post published at 00:05 UTC count toward different windows even though they're 10 minutes apart.
**Why it happens:** Mistaking "daily limit" for "rolling 24-hour window."
**How to avoid:** Window threshold for LinkedIn: `date_trunc('day', now() AT TIME ZONE 'UTC')`. For Facebook: `now - INTERVAL '1 hour'` (Facebook IS rolling). Document this distinction in the rate-limit service.
**Warning signs:** User publishes at midnight UTC and counter doesn't reset; or counter resets unexpectedly at random times.

### Pitfall 8: facebook-nodejs-business-sdk is for Marketing API, not Page publishing
**What goes wrong:** Plan imports `PagePost` class from the SDK expecting a clean "publish to page" API; finds it's optimized for ad creative posts and adds Marketing-API auth concepts (system user tokens, business manager scope).
**Why it happens:** SDK is named "business-sdk" and CLAUDE.md lists it as the standard, but the actual scope is ads/marketing. Plain Page publishing is undocumented in the SDK readme.
**How to avoid:** Use `node:fetch` directly to `https://graph.facebook.com/v22.0/{page-id}/feed`. The SDK adds no value for plain Page publishing and increases coupling to Meta's marketing-API churn cycle. CLAUDE.md should be updated post-Phase-8 if the team agrees.
**Warning signs:** Plan tasks include "configure FacebookAdsApi.init()", "system user access token", "business manager".

### Pitfall 9: LinkedIn `author` URN differs for personal vs. company pages
**What goes wrong:** Code hardcodes `urn:li:person:{id}` for the post `author`; user connected a Company Page; LinkedIn rejects with "author must be an organization URN."
**Why it happens:** LinkedIn distinguishes Person URNs from Organization URNs.
**How to avoid:** Phase 7's profile schema must store both `linkedin_account_type` ('person' | 'organization') and `platform_account_id`. `callLinkedIn` constructs the URN: `urn:li:${type === 'person' ? 'person' : 'organization'}:${id}`.
**Warning signs:** All LinkedIn publishes work for the user's personal profile but fail for company pages.

### Pitfall 10: Cross-platform field-drop helper must handle `posts` already in DB during edit
**What goes wrong:** Edit page allows changing the profile (it shouldn't, per UI-SPEC: profile picker is disabled in edit mode); user changes from LinkedIn to Facebook; visibility field is dropped from form state but persisted `posts.visibility` column is left set.
**Why it happens:** Form state and DB state diverge.
**How to avoid:** UI-SPEC explicitly disables profile picker in edit mode (`Picker disabled — profile cannot be changed when editing an existing post`). Verify the API also rejects updates that change `platform`. The field-drop helper is for the new-post flow only.
**Warning signs:** Edit-page handlers call `applyPlatformSwitch`.

### Pitfall 11: Idempotency for Facebook multi-photo when partial failure occurs
**What goes wrong:** Photos 1-7 of 10 upload; photo 8 fails (network blip); on retry, photos 1-7 are re-uploaded creating orphaned unpublished photos.
**Why it happens:** Facebook unpublished photos persist on the page even if no feed post references them.
**How to avoid:** (1) Persist `photoIds[]` on the post row (`posts.facebook_unpublished_photo_ids JSONB`) after each successful upload; resume from where it left off on retry. (2) Periodically clean up orphaned unpublished photos via a maintenance job. **Phase 8 scope:** persist the IDs in a transient column; defer cleanup to Phase 11/polish. Document the orphan risk.
**Warning signs:** User reports "I see weird unpublished photos in my Page Insights"; storage on FB side accumulates.

### Pitfall 12: BullMQ retry can double-count the rate-limit window
**What goes wrong:** Worker calls FB, FB returns 200 + posts the photo, worker crashes before incrementing the counter; BullMQ retries; counter increments by 2.
**Why it happens:** Increment is not idempotent; relying on BullMQ-once is too optimistic.
**How to avoid:** Increment the counter ONLY when transitioning to `published` state (Phase 3 of the lifecycle). Idempotent guard already exists: if `platform_post_id` is set, the lifecycle short-circuits with `already_published` BEFORE re-running the API call or counter increment.
**Warning signs:** Counter advances faster than visible posts.

## Code Examples

### Discriminated-union schema validation in API route

```typescript
// packages/api/src/routes/posts.ts (sketch)
import { createPostSchema } from '@sms/shared';

router.post('/api/posts', requireAuth, async (req, res) => {
  const parsed = createPostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  // parsed.data.platform narrows the type:
  if (parsed.data.platform === 'linkedin') {
    // parsed.data.visibility is typed as 'PUBLIC' | 'CONNECTIONS'
    // parsed.data has no `linkUrl` field
  } else if (parsed.data.platform === 'facebook') {
    // parsed.data.linkUrl is typed as string | undefined
    // parsed.data has no `visibility` field
  }
  // ... per-platform pre-flight rate-limit check
});
```

### Per-platform rate-limit pre-flight in API route

```typescript
// Sketch — rate-limit.service.ts extension
export async function checkPlatformBudgetWithDb(
  db: Db,
  args: { profileId: string; platform: 'twitter' | 'linkedin' | 'facebook'; additionalCount: number },
): Promise<BudgetCheckResult> {
  switch (args.platform) {
    case 'twitter':  return checkTwitterBudgetWithDb(db, { profileId: args.profileId, additionalPostCount: args.additionalCount });
    case 'linkedin': return checkLinkedInBudgetWithDb(db, args);
    case 'facebook': return checkFacebookBudgetWithDb(db, args);  // additionalCount = mediaIds.length + 1
  }
}
```

### LinkedIn post creation (text only)

```typescript
// callLinkedIn for text-only POST-LI-01
// Source: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-03

const postRes = await fetch('https://api.linkedin.com/rest/posts', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'LinkedIn-Version': '202604',
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    author: ownerUrn,                  // 'urn:li:person:{id}' or 'urn:li:organization:{id}'
    commentary: postText,
    visibility: visibility,            // 'PUBLIC' | 'CONNECTIONS'
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  }),
});

if (!postRes.ok) {
  // Capture body for classifier
  const errBody = await postRes.text();
  throw new LinkedInPublishApiError(postRes.status, errBody);
}

// LinkedIn returns the post URN in 'x-restli-id' response header
const platformPostId = postRes.headers.get('x-restli-id') ?? '';
return { platformPostId };
```

### Facebook text-only post

```typescript
// callFacebook for text-only POST-FB-01
// Source: https://developers.facebook.com/docs/graph-api/reference/page/feed/

const formBody = new URLSearchParams({
  message: postText,
  access_token: pageAccessToken,
});
if (linkUrl) formBody.set('link', linkUrl);

const res = await fetch(`https://graph.facebook.com/v22.0/${pageId}/feed`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: formBody,
});

if (!res.ok) {
  const errJson = await res.json();
  throw new FacebookPublishApiError(res.status, errJson);
}

// Read X-Page-Usage to update local counter snapshot
const pageUsageHeader = res.headers.get('x-page-usage');
const pageUsage = pageUsageHeader ? JSON.parse(pageUsageHeader) as { call_count: number; total_cputime: number; total_time: number } : null;

const json = await res.json() as { id: string };  // id format: '{page-id}_{post-id}'
return { platformPostId: json.id, observedCallCount: pageUsage?.call_count };
```

### Cross-platform field-drop pure helper

```typescript
// packages/web/src/lib/cross-platform-switch.ts
// Source: derived from CONTEXT.md D-04 + UI-SPEC toast table

export interface PostFormState {
  platform: 'twitter' | 'linkedin' | 'facebook';
  text: string;
  isThread?: boolean;
  threadParts?: string[];
  visibility?: 'PUBLIC' | 'CONNECTIONS';
  linkUrl?: string | null;
  mediaIds: string[];
  hasVideo?: boolean;
  // ...shared fields
}

export interface SwitchResult {
  newState: PostFormState;
  toastMessage: string | null;
  textTruncated: boolean;
}

const PLATFORM_TEXT_LIMITS = {
  twitter: 25_000,    // thread-aware
  linkedin: 3_000,
  facebook: 63_206,
} as const;

const MAX_IMAGES_BY_PLATFORM = {
  twitter: 4,
  linkedin: 1,
  facebook: 10,
} as const;

export function applyPlatformSwitch(
  oldPlatform: 'twitter' | 'linkedin' | 'facebook',
  newPlatform: 'twitter' | 'linkedin' | 'facebook',
  state: PostFormState,
): SwitchResult {
  if (oldPlatform === newPlatform) {
    return { newState: state, toastMessage: null, textTruncated: false };
  }

  const newState = { ...state, platform: newPlatform };
  const dropped: string[] = [];

  // Truncate text
  const newLimit = PLATFORM_TEXT_LIMITS[newPlatform];
  const codePointCount = [...newState.text].length;
  let textTruncated = false;
  if (codePointCount > newLimit) {
    newState.text = [...newState.text].slice(0, newLimit).join('');
    textTruncated = true;
  }

  // Drop incompatible fields
  if (newPlatform !== 'linkedin') {
    if (newState.visibility) { delete newState.visibility; dropped.push('visibility'); }
  } else {
    newState.visibility = newState.visibility ?? 'PUBLIC';
  }
  if (newPlatform !== 'facebook') {
    if (newState.linkUrl) { newState.linkUrl = null; dropped.push('link'); }
    if (newState.hasVideo) { dropped.push('video'); /* mediaIds filtering below */ }
  }
  if (newPlatform !== 'twitter') {
    if (newState.isThread) { dropped.push('thread continuation'); newState.isThread = false; newState.threadParts = []; }
  }
  // Truncate media list to new platform's max
  const maxMedia = MAX_IMAGES_BY_PLATFORM[newPlatform];
  if (newState.mediaIds.length > maxMedia) {
    newState.mediaIds = newState.mediaIds.slice(0, maxMedia);
    dropped.push('extra media');
  }

  // Compose toast (matches UI-SPEC table)
  const toastMessage = dropped.length > 0 || textTruncated
    ? composeToastMessage(oldPlatform, newPlatform, dropped, textTruncated, newLimit)
    : null;

  return { newState, toastMessage, textTruncated };
}
```

### Rate-limit usage chip (frontend, mirrors `ProfileRateLimitIndicator`)

```typescript
// packages/web/src/components/profiles/RateLimitChip.tsx
// Source: extends pattern from ProfileRateLimitIndicator.tsx

import { useRateLimit } from '../../hooks/use-rate-limit';
import { formatResetTime } from '../../lib/format-reset-time';

export function RateLimitChip({ profileId, platform }: { profileId: string; platform: 'twitter' | 'linkedin' | 'facebook' }) {
  const { data, isLoading } = useRateLimit(profileId, platform);
  if (isLoading) return <Skeleton className="h-5 w-32 rounded-full" />;
  if (!data) return <span className="text-xs text-muted-foreground">Limit unavailable</span>;

  const percent = data.budget > 0 ? Math.round((data.currentCount / data.budget) * 100) : 0;
  const state = percent >= 80 ? 'block' : percent >= 50 ? 'warn' : 'ok';
  const dotClass = { ok: 'bg-[--color-success]', warn: 'bg-[--color-warning]', block: 'bg-destructive' }[state];
  const textClass = { ok: '', warn: 'text-[--color-warning]', block: 'text-destructive' }[state];
  const resetText = formatResetTime(data.windowResetAt, platform);

  return (
    <span
      className="inline-flex items-center gap-1 text-xs"
      aria-label={`${platform}: ${data.currentCount} of ${data.budget} used, resets in ${resetText}`}
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${dotClass}`} />
      <span className={textClass}>{data.currentCount}/{data.budget}</span>
      <span className="text-muted-foreground"> · Resets in {resetText}</span>
    </span>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LinkedIn UGC Posts API (`/v2/ugcPosts`) | LinkedIn Posts API (`/rest/posts`) with versioned headers | 2023; UGC API marked legacy | Use `/rest/posts` with `LinkedIn-Version: YYYYMM` header. UGC API still works for compliance but is not the "current" path. [CITED: learn.microsoft.com versioning guide] |
| LinkedIn Vector Asset upload | LinkedIn Images API (`/rest/images?action=initializeUpload`) | 2023 | Use the Images API; Vector Asset is legacy. [CITED: learn.microsoft.com Images API page] |
| Facebook v15.0 Graph API | Facebook v22.0 Graph API | 2024 (per ~3-month version bump cadence) | Use latest stable; Page publishing endpoints have been stable across versions. Latest version at research time: **v22.0**. Bump as Meta deprecates older versions (~24-month support window). |
| Facebook album-creation flow | Unpublished-photo + `attached_media` | API v7+ | New album creation removed from Graph API; multi-photo posts use unpublished photos. [CITED: developers.facebook.com/docs/graph-api/reference/page/photos/] |
| `node-fetch` package | Built-in `node:fetch` (Node 18+) | Node 18 LTS | Project uses Node 22 LTS; no `node-fetch` install needed. |
| `form-data` package | Built-in `FormData` + `Blob` | Node 18 LTS | Use built-ins. |
| `twitter-text` for all platforms | `twitter-text` for Twitter; `[...text].length` for LinkedIn/Facebook | — | LinkedIn/FB count code points, not weighted Twitter chars. |

**Deprecated/outdated:**
- `fbgraph` npm package (2014, abandoned) — use `node:fetch`
- `node-linkedin` / `node-linkedin-v2` (5+ years stale) — use `node:fetch` per CLAUDE.md
- LinkedIn UGC Posts API — use `/rest/posts`
- Facebook Album endpoint — use unpublished photos + `attached_media`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | LinkedIn rate limit is ~100 calls/day/member for posting endpoints | Pitfall 3, LIMIT-07 | Counter may drift from actual; mitigated by 429 reconciliation. Make limit user-configurable. |
| A2 | `facebook-nodejs-business-sdk` is unsuitable for plain Page publishing (Marketing API focus) | Standard Stack alternatives, Pitfall 8 | If SDK actually has a clean Page publishing path, missing an opportunity to centralize HTTP. Low risk — direct fetch is also fine. |
| A3 | LinkedIn returns post URN in `x-restli-id` response header | Code Examples | If header name changed, fallback to parsing response body. Mitigation: always check both. |
| A4 | Facebook v22.0 is the current stable Graph API version as of research date | State of the Art | If a newer version is available, use it; if v22.0 is sunset, must bump. Verify with `https://developers.facebook.com/docs/graph-api/changelog` before plan execution. |
| A5 | `posts` table needs a denormalized `platform` column for hot-path dispatch | Pattern 1, Pattern 5 | Could JOIN against `social_profiles.platform` instead. Denormalization is faster but adds a write-time invariant. Recommend denormalize. |
| A6 | Phase 7 will deliver `social_profiles.tokenStatus` enum and OAuth 2.0 columns | Pitfall 1, Architecture | Phase 8 is blocked if Phase 7 hasn't shipped these. |
| A7 | LinkedIn image URN is reusable for ~24h after upload | Pattern 2 | If shorter-lived, retry-on-stale-URN logic needed. Documented elsewhere as 24h. |
| A8 | Facebook unpublished photos with no parent post live indefinitely until deleted | Pitfall 11 | Storage cost on FB side; not our problem unless Page Insights complains. Defer cleanup. |
| A9 | LinkedIn limit reset is at midnight UTC (not rolling 24h) | Pitfall 7 | If rolling, our SQL window-threshold logic is wrong. [CITED: liseller.com confirms midnight UTC reset] |
| A10 | Facebook Page access token (long-lived, never expires) is what Phase 7 will store | Architecture | Short-lived tokens would force refresh logic on every call; long-lived is the standard for Page publishing. |

**Recommended user confirmations before plan locking:**
- A1 (LinkedIn limit) — confirm 100 is an acceptable default; user can override per-profile.
- A4 (Facebook API version) — confirm v22.0 vs latest at execution time.
- A6 (Phase 7 ordering) — confirm Phase 7 ships before Phase 8 plan execution begins.
- A8 (orphaned FB photos) — confirm "defer cleanup" is acceptable for v1.

## Open Questions

1. **Phase 7 ordering vs. Phase 8 planning**
   - What we know: Phase 7 (LinkedIn/Facebook OAuth + token lifecycle) is roadmap-listed as Phase 8's dependency; CONTEXT.md treats Phase 7 outputs as existing.
   - What's unclear: Whether Phase 7 has been planned (`.planning/phases/07-*` directory does not exist).
   - Recommendation: Confirm with user that Phase 7 will be planned-and-executed before Phase 8 plan execution starts. If not, Phase 8 planner must absorb the schema parts of Phase 7 (oauth columns, tokenStatus) into Phase 8's first plan.

2. **Twitter `posts` rows backfill for `platform` column**
   - What we know: Phase 8 adds `posts.platform` denormalized column; existing rows have no value.
   - What's unclear: Whether existing Twitter posts should be backfilled via `UPDATE posts SET platform = 'twitter'` migration or whether `DEFAULT 'twitter'` + nullable-during-migration is sufficient.
   - Recommendation: `DEFAULT 'twitter' NOT NULL` in the migration — existing rows get the default during ALTER. Single-statement, atomic, safe.

3. **Whether LinkedIn `commentary` field needs special escaping**
   - What we know: LinkedIn Posts API docs show plain text in `commentary`.
   - What's unclear: Whether mentions (`@username`) or hashtags need URL escaping or special URN-like markup.
   - Recommendation: For Phase 8, post plain text as-is. LinkedIn renders hashtags client-side. Mentions require entity-resolution which is out of scope.

4. **Whether the Dashboard route should auth-gate behind `requireAuth` middleware**
   - What we know: `/dashboard` is a new SPA route; existing routes (`/posts`, `/profiles`, `/queues`) are auth-gated.
   - What's unclear: Implicit yes per the SidebarLayout pattern, but should be made explicit.
   - Recommendation: Wrap `/dashboard` in the same auth-guarded layout as other authenticated routes.

5. **Facebook video transcoding output format**
   - What we know: Phase 6 transcode worker outputs MP4. Facebook accepts MP4.
   - What's unclear: Whether FB-specific transcoding constraints (max bitrate, codec) require new ffmpeg presets.
   - Recommendation: Reuse Phase 6 default MP4 output; if FB rejects, add a `transcodePreset` per platform in a follow-up phase.

## Environment Availability

> Phase 8 has no new external dependencies beyond what Phase 6 + Phase 7 already require.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 LTS | All packages | ✓ (verified by Phase 1) | 22.x | — |
| PostgreSQL 17 | DB migration `0006` | ✓ (Phase 1 Docker Compose) | 17 | — |
| Redis 7.4 | BullMQ publish queue (existing) | ✓ (Phase 1) | 7.4 | — |
| ffmpeg | Phase 6 transcode worker (FB video uses it) | ✓ (Phase 6 Dockerfile) | — | — |
| LinkedIn Developer App credentials | OAuth + Posts API | ✗ (user must register) | — | Phase 7 captures these — Phase 8 assumes they exist |
| Facebook App credentials + Page access token | OAuth + Graph API | ✗ (user must register) | — | Phase 7 captures these |
| Reachable HTTPS callback for OAuth | Phase 7 (not Phase 8) | ✓ (Phase 1 nginx + TLS) | — | — |

**Missing dependencies with no fallback:** LinkedIn + Facebook app registrations (responsibility of Phase 7).

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `packages/*/vitest.config.ts` (per-package) |
| Quick run command | `pnpm --filter @sms/<package> test -- --run path/to/file.test.ts` |
| Full suite command | `pnpm test` (root) or `pnpm -r test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POST-LI-01 | Text-only LinkedIn share creates a `posts` row with `platform='linkedin'`, scheduled and published via worker | unit + integration | `pnpm --filter @sms/api test posts.test.ts -- --run` | ❌ Wave 0 |
| POST-LI-02 | LinkedIn share with image: `callLinkedIn` performs initializeUpload + PUT + posts call | unit | `pnpm --filter @sms/worker test linkedin-publish.test.ts -- --run` | ❌ Wave 0 |
| POST-LI-03 | Visibility selector form value passes through to `commentary` API call | unit | `pnpm --filter @sms/web test VisibilitySelector.test.tsx -- --run` | ❌ Wave 0 |
| POST-LI-04 | Char count uses code-point count, blocks >3000 client + 400 server | unit | `pnpm --filter @sms/shared test platform-text-limits.test.ts -- --run` | ❌ Wave 0 |
| POST-LI-05 | LinkedInPreview renders text + visibility + image | unit | `pnpm --filter @sms/web test LinkedInPreview.test.tsx -- --run` | ❌ Wave 0 |
| POST-FB-01 | Text-only FB post creates `posts` row, publishes via worker | integration | `pnpm --filter @sms/api test posts.test.ts -- --run` | ❌ Wave 0 |
| POST-FB-02 | Multi-image FB post: 10 unpublished photo uploads + 1 feed POST with `attached_media` | unit | `pnpm --filter @sms/worker test facebook-publish.test.ts -- --run` | ❌ Wave 0 |
| POST-FB-03 | Single video FB post: single-stage `/videos` POST | unit | same | ❌ Wave 0 |
| POST-FB-04 | URL field passes through to `link` Graph API parameter | unit | same | ❌ Wave 0 |
| POST-FB-05 | Char count uses code-point count, blocks >63206 client + 400 server | unit | same as POST-LI-04 | ❌ Wave 0 |
| POST-FB-06 | FacebookPreview renders text + URL + image grid (1/2/3/4 + N>4 layout) | unit | `pnpm --filter @sms/web test FacebookPreview.test.tsx -- --run` | ❌ Wave 0 |
| LIMIT-06 | FB pre-flight blocks at 200/hour; counter increments by `mediaIds.length + 1`; window resets atomically | unit + integration | `pnpm --filter @sms/api test rate-limit.test.ts -- --run` | ❌ Wave 0 |
| LIMIT-07 | LI pre-flight blocks at user-configured daily limit; window resets at UTC midnight | unit + integration | same | ❌ Wave 0 |
| LIMIT-08 | Dashboard widget shows correct color band per percent thresholds | unit | `pnpm --filter @sms/web test RateLimitsCard.test.tsx -- --run` | ❌ Wave 0 |
| (cross-cutting) | `applyPlatformSwitch` correctly drops fields and truncates text per UI-SPEC toast table | unit | `pnpm --filter @sms/web test cross-platform-switch.test.ts -- --run` | ❌ Wave 0 |
| (cross-cutting) | Discriminated union schema rejects mixed-platform payloads | unit | `pnpm --filter @sms/shared test posts.test.ts -- --run` | ❌ Wave 0 (extension of existing) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @sms/<package> test -- --run path/to/touched.test.ts`
- **Per wave merge:** `pnpm test` (full suite, all packages)
- **Phase gate:** Full suite green + manual smoke-test of one LI publish + one FB multi-image publish before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/worker/src/__tests__/linkedin-publish.test.ts` — covers POST-LI-01, POST-LI-02, POST-LI-03 (worker side); MSW for LinkedIn API
- [ ] `packages/worker/src/__tests__/facebook-publish.test.ts` — covers POST-FB-01..04 (worker side); MSW for Graph API; multi-photo flow
- [ ] `packages/api/src/services/__tests__/rate-limit.test.ts` — extend with LinkedIn + Facebook variants; window-reset tests
- [ ] `packages/web/src/components/posts/__tests__/LinkedInPreview.test.tsx`
- [ ] `packages/web/src/components/posts/__tests__/FacebookPreview.test.tsx`
- [ ] `packages/web/src/components/posts/__tests__/VisibilitySelector.test.tsx`
- [ ] `packages/web/src/components/dashboard/__tests__/RateLimitsCard.test.tsx`
- [ ] `packages/web/src/lib/__tests__/cross-platform-switch.test.ts` — pure helper, all 6 switch directions × text-truncation cases per UI-SPEC toast table
- [ ] `packages/shared/src/schemas/__tests__/posts.test.ts` — extend with discriminated-union test cases (rejects unknown `platform`, rejects mixed fields)
- [ ] `packages/shared/src/lib/__tests__/platform-text-limits.test.ts` — code-point counting (astral-plane emoji, ZWJ sequences, plain ASCII)
- [ ] MSW handler set for LinkedIn `/rest/posts`, `/rest/images?action=initializeUpload`, and the pre-signed PUT URL
- [ ] MSW handler set for Facebook `/{page}/feed`, `/{page}/photos`, `/{page}/videos`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Phase 7 owns OAuth flows. Phase 8 reads decrypted tokens via existing AES-256-GCM `decrypt()` (Phase 1) |
| V3 Session Management | no | No new session surface |
| V4 Access Control | yes | Pre-flight & all profile reads MUST scope by `userId` (existing pattern in `post.service.ts`) — already covered |
| V5 Input Validation | yes | Zod discriminated union; URL validation for FB `linkUrl`; visibility enum for LI |
| V6 Cryptography | yes | Reuse `decrypt()` from `@sms/shared/encryption`; never log plaintext tokens |
| V7 Error Handling and Logging | yes | Error classifier MUST NOT leak access token, page ID query strings, or LinkedIn URN format that exposes account_id |
| V12 File Resource | yes | Image/video upload size enforced server-side per `PLATFORM_MEDIA_LIMITS`; existing `multer` config |
| V13 API Security | yes | Outbound: never trust user-supplied `pageId` in URL — derive from authenticated profile only. Inbound: existing CSRF middleware applies to POST /api/posts |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User submits a `profileId` they don't own to publish on someone else's account | Spoofing / Elevation | Existing pattern: every profile lookup includes `eq(socialProfiles.userId, userId)` in WHERE — verified in `post.service.ts:71` |
| Plaintext OAuth token leaks via logs or error messages | Information Disclosure | Existing pattern: `twitter-publish.service.ts` declares plaintext as `const` inside one function, never returned, never logged. Mirror exactly in LI/FB services |
| Replay of `mediaIds` cross-profile — user A's media attached to user B's post | Tampering | `media.service.ts` `associateMediaToPost` MUST verify mediaIds belong to the same `profileId` (extend existing check if not present) |
| SSRF via FB `linkUrl` — user submits `http://localhost:8080/admin` | Tampering | We never fetch the link server-side (D-10). Facebook fetches it client-side at publish — their problem. Validation: only `http`/`https` schemes allowed via Zod `.url()` |
| LinkedIn API rate-limit information disclosure (counter response leaks usage of other users' apps) | Information Disclosure | Counters scoped per `social_profiles.id`, which is per-user. No cross-user data |
| Cross-platform field bypass — user crafts request with `platform: 'twitter'` body fields but `profileId` of a LinkedIn profile | Tampering | API route MUST verify `parsed.data.platform === ownedProfile.platform` before persisting; mismatch → 400 |
| Encryption key compromise | (out of scope) | Phase 1 already requires `ENCRYPTION_KEY` env var with rotation via `token_encryption_version` column |

## Sources

### Primary (HIGH confidence)
- LinkedIn Posts API — https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-03 — endpoint, headers, payload shape, visibility values
- LinkedIn Images API — https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api?view=li-lms-2026-03 — initializeUpload flow, image URN format
- LinkedIn API Versioning — https://learn.microsoft.com/en-us/linkedin/marketing/versioning?view=li-lms-2026-03 — YYYYMM format, current versions
- LinkedIn Rate Limits — https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits — per-app + per-member structure, no published numbers
- Facebook Graph API Rate Limiting — https://developers.facebook.com/docs/graph-api/overview/rate-limiting/ — X-App-Usage, X-Page-Usage shape
- Facebook Page Photos — https://developers.facebook.com/docs/graph-api/reference/page/photos/ — unpublished photo + attached_media flow
- Facebook Page Feed — https://developers.facebook.com/docs/graph-api/reference/page/feed/ — message, link, attached_media parameters
- npm `facebook-nodejs-business-sdk` v24.0.1 — verified via `npm view`
- npm `twitter-api-v2` v1.29.0 — verified via `npm view`
- Project codebase: `packages/worker/src/twitter-publish.service.ts`, `packages/worker/src/post-lifecycle.service.ts`, `packages/worker/src/publish-worker.ts`, `packages/api/src/services/rate-limit.service.ts`, `packages/api/src/services/post.service.ts`, `packages/shared/src/schemas/posts.ts`, `packages/db/src/schema/social-profiles.ts`, `packages/web/src/pages/posts/NewPostPage.tsx`, `packages/web/src/components/profiles/ProfileRateLimitIndicator.tsx`

### Secondary (MEDIUM confidence)
- LiSeller Blog on LinkedIn Rate Limits — https://www.liseller.com/linkedin-growth-blog/how-to-handle-linkedin-api-rate-limits — confirms midnight UTC reset, ~100/day/member estimate
- DEV Community LinkedIn API Guide (Mayank CSE) — https://dev.to/mayankcse/mastering-linkedin-api-step-by-step-guide-for-seamless-integration-124n — confirms direct fetch pattern, no SDK
- Marcus Noble blog on LinkedIn Posts API — https://marcusnoble.co.uk/2025-02-02-posting-to-linkedin-via-the-api/ — practical example of /rest/posts with full payload
- Phyllo LinkedIn API Guide 2026 — https://www.getphyllo.com/post/linkedin-api-ultimate-guide-on-linkedin-api-integration — current ecosystem state
- Bitoff LinkedIn Posts API breakdown — https://www.bitoff.org/linkedin-posts-api/ — pros/cons of /rest/posts vs ugcPosts

### Tertiary (LOW confidence — flagged for validation)
- LinkedIn ~100 calls/day/member for posting (A1) — community-reported, not in official docs. Mitigated by user-configurable budget.
- Facebook v22.0 as current version (A4) — assumed from version-bump cadence; verify `https://developers.facebook.com/docs/graph-api/changelog` before plan execution.
- LinkedIn image URN reusability ~24h (A7) — assumed. Worth probing in plan implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via `npm view`; LinkedIn endpoints verified via Microsoft Learn (2026-03 view).
- Architecture / pattern reuse: HIGH — read existing Twitter service, lifecycle, schema directly.
- LinkedIn rate-limit specifics: MEDIUM — official docs intentionally vague; community sources used. Mitigated via user-configurable budget.
- Facebook API surface: HIGH — well-documented, many examples in research.
- Cross-platform field-drop logic: HIGH — pure function, fully derivable from UI-SPEC toast table.
- Pitfall coverage: HIGH — based on direct reading of platform docs + community gotchas.
- Phase 7 dependency: BLOCKER — Phase 7 not yet built; Phase 8 plan must verify before execution.

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (30 days for stable APIs); LinkedIn version header may need bump to a newer YYYYMM if more than ~3 months pass.
