# Pitfalls Research

**Domain:** Self-hosted social media scheduler (Twitter/X, LinkedIn, Facebook)
**Researched:** 2026-04-07
**Confidence:** HIGH (verified against official docs and community reports)

## Critical Pitfalls

### Pitfall 1: Twitter/X API Pricing Has Changed -- The 500-Tweet Free Tier No Longer Exists

**What goes wrong:**
The PRD assumes a 500-tweet/month free tier for Twitter/X API. As of February 2026, X replaced the entire API pricing model. The free tier is discontinued for new developers. Existing free-tier users were migrated to pay-per-use with a one-time $10 voucher. The new pricing is $0.01 per post created and $0.005 per post read. Building rate-limit tracking around a hard 500/month ceiling is now incorrect -- the constraint is financial, not volumetric.

**Why it happens:**
The PRD was written based on the pricing structure that existed before February 2026. X changed its model without warning to existing developers.

**How to avoid:**
- Verify current API access tier before building rate-limit tracking. If on pay-per-use, the constraint is cost, not a hard count.
- Build the rate-limit tracking system to be configurable: support both a hard monthly cap (for legacy plan holders who may still have fixed limits) and a cost-based budget tracker (for pay-per-use).
- Store the user's API pricing tier as a configuration option so the dashboard widget and pre-flight checks adapt accordingly.
- At $0.01/tweet, 500 tweets/month costs $5.00. The PRD's warning-at-80%/block-at-500 logic should become warning-at-budget-threshold/block-at-budget-limit.

**Warning signs:**
- Getting 402 Payment Required or unexpected billing errors instead of 429 rate limit errors
- Twitter API signup flow no longer showing "Free" tier option
- Rate limit headers returning different structures than documented in older guides

**Phase to address:**
Phase 1 (Social Profile Connection -- Twitter). Must validate current API access and pricing before building the rate-limit tracking system. The rate-limit tracking feature (PRD Section 2.18) needs a design revision.

---

### Pitfall 2: Twitter/X Media Upload Requires OAuth 1.0a -- Cannot Use OAuth 2.0

**What goes wrong:**
The v1.1 media upload endpoint was deprecated on March 31, 2025. The new `/2/media/upload` endpoint exists but has authentication quirks. When using OAuth 2.0, you need the `media.write` scope explicitly. When using OAuth 1.0a (which this project does), you can use the v2 media upload endpoint, but developers frequently hit 403 errors because their app's permissions are set to read-only instead of read+write. Additionally, some developers on pay-per-use have reported 403 "You are not permitted to perform this action" errors after only a few successful image posts.

**Why it happens:**
The Twitter API is a patchwork of v1.1 and v2 endpoints with different auth requirements. Developers assume "OAuth 1.0a works for everything" without checking per-endpoint requirements.

**How to avoid:**
- Use OAuth 1.0a with read+write permissions for all Twitter operations (tweet creation and media upload)
- Verify the Developer App has "Read and write" permissions set in the developer portal, not just "Read"
- Test media upload (image, GIF, video) as part of the Twitter connection flow -- don't wait until a scheduled post fails
- Build a "test post" feature that verifies the credentials can actually publish (text + media) during profile setup
- Handle the 403 gracefully with a specific error message: "Your Twitter Developer App may not have write permissions enabled"

**Warning signs:**
- Text-only tweets work but media tweets fail with 403
- Intermittent 403 errors on media posts that previously worked
- OAuth credentials pass validation but fail on actual publish

**Phase to address:**
Phase 1 (Twitter profile connection + post creation). Must test media upload during initial Twitter integration, not as a later add-on.

---

### Pitfall 3: BullMQ Stalled Jobs Cause Double-Publishing

**What goes wrong:**
When the worker process takes too long to complete a job (CPU-intensive work, slow API response, network timeout), BullMQ's lock renewal fails and the job is marked as "stalled." The stalled job is then moved back to the waiting queue and picked up again -- by the same or another worker. If the original API call actually succeeded (just slowly), the post gets published twice. For social media, duplicate posts are visible and embarrassing.

**Why it happens:**
BullMQ uses a lock/heartbeat mechanism where the worker must periodically renew its lock on a job. If the event loop is blocked (e.g., by ffmpeg transcoding metadata reads, large file I/O, or a slow platform API call that takes 30+ seconds), the lock expires and the job is considered stalled. The default `stalledInterval` is 30 seconds, and `lockDuration` is also 30 seconds.

**How to avoid:**
- Implement the idempotency check described in the PRD: check `platform_post_id` before publishing. If it is already set, skip the publish and mark success. This is the single most important safeguard.
- For Twitter specifically, after a stalled retry, query the user's recent tweets to check if the content was already posted before re-attempting.
- Set `lockDuration` to at least 60 seconds (double the default) to account for slow platform API responses.
- Never do CPU-intensive work (like ffmpeg operations) inside the publish job processor. Keep media transcoding in a separate queue/job type.
- Attach a listener to the `stalled` event and log it as a warning -- stalled events indicate the system is under stress.

**Warning signs:**
- Duplicate posts appearing on social platforms
- `stalled` events in BullMQ logs
- Job completion times approaching or exceeding `lockDuration`
- Worker CPU consistently above 80%

**Phase to address:**
Phase 3 (Scheduling engine / background worker). The idempotency check via `platform_post_id` must be implemented from day one of the worker, not bolted on later.

---

### Pitfall 4: Facebook Page Token Lifecycle Is More Complex Than "60-Day Refresh"

**What goes wrong:**
The PRD says Facebook long-lived tokens last ~60 days and need auto-refresh 7 days before expiry. This is only half the story. Facebook has two token types that behave differently:

1. **Long-lived User Token**: Lasts ~60 days. Can be refreshed, but only if the user has been active on your app within that window. Facebook does NOT guarantee refreshability.
2. **Long-lived Page Token**: When derived from a long-lived User Token, Page tokens have **no expiration date**. They persist until the user changes their password, deauthorizes the app, or the app secret is rotated.

If you build the auto-refresh logic around 60-day expiry for Page tokens, you'll be doing unnecessary work and possibly breaking working tokens by trying to refresh them.

**Why it happens:**
Facebook's documentation is scattered across multiple pages and versions. The distinction between User tokens and Page tokens is buried. Most tutorials focus on User tokens.

**How to avoid:**
- During the OAuth flow: obtain a short-lived User Token, exchange it for a long-lived User Token, then use that to request Page Access Tokens. Page tokens derived from long-lived User tokens do not expire.
- Store `token_expires_at` as NULL for Facebook Page tokens (they don't expire by time).
- Still monitor token validity by making periodic test API calls (e.g., `GET /me?fields=id` with the page token). A 190 error code means the token is invalid regardless of expiry.
- Track Data Access Expiry separately -- even with a non-expiring token, data access permissions expire after 90 days of inactivity. This requires the user to re-authenticate data permissions, not the token itself.
- Handle these invalidation scenarios: user changes Facebook password, user removes app permissions, app secret rotation.

**Warning signs:**
- Auto-refresh logic triggering on Page tokens that don't actually expire
- Token validity checks passing but data access failing with permission errors
- Users being asked to re-authenticate when they shouldn't need to

**Phase to address:**
Phase 5 (Facebook integration) and Phase 4 (OAuth token lifecycle management). The token health monitoring system must distinguish between token types.

---

### Pitfall 5: BullMQ Redis Configuration -- Wrong `maxmemory-policy` Silently Corrupts Queue State

**What goes wrong:**
Redis defaults to evicting keys when memory is full (using `allkeys-lru` or similar policies). BullMQ stores job state, locks, and queue metadata as Redis keys. If Redis starts evicting BullMQ keys, jobs silently disappear, locks break, and the queue enters an inconsistent state. The symptoms are subtle: jobs vanish without error logs, stalled job counts spike, and published posts get re-queued.

**Why it happens:**
Redis is commonly used for caching where eviction is desirable. Developers set up Redis for BullMQ using the same configuration they'd use for a cache. Docker Redis images ship with default configs that don't set `maxmemory-policy`.

**How to avoid:**
- Set `maxmemory-policy noeviction` in Redis configuration. This is non-negotiable for BullMQ.
- In Docker Compose, pass this via command: `redis: command: redis-server --maxmemory-policy noeviction --appendonly yes`
- Enable Redis AOF persistence (`appendonly yes`) so job data survives container restarts.
- Set a reasonable `maxmemory` limit (e.g., 256MB for a single-user app) and monitor usage.
- Use a dedicated Redis instance for BullMQ, separate from any application caching. This project uses Redis only for BullMQ and sessions, so a single instance is fine as long as eviction is disabled.

**Warning signs:**
- Jobs disappearing without appearing in failed or completed sets
- Increasing `stalled` event count without corresponding worker issues
- Redis `INFO memory` showing `evicted_keys` > 0
- Intermittent "Missing lock" errors in BullMQ logs

**Phase to address:**
Phase 1 (Infrastructure setup). Redis configuration must be correct from the first Docker Compose file.

---

### Pitfall 6: DST Transitions Break Queue Schedules in Subtle Ways

**What goes wrong:**
A user configures a queue to publish "every day at 9:00 AM Eastern." During the spring DST transition (2:00 AM jumps to 3:00 AM), a post scheduled for 2:30 AM is skipped entirely. During the fall transition (2:00 AM repeats), a post scheduled for 1:30 AM publishes twice. These are not theoretical -- they affect any cron-style scheduling that touches the 1-3 AM window on DST transition dates.

**Why it happens:**
BullMQ's cron/repeat functionality does not inherently handle timezones. If you schedule jobs using UTC-converted times without timezone awareness, the UTC offset changes during DST transitions and your "9:00 AM Eastern" becomes "8:00 AM Eastern" or "10:00 AM Eastern" until someone notices.

**How to avoid:**
- Store all user-facing schedule times with their IANA timezone identifier (e.g., `America/New_York`), not as pre-computed UTC offsets.
- When computing the next run time for a queue, use a timezone-aware library (Luxon, `date-fns-tz`, or the native `Intl.DateTimeFormat` with `timeZone` option) to convert from the user's local time to UTC at evaluation time, not at configuration time.
- BullMQ's repeat/cron options accept a `tz` parameter. Use it: `{ pattern: '0 9 * * *', tz: 'America/New_York' }`.
- Add integration tests that specifically simulate DST transitions (mock the system clock to a DST boundary and verify correct behavior).
- Avoid scheduling queue runs during the 1-3 AM window if possible, but don't rely on this as the only mitigation.

**Warning signs:**
- Posts publishing an hour early or late twice a year
- User reports of "missed" posts around March/November
- Queue run timestamps in logs showing unexpected UTC offsets

**Phase to address:**
Phase 3 (Queue system + scheduling engine). The scheduling engine must use timezone-aware date math from the start.

---

### Pitfall 7: Encryption Key Loss Means Total Re-Authentication of All Profiles

**What goes wrong:**
The `ENCRYPTION_KEY` environment variable is the single point of failure for all stored OAuth tokens. If this key is lost (container rebuild without backup, env file corruption, accidental rotation without proper migration), every encrypted token in the database becomes permanently unreadable. Every social profile must be manually re-authenticated by going through the OAuth flow again.

**Why it happens:**
Environment variables feel ephemeral. Developers treat them as "just config" and don't back them up with the same rigor as database backups. Docker Compose rebuilds, server migrations, or Proxmox snapshots may not capture the `.env` file.

**How to avoid:**
- Document the encryption key backup procedure in the project's operational runbook from day one.
- Store a copy of `ENCRYPTION_KEY` in a secure location outside the Proxmox server (password manager, encrypted USB, etc.).
- The key rotation procedure described in the PRD (with `ENCRYPTION_KEY_OLD` + `token_encryption_version`) is correct -- implement it before the first key rotation is needed, not after.
- Add a startup check: if `ENCRYPTION_KEY` is not set or is empty, refuse to start the application with a clear error message.
- Test the key rotation procedure in a staging/test environment before ever doing it in production.
- Include the encryption key in the backup/restore documentation alongside the database dump.

**Warning signs:**
- No documented backup procedure for the encryption key
- Key stored only in a `.env` file on the Docker host with no offsite copy
- No test of the key rotation migration script

**Phase to address:**
Phase 1 (Infrastructure + Security setup). The encryption key management strategy must be established before any tokens are stored.

---

### Pitfall 8: LinkedIn OAuth Requires HTTPS Callback URLs -- Self-Hosted HTTPS Is Non-Trivial

**What goes wrong:**
Both LinkedIn and Facebook mandate HTTPS callback URLs for OAuth. On a self-hosted Proxmox server on a local network, there is no automatic HTTPS. Developers try workarounds: self-signed certificates (rejected by OAuth providers), HTTP-only callbacks (rejected by the APIs), or tunneling services that are unreliable. The OAuth flow breaks and profiles can't be connected.

**Why it happens:**
Self-hosted deployments don't have the automatic TLS that cloud platforms provide. The PRD mentions Cloudflare Tunnel or Let's Encrypt via nginx, but the details of making this work reliably on Proxmox are non-trivial.

**How to avoid:**
- Choose one HTTPS strategy and commit to it in Phase 1:
  - **Cloudflare Tunnel (recommended):** Free, no port forwarding needed, works behind NAT. Install `cloudflared` in a Docker container alongside the stack. Route a subdomain (e.g., `scheduler.yourdomain.com`) through the tunnel.
  - **Let's Encrypt + nginx:** Requires a public domain pointing to your server, port 80/443 open, and certbot for automatic renewal. More setup but no dependency on Cloudflare.
- Configure the OAuth callback URLs to use the HTTPS domain, not `localhost` or an IP address.
- Test the OAuth callback flow end-to-end for each platform before building any post creation features.
- For local development, use a tool like `mkcert` to create locally-trusted certificates, but do NOT use self-signed certs in production OAuth flows.

**Warning signs:**
- OAuth flows redirect to `http://` instead of `https://`
- "Invalid redirect_uri" errors from Facebook or LinkedIn
- SSL certificate errors in the browser during OAuth callbacks
- Cloudflare Tunnel disconnections causing intermittent OAuth failures

**Phase to address:**
Phase 1 (Infrastructure). HTTPS must work before any OAuth integration begins.

---

### Pitfall 9: BullMQ Worker Graceful Shutdown -- Killing Workers Mid-Job Causes Stalled Jobs

**What goes wrong:**
When Docker restarts the worker container (during deploys, host reboots, or health check failures), the worker process receives SIGTERM. If the worker doesn't handle this signal and gracefully complete or release its current job, the job becomes stalled. BullMQ will eventually retry it, but combined with Pitfall 3 (no idempotency check), this can cause duplicate publishes.

**Why it happens:**
Node.js applications don't handle SIGTERM by default -- they just die. Docker sends SIGTERM, waits 10 seconds (default `stop_grace_period`), then sends SIGKILL. If a publish API call takes 5-15 seconds and the worker is mid-call when SIGTERM arrives, the job is orphaned.

**How to avoid:**
- Implement graceful shutdown in the worker: listen for SIGTERM, call `worker.close()` which waits for the current job to finish, then exit.
- Set Docker Compose `stop_grace_period: 30s` for the worker service to give in-flight jobs time to complete.
- The `worker.close()` method returns a promise that resolves when all active jobs are finished. Await it before process exit.
- Combine with the idempotency check (Pitfall 3) as a defense-in-depth measure.

**Warning signs:**
- Stalled job events correlating with container restarts
- Worker health check failures in Docker
- Posts stuck in `publishing` state after container restarts

**Phase to address:**
Phase 3 (Background worker implementation). Graceful shutdown must be part of the initial worker implementation.

---

### Pitfall 10: LinkedIn API Versioning and Rate Limits Are Stricter Than Expected

**What goes wrong:**
LinkedIn deprecated the classic API version format (YYYYMM) and enforces versioned API access where each version is supported for only one year. If you hardcode API version strings, your integration breaks silently when LinkedIn sunsets that version. Additionally, LinkedIn's rate limits are stricter than Twitter or Facebook: 100-500 requests per day per application (not per user), which can be exhausted quickly if the background worker makes unnecessary API calls (health checks, token validation, retries).

**Why it happens:**
LinkedIn's API docs are less developer-friendly than Twitter's. Rate limit specifics are not always clearly documented per endpoint. Developers build against a specific version and don't plan for version rotation.

**How to avoid:**
- Use LinkedIn's `Restli-Protocol-Version` header and track which API version you're targeting.
- Build API version as a configuration constant, not hardcoded across the codebase.
- Use LinkedIn's token introspection endpoint (`POST /oauth/v2/introspectToken`) to check token validity instead of making dummy API calls that consume rate limit quota.
- Cache the token introspection result and only re-check when the cached result is stale (e.g., every 6 hours).
- Implement backoff when receiving 429 responses, and track daily API call count to avoid hitting the limit.

**Warning signs:**
- 429 errors from LinkedIn with no clear rate limit header
- API calls suddenly returning "unsupported version" errors
- Token validation calls consuming a disproportionate share of the daily rate limit

**Phase to address:**
Phase 6 (LinkedIn integration). Research current API version and rate limits immediately before building the integration, not based on documentation read months earlier.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing OAuth tokens unencrypted during development | Faster iteration, easier debugging | Must retrofit encryption, risk of shipping without it | Never -- use encryption from first commit. Plaintext tokens in the DB, even in dev, create habits and risk. |
| Skipping idempotency check on publish jobs | Simpler worker code | Duplicate posts on any crash/stall event | Never -- this is a one-time implementation cost that prevents a recurring production issue. |
| Using `setTimeout` instead of BullMQ delayed jobs for auto-destruct | Simpler code, no queue setup | Timers don't survive process restarts. Auto-destruct silently fails after any restart. | Never -- auto-destruct timers can span hours/days/weeks. They must be persistent. |
| Polling platform APIs for token health instead of tracking expiry dates | Works without schema changes | Wastes rate limit quota, especially on LinkedIn (100-500 calls/day) | Only in prototyping. Switch to expiry-based tracking before adding LinkedIn. |
| Hardcoding platform API versions | Works now | Silent breakage when platforms deprecate versions (LinkedIn does this annually) | Only for Twitter (stable v2). LinkedIn and Facebook versions must be configurable. |
| Skipping timezone-aware scheduling ("just use UTC everywhere") | Simpler date math | Queue schedules drift by 1 hour during DST transitions, twice per year | Never -- use IANA timezones from day one. Retrofitting timezone awareness is a painful migration. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Twitter/X OAuth 1.0a | Setting Developer App permissions to "Read" only, then wondering why tweet creation returns 403 | Set permissions to "Read and write" in the Developer Portal before generating access tokens. Permissions changes require regenerating tokens. |
| Twitter/X media upload | Assuming the v1.1 media upload endpoint still works (deprecated March 2025) | Use the v2 `/2/media/upload` endpoint with OAuth 1.0a and `read+write` permissions |
| Twitter/X thread publishing | Publishing thread tweets sequentially without handling partial failures (first tweet succeeds, second fails -- orphaned thread) | Publish thread tweets sequentially, storing each `tweet_id` as `in_reply_to`. If any tweet in the thread fails, store the partial thread state and let the user decide: retry remaining tweets, or delete the partial thread |
| Facebook OAuth | Requesting a User Token and using it directly for Page operations. User tokens expire in ~1 hour. | Exchange short-lived User Token for long-lived User Token, then use that to request Page Access Token (which won't expire if derived from a long-lived User Token) |
| Facebook Graph API | Ignoring the 200 calls/user/hour rate limit by making burst API calls during queue processing | Track API calls per hour per Facebook profile. Space out Facebook publishes with a minimum interval (e.g., 30 seconds between posts to the same page) |
| LinkedIn content creation | Using the legacy Share API (`/v2/shares`) which is deprecated in favor of the Community Management API | Use the Posts API (`/rest/posts`) under the Community Management API for content creation |
| LinkedIn image upload | Trying to upload images in a single API call like Twitter | LinkedIn requires a multi-step process: 1) register upload, 2) upload binary to the provided URL, 3) create post referencing the upload URN |
| Redis for BullMQ | Using the same Redis instance with default eviction policy for both caching and job queues | Set `maxmemory-policy noeviction` and `appendonly yes`. Use a dedicated Redis instance or at minimum ensure no eviction. |
| BullMQ Worker connections | Using the same ioredis connection options for Queue and Worker classes | Queue: default `maxRetriesPerRequest` (fail fast). Worker: `maxRetriesPerRequest: null` (wait indefinitely). Different retry semantics are intentional. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| ffmpeg transcoding in the publish job processor | Worker event loop blocks, jobs stall, lock renewal fails, duplicate publishes | Run transcoding in a separate BullMQ queue/job type with its own worker. The publish worker only handles API calls. | Any video post -- transcoding even a 15MB video can block the event loop for 10-30 seconds |
| Loading all queue posts into memory for randomize/reorder operations | Memory spikes, potential OOM on large queues | Use database-level randomization (`ORDER BY RANDOM()`) and batch updates for position changes | Queues with 1000+ posts |
| Synchronous character counting with `twitter-text` on every keystroke | UI lag on post creation form, especially for threads | Debounce character count updates (250ms). Run `twitter-text` validation only on blur or on a debounced timer, not on every `onChange` | Noticeable with CJK text or long threads (complex character counting rules) |
| Unbound publish log growth | `PublishLog` table grows linearly with every publish attempt, slowing queries on the scheduled posts list | Add a retention policy: keep detailed logs for 90 days, archive/summarize older entries. Add an index on `(post_id, attempted_at)` | After ~10K publish log entries |
| Docker volume for media storage without disk monitoring | Disk fills up silently, then media uploads fail, video transcoding fails, and eventually Postgres WAL writes fail if on the same disk | Monitor disk usage via the health endpoint. Set up alerts at 80% disk usage. Implement the media cleanup job (soft-delete + 30-day purge) early. | After months of video uploads accumulating |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging decrypted OAuth tokens during debugging | Tokens in log files are accessible to anyone with server access. Log aggregation services make this worse. | Use a logging wrapper that redacts any field matching `/token|secret|key|password/i`. Test that `console.log(profile)` doesn't print decrypted tokens. |
| Storing the `ENCRYPTION_KEY` in `docker-compose.yml` or committing `.env` to git | Anyone with repo access has the key to decrypt all OAuth tokens | Use Docker secrets or a `.env` file excluded from version control. Add `.env` to `.gitignore` and `.dockerignore`. Add a pre-commit hook that rejects commits containing the key pattern. |
| IV reuse in AES-256-GCM encryption | Reusing an IV with the same key completely breaks GCM security. An attacker can recover the authentication key and forge ciphertexts. | Generate a new random 12-byte IV for every encryption operation using `crypto.randomBytes(12)`. Store the IV alongside the ciphertext. Never derive the IV from deterministic data (like the profile ID). |
| CSRF token not validated on OAuth callback endpoints | An attacker could forge an OAuth callback and link their social account to the victim's scheduler account | Include a `state` parameter in all OAuth authorization requests. Validate the `state` parameter in the callback handler. The `state` should be a random value tied to the user's session. |
| Webhook endpoint exposed without authentication | Anyone who discovers the webhook URL can inject posts into the scheduler | Implement HMAC-SHA256 signature verification (as specified in PRD Section 2.8). Make it required, not optional, for production use. Add IP allowlisting as a secondary defense. |
| Using `string === string` comparison for auth tag verification | Timing attacks can extract the authentication tag byte-by-byte | Use `crypto.timingSafeEqual()` for all cryptographic comparisons (auth tags, HMAC signatures, CSRF tokens) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing raw API error messages from Twitter/Facebook/LinkedIn when publishing fails | User sees cryptic error like `{"code":187,"message":"Status is a duplicate"}` and doesn't know what to do | Map platform error codes to human-readable messages with actionable guidance: "This tweet has already been posted. Edit the text or delete the duplicate." |
| Not showing which timezone is being used for schedule display | User in EST sees "9:00 AM" and assumes it's their local time, but it's UTC. Posts go out 5 hours early. | Always display the timezone abbreviation next to every datetime: "9:00 AM EST". Show a timezone indicator in the navbar. |
| No confirmation or preview before publishing "now" | User accidentally clicks "Publish now" instead of "Schedule" and the post goes live immediately with no undo | Add a confirmation dialog for immediate publish: "This will publish to Twitter now. Continue?" with a 3-second countdown before the confirm button is active. |
| Character count showing "280" without accounting for URL shortening | User writes 280 characters of text including a URL, but Twitter's t.co wrapping makes the URL count as 23 characters regardless of actual length. The actual count may be under or over the limit. | Use the `twitter-text` library for character counting, which handles URL weighting, CJK characters, and emoji sequences correctly. Show the weighted count, not `text.length`. |
| No visual feedback during video transcoding | User uploads a video, sees "processing," but has no progress indicator and doesn't know if it's working or stuck | Show a progress bar (or at least a spinner with elapsed time) for video transcoding. Display the transcoding status on the post creation form and the scheduled posts list. |

## "Looks Done But Isn't" Checklist

- [ ] **Twitter posting:** Works for text tweets but hasn't been tested with: images (1-4), animated GIFs, video, threads with media, threads with 10+ tweets, tweets containing only URLs, tweets with CJK characters at exactly 280 weighted characters
- [ ] **OAuth connection flow:** Works on first connect but hasn't been tested for: re-authentication after token revocation, handling of "user denied permission" callback, concurrent OAuth flows in multiple browser tabs, OAuth callback after session expiry
- [ ] **Queue scheduling:** Works for simple intervals but hasn't been tested for: DST spring-forward (2 AM skip), DST fall-back (1 AM repeat), queue with "weekdays only" crossing a month boundary, queue with hour restrictions (e.g., 9 AM-5 PM) combined with day restrictions
- [ ] **Post state machine:** All happy-path transitions work but hasn't been tested for: optimistic locking conflict (user edits post while worker is publishing), worker crash during `publishing` state, recovery after Redis connection loss mid-job, state transition from `failed` back to `scheduled` preserving edit history
- [ ] **Spinnable text:** Basic `{opt1|opt2}` syntax works but hasn't been tested for: nested spin groups `{a|{b|c}}`, spin groups containing special characters `{hello!|world?}`, empty options `{a||c}`, spin resolution producing text that exceeds platform character limits
- [ ] **Media transcoding:** ffmpeg converts one video format but hasn't been tested for: corrupt input files (graceful failure), files exceeding the 5-minute timeout, concurrent transcoding of multiple videos, transcoding producing output exceeding platform file size limits
- [ ] **Encryption:** AES-256-GCM encrypt/decrypt works but hasn't been tested for: key rotation (old key to new key migration), attempting to decrypt with the wrong key (should fail gracefully, not crash), empty/null token values, tokens containing non-ASCII characters

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Encryption key lost | HIGH | Re-authenticate every social profile through OAuth flows. No way to recover encrypted tokens without the key. Document the number of profiles affected and the re-auth procedure. |
| Duplicate posts published | LOW | Delete the duplicate from the platform directly (or via auto-destruct if available). Add idempotency check to prevent recurrence. Review stalled job logs to identify root cause. |
| Redis data loss (no persistence) | MEDIUM | BullMQ queues are lost, but post/queue data lives in Postgres. Rebuild the job queue from database state: re-schedule all posts in `scheduled` state, re-initialize all queue schedules. |
| Facebook token invalidated unexpectedly | LOW | User must re-authenticate through the OAuth flow. Ensure the flow exchanges for a Page token derived from a long-lived User token to minimize recurrence. |
| Queue posts published at wrong times due to DST | LOW | Identify affected posts via publish logs. No platform-side fix needed (posts are already published). Fix the scheduling engine to use timezone-aware date math and verify with DST transition tests. |
| Worker stuck in crash loop | MEDIUM | Check worker logs for the root cause (usually an unhandled exception or Redis connection failure). Fix the issue, restart the worker. Stalled jobs will be automatically retried by BullMQ. Check for duplicates if the crash happened during publish. |
| Docker volume full (media storage) | MEDIUM | Run the media cleanup job manually to purge soft-deleted files. Identify and remove orphaned media files not linked to any post. Expand the volume or move to S3-compatible storage. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Twitter API pricing change | Phase 1 (Twitter connection) | Verify current API access tier matches expectations. Test that rate-limit tracking handles pay-per-use model. |
| Twitter media upload auth | Phase 1 (Twitter post creation) | Successfully publish a text tweet, image tweet, GIF tweet, and video tweet using the stored OAuth 1.0a credentials. |
| BullMQ double-publishing | Phase 3 (Worker implementation) | Write an integration test that simulates a stalled job (delay the API call past `lockDuration`) and verify the idempotency check prevents duplicate publishing. |
| Facebook token lifecycle | Phase 5 (Facebook integration) | Store a Facebook Page token, verify it has no expiry date, verify the token health monitor does not attempt unnecessary refresh on non-expiring tokens. |
| Redis `maxmemory-policy` | Phase 1 (Infrastructure) | Run `redis-cli CONFIG GET maxmemory-policy` inside the container and verify it returns `noeviction`. |
| DST queue scheduling | Phase 3 (Queue system) | Write tests with mocked system clock at DST boundaries. Verify posts scheduled for 9 AM Eastern publish at the correct UTC time across spring and fall transitions. |
| Encryption key management | Phase 1 (Security setup) | Document the key backup procedure. Test the key rotation migration in a test environment. Verify the app refuses to start without `ENCRYPTION_KEY`. |
| HTTPS for OAuth callbacks | Phase 1 (Infrastructure) | Complete an OAuth callback for Twitter, then Facebook, then LinkedIn, all via HTTPS. Verify certificate validity. |
| Worker graceful shutdown | Phase 3 (Worker implementation) | Send SIGTERM to the worker container while a job is active. Verify the job completes (not stalls) and the worker exits cleanly. |
| LinkedIn API versioning | Phase 6 (LinkedIn integration) | Verify the current supported API version at implementation time. Configure the version as a constant, not hardcoded across files. |

## Sources

- [X API Pricing 2026 -- Postproxy](https://postproxy.dev/blog/x-api-pricing-2026/) -- Verified: free tier discontinued Feb 2026
- [X API Pay-Per-Use Announcement](https://devcommunity.x.com/t/announcing-the-launch-of-x-api-pay-per-use-pricing/256476) -- Official announcement
- [X API v2 Authentication Mapping](https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping) -- OAuth 1.0a vs 2.0 per endpoint
- [X Developer Community: Media Upload OAuth Issues](https://devcommunity.x.com/t/how-to-upload-media-to-twitter-api-v2-using-oauth-2-0/238518) -- Media upload auth requirements
- [X Developer Community: OAuth 1.0a + Pay-Per-Use 403 Issues](https://devcommunity.x.com/t/pay-per-use-oauth-1-0a-post-2-tweets-with-media-ids-returns-403-you-are-not-permitted-to-perform-this-action-after-only-3-successful-image-posts/258317) -- Active bug reports
- [Facebook Long-Lived Token Docs](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/) -- Official token lifecycle documentation
- [Facebook Access Token Guide](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/) -- Token types and expiry behavior
- [LinkedIn Programmatic Refresh Tokens](https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens) -- Official refresh token docs
- [LinkedIn API Rate Limiting](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits) -- Official rate limit docs
- [BullMQ Stalled Jobs Documentation](https://docs.bullmq.io/guide/workers/stalled-jobs) -- Official stalled job behavior
- [BullMQ Going to Production Guide](https://docs.bullmq.io/guide/going-to-production) -- Official production checklist
- [BullMQ Connections Guide](https://docs.bullmq.io/guide/connections) -- Queue vs Worker connection config
- [DST Pitfalls in Cron Jobs -- DEV Community](https://dev.to/cronmonitor/handling-timezone-issues-in-cron-jobs-2025-guide-52ii) -- DST edge cases
- [BullMQ Timezone Handling -- Dragonfly FAQ](https://www.dragonflydb.io/faq/bullmq-handle-timezones) -- Timezone configuration for BullMQ

---
*Pitfalls research for: Self-hosted social media scheduler*
*Researched: 2026-04-07*
