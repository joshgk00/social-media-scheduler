# Phase 8: LinkedIn & Facebook Post Creation - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

User can compose, preview, schedule, and publish LinkedIn shares (text or text+1 image, with visibility selector, 3,000-character cap, live preview) and Facebook posts (text + up to 10 images + 1 video + optional URL, 63,206-character cap, live preview) through the same publish-worker pipeline Twitter already uses. Dashboard widget exposes per-platform rate-limit usage across all connected profiles. Out of scope: Twitter post creation (Phase 3/4), token health UX (Phase 7), CSV bulk operations (Phase 10), search/calendar (Phase 11).

</domain>

<decisions>
## Implementation Decisions

### Form architecture

- **D-01:** One shared `NewPostPage` with platform-aware branching (no separate per-platform routes, no tab strip). The existing `packages/web/src/pages/posts/NewPostPage.tsx` gains a profile picker that drives the platform; platform-specific blocks (Twitter `ThreadEditor`, LinkedIn visibility selector, Facebook URL/video fields) mount conditionally based on `profile.platform`. Shared scaffolding (date picker, tags, schedule, auto-destruct, draft button, `CharacterCountRing`, `MediaDropZone`) stays one component. `EditPostPage` follows the same shape.
- **D-02:** Post payload schema becomes a Zod discriminated union keyed on `platform`: `z.discriminatedUnion('platform', [twitterPostSchema, linkedinPostSchema, facebookPostSchema])`. Each variant locks its own `text` max length, allowed media constraints, and platform-only fields (`visibility` for LinkedIn, `linkUrl`/`video` for Facebook). The existing single-shape `createPostSchema` becomes the `twitterPostSchema` variant. Type narrowing flows through the API route, post service, and worker — no `as` casts.
- **D-03:** Entry flow is **profile-picker drives platform**: user clicks a single "New Post" button in the nav; the form opens with the profile picker at the top; choosing a profile sets `platform` and reveals the platform-specific subform. Avoids duplicating the entry point in nav.
- **D-04:** Cross-platform profile switch mid-compose **preserves text, drops incompatible fields, warns inline**: text content carries over (truncated to the new platform's char limit if longer); platform-specific fields (visibility, linkUrl, thread parts past the first, video on non-FB) are dropped; an inline toast describes what changed (`"Switched to LinkedIn — visibility set to Anyone, video removed."`).

### Rate-limit enforcement

- **D-05:** Hard block at limit, warn at 90% (matches Twitter pattern). `publishPost` pre-flight check refuses to publish when `currentCount >= limit` and logs a `post_attempts` row with `errorCode: 'rate_limit_exhausted'`. Banner appears in the form at >= 90% usage. Consistent across all three platforms.
- **D-06:** Per-platform window tracked in `social_profiles` columns, reset by query (no scheduled reset job). New columns: `linkedin_daily_count`, `linkedin_window_start_utc`, `facebook_hourly_count`, `facebook_window_start_utc`. On every publish: check if window has expired — if yes, atomically reset count to 0 and bump `window_start` before incrementing. Mirrors how Twitter's monthly budget works in spirit, but per-platform window cadences (hour for FB, day for LI) live on the row, not in a scheduler.
- **D-07:** Worker treatment when blocked: graceful abort, post stays `scheduled`, no retry consumed. Mirrors Phase 7's `token_unhealthy` abort exactly. Post auto-publishes once the window rolls over and the next scanner pass picks it up.
- **D-08:** No manual reset / admin override on the rate-limit widget. Widget is read-only. Counters reset organically when windows roll over.

### Preview fidelity

- **D-09:** Medium fidelity preview — structured layout, no brand polish. Card with avatar placeholder, profile name, faint visibility/timestamp line, post text with line breaks preserved, media in the platform's grid order (LI: 1 stacked image; FB: 1/2/3/4-grid up to 10). Generic neutral styling — no brand colors, fonts, or fake engagement buttons.
- **D-10:** No live link unfurl fetching. URLs render as plain text in the preview. The platform's actual unfurl happens at publish time. Avoids SSRF risk, opengraph parsing edge cases, and per-keystroke HTTP fetches.
- **D-11:** Preview pinned beside the form on desktop (>= 1024px), stacked below the form on smaller screens. Reuses the layout pattern from the existing `TweetPreview`.
- **D-12:** Spinnable text `{a|b|c}` renders **all variants highlighted inline** in the preview (e.g. "Hello [a|b|c] world"), matching the existing Twitter preview behavior. The `SpinnableVariantsDialog` (shipped in Phase 5) covers the "show me each rolled outcome" use case.

### Usage widget placement

- **D-13:** Usage widget appears in **two places**: a "Rate Limits" card on `/dashboard` listing every connected profile in a table (platform icon, profile name, current/limit, color bar, window-reset-at), and a compact usage chip on each `ProfileCard` below the token-health badge. Both render the same shared component with different layout props. Satisfies LIMIT-08's "dashboard widget" wording while keeping the in-context view on the Profiles page.
- **D-14:** Widget shows window reset time formatted as relative + absolute, respecting the user's configured timezone and date format from settings (e.g. "Resets in 47m (3:00 PM ET)" for FB hourly, "Resets in 8h (midnight UTC)" for LI daily).
- **D-15:** Widget is numeric-only for v1 — current/limit + color bar (green <50%, yellow 50–80%, red >80%) + reset time. No sparklines or activity charts. Activity-over-time visualizations are deferred to a future polish phase.

### Claude's Discretion

- Specific column names for the new `social_profiles` rate-limit columns (so long as they follow existing snake_case convention).
- Exact wording of inline toasts and banner messages (so long as they match the platform-specific copy patterns established in Phase 7).
- Whether to fold the rate-limit widget component into `packages/web/src/components/posts/` (next to `RateLimitBanner`) or a new `dashboard/` folder.
- Drizzle migration filename and number (next available, currently `0006`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements (project-level)

- `.planning/ROADMAP.md` §"Phase 8: LinkedIn & Facebook Post Creation" — phase goal, success criteria, requirements list (POST-LI-01..05, POST-FB-01..06, LIMIT-06..08)
- `.planning/REQUIREMENTS.md` §"Post Creation — LinkedIn (POST-LI)" — line 72-78 — char limits, visibility options, image rules
- `.planning/REQUIREMENTS.md` §"Post Creation — Facebook (POST-FB)" — line 80-87 — char limits, image/video/URL rules
- `.planning/REQUIREMENTS.md` §"Post Creation — Common Fields (POST-CMN)" — line 89-98 — schedule, spinnable, auto-destruct, drafts, conflict warning
- `.planning/REQUIREMENTS.md` §"Rate limits (LIMIT)" — line 155-157 — LI/FB rate-limit numbers and dashboard widget contract
- `.planning/PROJECT.md` — vision, encryption-at-rest, free-tier constraints, Twitter pay-per-use note

### Phase 7 outputs that Phase 8 builds on

- `.planning/phases/07-multi-platform-profiles-token-lifecycle/07-CONTEXT.md` — locked decisions for OAuth, token lifecycle, profile data shape
- `.planning/phases/07-multi-platform-profiles-token-lifecycle/07-VERIFICATION.md` — confirms profile-row contract: `tokenStatus`, `platformAccountId`, `oauth2AccessTokenCiphertext`, `nextScheduledAt`
- `packages/api/src/services/linkedin.service.ts` — `buildAuthorizeUrl`, `exchangeAuthorizationCode`, `fetchPostableOrgs` (already shipped — Phase 8 adds `publishLinkedInShare`)
- `packages/api/src/services/facebook.service.ts` — `exchangeShortLivedToken`, `fetchUserPages`, `pingPageToken` (Phase 8 adds `publishFacebookPost`)
- `packages/worker/src/post-lifecycle.service.ts` — `publishPost` token-health pre-flight pattern (Phase 8 adds rate-limit pre-flight using the same shape)
- `packages/worker/src/twitter-publish.service.ts` — reference for the new `linkedin-publish.service.ts` and `facebook-publish.service.ts` services

### Existing post-creation surface (Phase 3/4/5/6)

- `packages/shared/src/schemas/posts.ts` — current `createPostSchema` / `updatePostSchema` (Twitter-shaped) — refactored to discriminated union in Phase 8
- `packages/shared/src/schemas/rate-limit.ts` — `rateLimitUpdateSchema` / `rateLimitStateSchema` (Twitter monthly budget) — extended with platform variant in Phase 8
- `packages/web/src/pages/posts/NewPostPage.tsx` and `EditPostPage.tsx` — the form components that gain the platform-aware branching
- `packages/web/src/components/posts/` — reusable form pieces: `CharacterCountRing`, `MediaDropZone`, `MediaThumbnailGrid`, `TweetPreview`, `ThreadEditor`, `ScheduleConflictBanner`, `RateLimitBanner`, `RateLimitBlockError`, `AutoDestructPicker`, `TagSelector`, `PostStatusBadge`
- `packages/api/src/services/post.service.ts` — service that the new platform branches plug into
- `packages/api/src/services/rate-limit.service.ts` — Twitter monthly budget service; extended with LI/FB methods in Phase 8
- `packages/web/src/components/profiles/TokenHealthBadge.tsx` — pattern for the new rate-limit usage chip on `ProfileCard`

### LinkedIn / Facebook API references

- LinkedIn Posts API — `/rest/posts` endpoint, headers `Authorization`, `LinkedIn-Version: YYYYMM`, `X-Restli-Protocol-Version: 2.0.0`. Direct HTTP, no maintained Node SDK. Researcher should confirm the latest stable `LinkedIn-Version` value.
- Facebook Graph API — `facebook-nodejs-business-sdk` v24.0.x, `PagePost` class for page posting. Pinned via env in Phase 7's setup.
- LinkedIn rate limits — daily call quota; researcher to confirm exact tier (POST-LI requirement says "daily API call limits tracked").
- Facebook rate limits — 200 Graph API calls/user/hour per LIMIT-06.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `CharacterCountRing.tsx` — already supports a `max` prop; just pass 3000 / 63206 for LI / FB. Twitter still uses `twitter-text` weighted counting; LI/FB use simple `.length`.
- `MediaDropZone.tsx` and `MediaThumbnailGrid.tsx` — already handle multi-image uploads with thumbnails. Need new prop to enforce platform-specific limits (1 for LI, up to 10 for FB) and per-image size (20 MB for LI, 5 MB for FB) at the client + server.
- `transcode-worker.ts` (Phase 6) — handles video transcoding for any platform; FB video at 100 MB plugs into the existing pipeline with FB-specific output constraints.
- `RateLimitBanner.tsx` and `RateLimitBlockError.tsx` — rebrand-and-extend with platform-aware copy and threshold checks.
- `ScheduleConflictBanner.tsx`, `AutoDestructPicker.tsx`, `TagSelector.tsx`, `TagManagementDialog.tsx` — reused as-is across platforms (POST-CMN-01..08).
- `SpinnableVariantsDialog.tsx` (Phase 5) — works for any platform's text body; reused.
- `oauth.service.ts`, `linkedin.service.ts`, `facebook.service.ts` (Phase 7) — token + auth plumbing, augmented with publish methods.
- `TokenHealthBadge.tsx` (Phase 7) — visual pattern to mirror for the rate-limit usage chip on `ProfileCard`.

### Established Patterns

- **Discriminated union over flag fields:** the worker classification (`LifecycleAbortReason`) and OAuth events already use union types. Schema follow-up is consistent.
- **Conditional UPDATE with `RETURNING id` for idempotency:** Phase 7 established the pattern for token notifications (`UPDATE ... WHERE tokenStatus = 'active' RETURNING id`). Phase 8 reuses this for rate-limit window resets — atomic CAS-style update prevents double-counting under concurrent publishes.
- **Pre-flight checks inside `publishPost` before state transition:** profile load → check predicate → log `post_attempts` row → return abort reason; worker treats abort reasons listed in `publish-worker.ts` as graceful (no retry consumed). Phase 8 adds `rate_limit_exhausted` to that list.
- **Two-column form + preview, sticky right pane on desktop:** existing pattern from `NewPostPage` / `EditPostPage`. The new LI / FB previews drop into the same pane.
- **Drizzle migrations versioned with `NULLS NOT DISTINCT` on multi-column unique constraints:** Phase 7 established this in `0005_phase-07-oauth-token-lifecycle.sql`. Phase 8's migration follows the same conventions.

### Integration Points

- `packages/web/src/pages/posts/NewPostPage.tsx` — entry point; platform branching mounts here.
- `packages/api/src/routes/posts.ts` — POST handler picks the right discriminated-union variant from the body.
- `packages/api/src/services/post.service.ts` — `createPost` / `updatePost` accept the union and platform-narrow before persisting.
- `packages/worker/src/publish-worker.ts` — the platform dispatcher reads `post.platform` and calls the corresponding `publish-*-service.ts`.
- New worker services to add: `packages/worker/src/linkedin-publish.service.ts`, `packages/worker/src/facebook-publish.service.ts`.
- `packages/web/src/pages/dashboard/` — does not currently exist (no dashboard route). Phase 8 introduces `/dashboard` with the rate-limit summary card. Sidebar nav gains a "Dashboard" entry.
- `packages/web/src/components/profiles/ProfileCard.tsx` — the usage chip slots in below `TokenHealthBadge`.

</code_context>

<specifics>
## Specific Ideas

- "Resets in 47m (3:00 PM ET)" / "Resets in 8h (midnight UTC)" — preferred wording for the rate-limit reset display.
- Inline toast on cross-platform profile switch should describe exactly what was dropped (e.g. `"Switched to LinkedIn — visibility set to Anyone, video removed."`) rather than a generic warning.
- Color bar on rate-limit widget: green <50%, yellow 50–80%, red >80% (matches LIMIT-08 wording).
- Match the medium-fidelity preview's avatar placeholder style to whatever `TokenHealthBadge` uses for visual consistency on `ProfileCard`.

</specifics>

<deferred>
## Deferred Ideas

- **Activity-over-time charts on the dashboard** — sparklines per profile, full per-platform timeline view, recent-publishes feed. Deferred to a future polish phase. Surfaces well after the core is stable.
- **Manual rate-limit window reset / override (admin debug)** — useful when our counter drifts from the platform's actual count, but power-user-only and not needed for v1. Add to backlog if drift becomes a real problem.
- **High-fidelity (screenshot-style) post preview** — brand fonts, blue link styling, real opengraph unfurl card, FB action buttons row. Heavy design work and risks staleness when platforms tweak their UI. Revisit if the medium-fidelity preview proves insufficient in real use.
- **Live link-unfurl fetching with og:image preview** — server-side fetch of opengraph metadata for URLs in the post body. Needs SSRF mitigations and edge-case handling. Defer until we hit a real user pain point.

</deferred>

---

*Phase: 08-linkedin-facebook-post-creation*
*Context gathered: 2026-04-25*
