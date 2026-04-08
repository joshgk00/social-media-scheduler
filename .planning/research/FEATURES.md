# Feature Research

**Domain:** Self-hosted social media scheduling (SocialOomph replacement)
**Researched:** 2026-04-07
**Confidence:** HIGH (PRD is comprehensive; competitor landscape well-documented)

## Feature Landscape

### Table Stakes (Users Expect These)

Features the user (single operator) assumes exist. Missing these = the tool fails its core purpose as a SocialOomph replacement.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Twitter/X OAuth connection | Primary platform; entire tool starts here | MEDIUM | OAuth 1.0a still works for posting. User already owns a Developer App. PRD specifies Consumer Key + Secret + Access Token + Secret. Pay-per-use ($0.01/post) is the new default for new devs since Feb 2026 -- free tier is discontinued. |
| Post creation (text, images, thread) | Core purpose of the app | MEDIUM | Twitter threads via `[[tweet]]` separator are a SocialOomph parity feature. Character counting via `twitter-text` npm library is non-negotiable for Twitter. |
| Schedule a post for a specific date/time | Minimum viable scheduling | LOW | Date/time picker respecting user's IANA timezone. All storage in UTC. |
| Post state machine (draft/scheduled/publishing/published/failed) | Need to know what happened to posts | MEDIUM | Optimistic locking (`post_version`) prevents publishing stale edits. This is infrastructure, not UI chrome -- get it right early. |
| Background scheduling worker | Posts don't publish themselves | HIGH | BullMQ + Redis. Must run independently of web process. Retry logic (exponential backoff, max 3), dead letter queue, stalled job detection, idempotency via `platform_post_id`. This is the hardest part of the entire app. |
| Scheduled posts list with filtering | Must see what's scheduled and manage it | LOW | Filter by network, status, tag, profile. Paginated. Per-post actions: edit, delete, view history. |
| Queue system with schedule config | Core SocialOomph workflow -- persistent post pools that publish on a repeating schedule | HIGH | Queue config: interval, days-of-week, hour windows, start date, seasonal window. Queue posts cycle through and optionally recycle. This is the second hardest feature. |
| Queue post management (reorder, CRUD) | Useless queue if you can't manage its contents | LOW | Move up/down, add/remove, edit. |
| Post recycling in queues | Core SocialOomph feature -- evergreen content loops | LOW | After publish, move post to end of queue. Toggle per-post. |
| Draft posts | Save work-in-progress without committing to a schedule | LOW | Status `draft`, not picked up by worker. Promotable to `scheduled` or `queued`. |
| User auth (login, password, settings) | Single-user app still needs auth (exposed via network) | LOW | Username/password, timezone, date format, entries-per-page. |
| Health check endpoint | Docker orchestration needs it; debugging needs it | LOW | `GET /health` returning Redis/Postgres/worker status. Docker Compose healthcheck config. |
| Structured logging with correlation IDs | Debugging publish failures without this is miserable | LOW | JSON logs, correlation IDs through HTTP request to BullMQ job chain. Never log tokens. |
| Media upload (images) | Twitter posts with images are >50% of usage | MEDIUM | JPG/PNG/GIF/WEBP, max 4 images per tweet. Thumbnail generation. Local filesystem storage via Docker volume. |
| Character counting (twitter-text) | Posting over-length tweets silently fails at the API | LOW | `twitter-text` npm package handles URL shortening (23 chars), CJK double-counting, emoji rules. Real-time UI counter. |
| Token encryption at rest | OAuth tokens in plaintext DB = security incident waiting to happen | MEDIUM | AES-256-GCM, IV + auth tag stored alongside. Encryption key from env var only. Key rotation via version column. |

### Differentiators (Competitive Advantage)

Features that set this self-hosted tool apart from SaaS alternatives. These are the reasons to build your own vs. paying for Buffer/Hootsuite.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Spinnable text `{opt1\|opt2}` | Avoid duplicate content penalties on X. SocialOomph's signature feature that most competitors lack. | LOW | Resolve at publish time by random selection. Multiple spin groups per post. In SocialOomph, spinnable text only works in queue posts -- consider same constraint or expand to scheduled posts. |
| Auto-destruct posts | Time-limited tweets/Facebook posts. Uncommon feature, direct SocialOomph parity. | MEDIUM | Schedule a delete API call after configured duration. Twitter DELETE is straightforward. LinkedIn has no native scheduled delete -- worker handles it. |
| Own your data and credentials | No vendor lock-in, no subscription, no data mining | LOW | This is architectural, not a feature to build. It's the reason the project exists. |
| Own Developer App credentials | User controls their own Twitter API access. Not subject to a SaaS app's rate limits or suspended app key. | LOW | Already the design. Store per-profile: Consumer Key, Consumer Secret, Access Token, Access Token Secret. |
| Bulk queue operations (randomize, purge, copy, text modify, deduplicate) | Power-user queue management that SaaS tools rarely offer | MEDIUM | Async jobs for large queues. Randomize order, purge all, copy between queues, bulk find/replace text, remove duplicates. |
| CSV bulk upload/download | Manage hundreds of posts outside the UI. SocialOomph parity. | MEDIUM | Upload: CSV with scheduling options. Download: export for backup. Note: media not supported in user-created CSVs (only in app-exported CSVs). |
| Webhooks (inbound HTTP POST) | IFTTT/automation integration. Unique for a personal tool. | MEDIUM | Unique URL per webhook, HMAC-SHA256 signature verification, IP allowlist, rate limiting. Requires publicly accessible endpoint (Cloudflare Tunnel). |
| AI post generation (OpenAI) | Bulk-generate queue content from topic + persona + tone. | MEDIUM | User supplies own OpenAI API key (never persisted). Generate 1-50 posts as drafts for review. Defer this -- it's a nice-to-have, not core. |
| Calendar view | Visual scheduling across profiles. Common in SaaS, uncommon in self-hosted. | HIGH | Monthly/weekly/daily views, color-coded by platform, click-to-create, conflict detection (5-min window). This is significant UI work. |
| Hashtag sets and text snippets | Reusable content fragments for quick insertion. | LOW | CRUD for snippets, "Insert Snippet" button on post forms, `{{snippet:name}}` syntax in CSV uploads. |
| Full-text post search | Find posts across all content. | LOW | PostgreSQL `tsvector` + GIN index. No external search engine needed for single-user. |
| 2FA (TOTP) | Security hardening for a network-accessible tool | LOW | QR code setup, TOTP validation. Not strictly required for Phase 1 but good to have. |

### Anti-Features (Deliberately NOT Building)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Multi-user / team features | "What if someone else needs access?" | Full auth rearchitecture (roles, permissions, data isolation). Single-user is the design constraint -- adding multi-user later means rewriting auth, data models, and every query. | Stay single-user. If collaboration is ever needed, a second instance is simpler. |
| Blog/RSS feed integration | SocialOomph had it | Significant scope increase for a feature the user explicitly said isn't needed. RSS parsing, content extraction, scheduling from feeds -- each is its own subsystem. | Out of scope per PRD. |
| Mobile app | "What about posting from my phone?" | Self-hosted on local network, not a public SaaS. Mobile would require public exposure, responsive native UI, push notifications. | Web UI is responsive enough for occasional mobile use via browser. |
| Personal Facebook profile posting | "Why only Pages?" | Facebook API restrictions on personal profiles are severe and constantly changing. Meta actively blocks automated personal posting. Pages API is stable and supported. | Facebook Pages only, as PRD specifies. |
| Analytics / post performance | "How are my posts doing?" | Requires pulling engagement data (likes, retweets, comments) from each platform API. Twitter read API calls cost money ($0.005/read). Adds ongoing API usage costs for a feature that doesn't help with scheduling. | Check engagement directly on each platform. Not the job of a scheduling tool. |
| Link shortening / UTM management | "Track click-throughs" | Another subsystem (URL shortener service, redirect tracking, analytics dashboard). Use Bitly or UTM.io externally. | External link shortener. Paste shortened URLs into posts. |
| Real-time social listening | "Monitor mentions and replies" | Requires Twitter streaming API (Enterprise tier at $42K+/month). Completely different product category. | Not a scheduler feature. Use Twitter/X directly. |
| Additional platforms (Bluesky, Discord, Mastodon, etc.) | "Support all the platforms" | Each platform = separate OAuth flow, API client, post format handler, rate limit tracker, media requirements. Scope explosion. | Start with Twitter. Add LinkedIn + Facebook in Phase 2. Re-evaluate others only if the three core platforms are solid. |

## Feature Dependencies

```
[User Auth + Settings]
    |
    +---> [Social Profile Connection (Twitter OAuth)]
    |         |
    |         +---> [Post Creation (Twitter)]
    |         |         |
    |         |         +---> [Character Counting (twitter-text)]
    |         |         +---> [Post Preview (Twitter)]
    |         |         +---> [Media Upload + Storage]
    |         |         |         |
    |         |         |         +---> [Video Transcoding (ffmpeg)]
    |         |         |
    |         |         +---> [Spinnable Text Resolution]
    |         |
    |         +---> [Scheduled Posts List + Filtering]
    |         |         |
    |         |         +---> [Tags]
    |         |         +---> [Post Search (tsvector)]
    |         |
    |         +---> [Background Worker (BullMQ)]
    |                   |
    |                   +---> [Post State Machine]
    |                   +---> [Retry Logic + Dead Letter Queue]
    |                   +---> [Queue Scheduling Engine]
    |                   |         |
    |                   |         +---> [Queue System CRUD]
    |                   |         +---> [Queue Post Management]
    |                   |         +---> [Post Recycling]
    |                   |
    |                   +---> [Auto-Destruct (scheduled delete)]
    |                   +---> [Token Lifecycle (refresh/monitor)]
    |                   +---> [Rate Limit Tracking]
    |
    +---> [Notification System]
    |         |
    |         +---> [In-app Bell + Dropdown]
    |         +---> [Email via SMTP]
    |
    +---> [Draft Posts] (no worker dependency)

[LinkedIn OAuth] --requires--> [Social Profile Connection] + [Post Creation (LinkedIn)]
[Facebook OAuth] --requires--> [Social Profile Connection] + [Post Creation (Facebook)]

[Calendar View] --requires--> [Scheduled Posts] + [Queue System]
[CSV Bulk Upload] --requires--> [Post Creation] + [Queue System]
[Bulk Queue Ops] --requires--> [Queue System]
[AI Generation] --requires--> [Queue System] + [Draft Posts]
[Webhooks] --requires--> [Post Creation] + [Queue System] + [HTTPS/Tunnel]
[Hashtag Sets / Snippets] --enhances--> [Post Creation]
```

### Dependency Notes

- **Post Creation requires Social Profile Connection:** Can't create a post without a connected account to publish to.
- **Background Worker requires Post State Machine:** The worker drives state transitions. Building the state machine first (even without the worker) lets you test post lifecycle in isolation.
- **Queue Scheduling Engine requires Queue System CRUD:** Queue config (interval, days, hours) must exist before the engine can evaluate schedules.
- **Calendar View requires both Scheduled Posts and Queue System:** Calendar must show both one-time scheduled posts and queue-scheduled runs. Building it before both are working means showing an incomplete picture.
- **AI Generation requires Queue System + Draft Posts:** Generated posts land as drafts in a queue. Both subsystems must exist.
- **Webhooks require HTTPS:** Facebook and LinkedIn OAuth callbacks already need HTTPS. Webhooks also need a publicly accessible endpoint, which means Cloudflare Tunnel or equivalent must be configured.
- **Rate Limit Tracking enhances Background Worker:** Rate limits inform the worker's decision to skip or proceed. Can be added incrementally -- start with basic tracking, add pre-flight checks later.

## MVP Definition

### Launch With (Phase 1: Core Scheduling + Queue + Twitter)

The minimum viable SocialOomph replacement that validates the entire stack.

- [ ] User auth (login, password, timezone, date format preferences) -- gate everything behind this
- [ ] Twitter/X profile connection via OAuth 1.0a (user's own Developer App credentials) -- the single most important integration
- [ ] Post creation for Twitter (text, images up to 4, thread via `[[tweet]]` separator) -- core functionality
- [ ] Character counting with `twitter-text` npm library -- prevents silent API failures
- [ ] Media upload + local filesystem storage + thumbnail generation -- images are >50% of tweets
- [ ] Post state machine (draft -> scheduled -> publishing -> published -> failed) -- correctness foundation
- [ ] Background scheduling worker (BullMQ + Redis) with retry logic, dead letter queue, stalled job detection -- the engine
- [ ] Scheduled posts list with status filtering -- must see and manage what's scheduled
- [ ] Draft posts -- save work without committing
- [ ] Queue system (CRUD, schedule config: interval, days-of-week, hour windows) -- core SocialOomph workflow
- [ ] Queue post management (add, edit, delete, reorder) -- manage queue contents
- [ ] Post recycling in queues -- evergreen content loops
- [ ] Spinnable text `{opt|opt}` resolution at publish time -- SocialOomph signature feature, differentiator
- [ ] Token encryption at rest (AES-256-GCM) -- non-negotiable security
- [ ] Health check endpoint (`GET /health`) -- operational baseline
- [ ] Structured JSON logging with correlation IDs -- debuggability
- [ ] Rate limit tracking for Twitter (usage count vs. limit, warn at threshold) -- avoid hitting API limits
- [ ] Docker Compose deployment (web, worker, postgres, redis, nginx) -- the deployment target

### Add After Validation (Phase 2: Multi-Platform + Notifications)

Features to add once core Twitter scheduling and queuing are proven solid.

- [ ] LinkedIn profile connection (Personal Profile + Company Page) via OAuth -- second priority platform
- [ ] LinkedIn post creation (text, single image, visibility control) -- platform-specific form
- [ ] Facebook Page connection via OAuth -- third priority platform
- [ ] Facebook post creation (text, images up to 10, video, URL) -- platform-specific form
- [ ] OAuth token lifecycle management (health monitoring, auto-refresh for LinkedIn/Facebook) -- needed once non-Twitter tokens that expire are in play
- [ ] Token health status indicators (green/yellow/red) on profile list -- UX for token management
- [ ] Notification system (in-app bell + email via SMTP) -- publish failures, token expiry, rate limit warnings
- [ ] Post preview panels (Twitter first, then LinkedIn + Facebook) -- nice UX but not blocking
- [ ] Tags (CRUD, apply to posts, filter by tag) -- organizational feature
- [ ] 2FA (TOTP) -- security hardening
- [ ] Video upload + async transcoding via ffmpeg -- lower priority media type
- [ ] Rate limit tracking for Facebook and LinkedIn -- needed once those platforms are connected

### Future Consideration (Phase 3+)

Features to defer until multi-platform scheduling is stable.

- [ ] CSV bulk upload/download -- power-user feature, high complexity (scheduling options, validation, rate limit pre-flight)
- [ ] Bulk queue operations (randomize, purge, copy, text modify, deduplicate) -- power-user queue management
- [ ] Bulk pause/resume posts and queues per profile -- operational convenience
- [ ] Auto-destruct posts (scheduled delete from platform) -- differentiator but not core
- [ ] Calendar view (monthly/weekly/daily, conflict detection) -- significant UI effort, high value but deferrable
- [ ] Hashtag sets and saved text snippets -- quality-of-life, not blocking
- [ ] Post search (PostgreSQL full-text via tsvector + GIN) -- discoverability, not blocking
- [ ] AI post generation (OpenAI integration) -- nice differentiator, completely independent of core
- [ ] Webhooks (inbound HTTP POST from IFTTT/custom apps) -- requires public endpoint, adds attack surface
- [ ] Email logs view -- operational visibility
- [ ] HTML-to-Markdown converter utility -- niche utility
- [ ] Security questions for account recovery -- low priority for single-user self-hosted
- [ ] Backup and restore automation -- important but can use manual pg_dump/rsync initially

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Twitter OAuth connection | HIGH | MEDIUM | P1 |
| Post creation (Twitter) | HIGH | MEDIUM | P1 |
| Background worker (BullMQ) | HIGH | HIGH | P1 |
| Queue system + scheduling engine | HIGH | HIGH | P1 |
| Post recycling | HIGH | LOW | P1 |
| Spinnable text | HIGH | LOW | P1 |
| Post state machine | HIGH | MEDIUM | P1 |
| Media upload (images) | HIGH | MEDIUM | P1 |
| Character counting | HIGH | LOW | P1 |
| Rate limit tracking (Twitter) | HIGH | MEDIUM | P1 |
| Token encryption | HIGH | MEDIUM | P1 |
| Draft posts | MEDIUM | LOW | P1 |
| Health check + logging | MEDIUM | LOW | P1 |
| LinkedIn integration | MEDIUM | MEDIUM | P2 |
| Facebook integration | MEDIUM | MEDIUM | P2 |
| OAuth token lifecycle | MEDIUM | MEDIUM | P2 |
| Notifications (in-app + email) | MEDIUM | MEDIUM | P2 |
| Post preview | MEDIUM | MEDIUM | P2 |
| Tags | MEDIUM | LOW | P2 |
| 2FA (TOTP) | MEDIUM | LOW | P2 |
| Video transcoding | LOW | HIGH | P2 |
| Calendar view | MEDIUM | HIGH | P3 |
| CSV bulk upload/download | MEDIUM | MEDIUM | P3 |
| Bulk queue operations | MEDIUM | MEDIUM | P3 |
| Auto-destruct | MEDIUM | MEDIUM | P3 |
| AI post generation | LOW | MEDIUM | P3 |
| Webhooks | LOW | MEDIUM | P3 |
| Snippets / hashtag sets | LOW | LOW | P3 |
| Full-text search | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for Phase 1 launch (core scheduling + queue + Twitter)
- P2: Phase 2 (multi-platform + operational maturity)
- P3: Phase 3+ (power-user features, differentiators, polish)

## Competitor Feature Analysis

| Feature | SocialOomph | Mixpost (self-hosted) | Buffer (SaaS) | Our Approach |
|---------|-------------|----------------------|---------------|--------------|
| Queue scheduling | Interval-based with day/hour windows | Time-slot based queues | Queue with time slots | SocialOomph-style: interval + day/hour constraints + seasonal windows |
| Post recycling | Queue reservoirs with recycle toggle | Recurring/evergreen posts | Not available | Per-post recycle toggle in queues, move to end after publish |
| Spinnable text | `{opt\|opt}` syntax, queue posts only | Not available | Not available | Match SocialOomph: `{opt\|opt}` resolved at publish time. Consider supporting in both queue and scheduled posts. |
| Auto-destruct | Self-destructing tweets/Facebook posts | Not available | Not available | Worker schedules delete API call after configured duration |
| Bulk operations | CSV upload/download, queue randomize/purge/copy/modify/dedupe | Basic bulk scheduling | CSV upload | Full SocialOomph parity: all bulk queue operations |
| Media support | Images, GIF, video per platform | Images, video | Images, video, GIF | Match SocialOomph limits per platform. Async video transcoding via ffmpeg. |
| Calendar view | Not available | Calendar view | Calendar view | Phase 3. Monthly/weekly/daily with conflict detection. |
| AI generation | Not available | AI-assisted content | AI assistant | Phase 3. OpenAI integration, user's own API key. |
| Webhooks | Limited | Not available | Zapier integration | Phase 3. Inbound HTTP POST with HMAC verification. |
| Analytics | Basic | Analytics dashboard | Analytics | Out of scope. Not the job of a scheduler. |
| Self-hosted | No (SaaS only) | Yes (Laravel/PHP) | No (SaaS only) | Yes (Node.js + Docker Compose on Proxmox) |
| Multi-platform | Twitter, Facebook, LinkedIn, others | 10+ platforms | 8+ platforms | Twitter (P1), LinkedIn + Facebook (P2). No others planned. |

## Critical Research Finding: Twitter/X API Pricing Change

**Confidence: MEDIUM (multiple sources agree, but developer forums show instability)**

The PRD references a "500 tweets/month free tier" for Twitter/X. As of February 6, 2026, this free tier is discontinued:

- **New developers** get pay-per-use by default: $0.01 per post created, $0.005 per post read.
- **Legacy Basic** ($200/month) and **Legacy Pro** ($5,000/month) are no longer available to new signups.
- **Existing free-tier users** were migrated to pay-per-use with a one-time $10 voucher.

**Impact on this project:**
- If the user already has a Developer App on the old free tier, they may have been migrated to pay-per-use.
- If they have a Legacy Basic subscription, the 500 tweet/month limit referenced in the PRD may not apply -- they'd have ~50,000/month.
- Rate limit tracking should be configurable (not hardcoded to 500/month) to accommodate different tiers.
- The pay-per-use model at $0.01/post means cost tracking may be more useful than count tracking.

**Known issues (Feb-Mar 2026):** Multiple developers report 403 errors when posting tweets with media on pay-per-use accounts via OAuth 1.0a. This appears to be a transitional bug, not a permanent restriction. OAuth 1.0a for text-only tweets works fine.

**Recommendation:** Make rate limit tracking tier-aware. Let the user configure their limit (500/month, 50K/month, or pay-per-use with cost tracking). Don't hardcode the 500 number.

## Sources

- [Mixpost - Self-Hosted Social Media Management](https://mixpost.app/)
- [Mixpost Features](https://mixpost.app/features)
- [Postiz - Open Source Social Media Scheduler](https://postiz.com/blog/open-source-social-media-scheduler)
- [SocialOomph Official](https://www.socialoomph.com/)
- [SocialOomph Spinnable Text Help](https://www.socialoomph.com/help/view/help_posts_spin_how/)
- [X (Twitter) API Pricing 2026 - Postproxy](https://postproxy.dev/blog/x-api-pricing-2026/)
- [X API Pay-Per-Use Announcement](https://devcommunity.x.com/t/announcing-the-launch-of-x-api-pay-per-use-pricing/256476)
- [X API OAuth 1.0a Media 403 Issue](https://devcommunity.x.com/t/pay-per-use-oauth-1-0a-post-2-tweets-with-media-ids-returns-403-you-are-not-permitted-to-perform-this-action-after-only-3-successful-image-posts/258317)
- [G2 SocialOomph Alternatives](https://www.g2.com/products/socialoomph/competitors/alternatives)
- [Publer Auto-Delete Feature](https://publer.com/help/en/article/how-to-auto-delete-posts-1t21ddd/)
- [SocialOomph Review - Influencer Marketing Hub](https://influencermarketinghub.com/socialoomph/)
- [RecurPost SocialOomph Alternatives](https://recurpost.com/socialoomph-alternatives/)

---
*Feature research for: Self-hosted social media scheduler (SocialOomph replacement)*
*Researched: 2026-04-07*
