# Product Requirements Document

## Self-Hosted Social Media Scheduler

### Based on SocialOomph Feature Audit — April 2026

---

## 1. Overview & Scope

This application is a self-hosted social media scheduling tool for personal business use. It enables the user to compose, schedule, queue, and publish posts to Twitter/X, LinkedIn (personal profile and company page), and Facebook (pages). The app runs as a Docker container on Proxmox and is accessible via a local web UI. There is no multi-user or team functionality. No blog or RSS feed integration is required.

---

## 2. Feature Areas

---

### 2.1 Social Profile Management

**Purpose:** Connect and manage OAuth credentials for each supported social network.

**Supported platforms (in scope):**

- Twitter/X
- Facebook Page
- LinkedIn Personal Profile
- LinkedIn Company Page

**Functional Requirements:**

**Profile List View**

- Display all connected social profiles in a filterable list
- Filter by network type (Twitter, Facebook, LinkedIn)
- Each profile shows: network icon, account name, internal profile ID, connected date, license/plan association, last published date, next scheduled run
- Per-profile actions: Edit, Delete, View Post History

**Connect a New Profile**

- Twitter/X: OAuth 1.1 flow using the user's own Twitter Developer App credentials (Consumer API Key, API Key Secret, Access Token, Access Token Secret). User must supply their own Twitter Developer App credentials.
- Facebook: OAuth flow to connect a Facebook Page (not personal profile)
- LinkedIn Personal Profile: OAuth flow
- LinkedIn Company Page: OAuth flow

**Edit Profile**

- Rename profile (internal label/nickname)
- Add internal notes (Markdown supported)
- Re-authenticate / refresh OAuth tokens
- Reassign to a different license/plan tier

**Delete Profile**

- Confirmation required
- Cascades: warn user that scheduled posts and queue associations for this profile will be affected

**Twitter/X Developer Credentials Note**

Twitter requires the user to supply their own Developer App OAuth 1.1 credentials. The app must store and use: Consumer API Key, API Key Secret, Access Token, Access Token Secret per connected Twitter profile.

---

### 2.2 Post Creation

Each supported network has its own post creation form with platform-specific fields. All creation forms share these common concepts:

**Common Fields (all platforms)**

- **Destination**: Choose between "Post to a social profile" (scheduled/immediate) or "Save in a queue"
- **Recycle toggle**: After publication, recycle back to end of queue for reuse (only applies when saving to queue)
- **Spinnable text toggle**: Flag indicating post text contains `{option|option|option}` spin syntax (one option chosen randomly at publish time)
- **Publish when**: Choose "Publish on a specific date and time" or "Publish right now"
- **Publish at**: Date/time picker (respects user's chosen timezone and date format)
- **Auto-destruct**: Optionally delete the post from the social network after a specified time period (integer + unit: minutes/hours/days/weeks/months/years)
- **Tags**: Assign one or more internal tags to the post for filtering/organization
- **Internal notes**: Free text notes field (Markdown supported, for internal use only, not published)
- **Save as Draft**: Save post without scheduling (see Section 2.15 — Draft Posts)
- **Save / Cancel**

---

#### 2.2.1 New Twitter/X Post

**Fields specific to Twitter:**

- **Tweet type**: Text-only tweet | Up to four images with text | One animated GIF with text | One video with text
- **Media upload**:
  - Images: JPG, GIF, PNG, WEBP — max 5 MB each — max 4 files
  - Animated GIF: max 15 MB
  - Video: max 15 MB
- **Tweet text**: Text area with character length checker ("Check Length" action)
- **Tweet thread support**: Use `[[tweet]]` separator to split a single submission into a thread. All tweets in thread publish simultaneously. Media attaches to first tweet only.
- **Character count**: Real-time length validation using the `twitter-text` reference library (see Section 2.16 — Character Counting)
- **Post preview**: Visual preview panel showing approximate rendering on Twitter (see Section 2.17 — Post Preview)

---

#### 2.2.2 New Facebook Post

**Fields specific to Facebook:**

- **Post type**: Text-only post | Up to ten images with one caption | One video with a caption
- **Media upload**:
  - Images: JPG, GIF, PNG, BMP, TIFF — max 5 MB each — max 10 files
  - Video: max 100 MB
- **URL**: Optional URL to attach to the post
- **Post text**: Text area
- **Post preview**: Visual preview panel showing approximate rendering on Facebook (see Section 2.17)

---

#### 2.2.3 New LinkedIn Share

**Fields specific to LinkedIn:**

- **Share type**: Text-only share | Text share with one uploaded image
- **Image upload**: JPG, GIF, PNG — max 20 MB
- **Share text**: Text area
- **Share visibility**: Anyone on LinkedIn | LinkedIn connections only
- **Post preview**: Visual preview panel showing approximate rendering on LinkedIn (see Section 2.17)

---

### 2.3 Scheduled Posts

**Purpose:** View and manage all posts that are scheduled for future publishing (one-time or recurring via queue).

**Scheduled Posts List View**

- Filterable list of all posts across all profiles
- Filters:
  - By network (All, Twitter, Facebook, LinkedIn)
  - By post status (All | Draft | Scheduled | Errors | Published)
  - By tag
  - By social profile
- Paginated results
- Per-post display:
  - Post text preview (truncated)
  - Network platform icon and name
  - Connected social profile name
  - Post type (e.g., text tweet, image tweet)
  - Status badge: draft / scheduled / published / error
  - Internal post ID
  - Queue name (if originating from a queue)
  - Scheduled publish date/time (relative and absolute)
  - Error message (if status = error)
- Per-post actions:
  - Change / Edit (available for draft/scheduled/error posts)
  - View images/media
  - Delete (with confirmation)
  - View History (publish attempt log)
  - View post body (full text modal)
  - View post notes

**Post History Modal**

- Log of publish attempts for a given post: timestamp, result (success/failure), error message

---

### 2.4 Queue System

The queue system is the core automation engine. Queues are persistent pools of reusable posts published on a defined schedule. Posts in a queue cycle through repeatedly (if recycling is enabled).

---

#### 2.4.1 Queue List View

- List of all queues
- Filter by network
- Per-queue display:
  - Queue name
  - Network icon and name
  - Connected social profile
  - Internal queue ID and license ID
  - Connected date
  - Team/plan name
  - Total post count
  - Last published date/time
  - Next scheduled run date/time
- Per-queue actions:
  - Change (edit queue configuration)
  - Copy Configuration (duplicate queue settings to a new queue)
  - Delete (with confirmation)
  - Posts (jump to queue posts for this queue)
  - Notes (view/edit internal notes for queue)

---

#### 2.4.2 Queue Configuration (Add/Edit)

A queue defines the schedule on which posts are pulled and published.

**Fields:**

- **Queue name**: Internal label
- **Network**: Select platform (Twitter, Facebook, LinkedIn)
- **Social profile**: Which connected account to publish to
- **Schedule type**: Fixed interval vs. variable/random interval
- **Interval**: Once every N minutes/hours/days/weeks/months/years
- **Days of week**: Checkboxes — Monday through Sunday (restrict publishing to selected days)
- **Hours**: Multi-select of hourly windows (Midnight–1AM, 1AM–2AM, ... 11PM–Midnight) — restrict publishing to selected hours
- **Start date**: When the queue should begin running
- **Seasonal window** (optional): Date range within which the queue is active (start date + end date — allow restricting publishing to certain seasons/campaigns)
- **Internal notes**: Markdown-supported notes field

---

#### 2.4.3 Queue Posts List View

- List of all posts within a selected queue
- Filter by:
  - Tag
  - Queue (selector — one queue shown at a time)
- Per-post display:
  - Post text preview
  - Network icon and platform name
  - Post type (text/image/etc.)
  - Internal post ID
  - Media indicator
- Per-post actions:
  - Change / Edit
  - View Images/Media
  - Move Up (reorder in queue)
  - Move Down (reorder in queue)
  - Delete (with confirmation)
  - View History
  - View spinnable text variants

---

### 2.5 Bulk Queue Post Operations

A set of batch operations that apply to all posts within a selected queue.

---

#### 2.5.1 Randomize Queue Posts

- Select a queue
- Randomize the order of all posts in that queue
- Submits an async job; user receives confirmation

---

#### 2.5.2 Purge Queue Posts

- Select a queue
- Delete all posts from that queue (destructive, confirmation required)

---

#### 2.5.3 Copy Queue Posts

- **Copy from**: Source queue selector
- **Copy to**: Target queue selector (can be same queue to duplicate)
- **Randomize after copy**: Checkbox to randomize target queue order after copy completes

---

#### 2.5.4 Bulk Modify Text of Queue Posts

- Select a queue
- **Desired action**: Append text | Remove text | Replace text
- **Text**: The text to append, remove, or use as search in replace
- **Replace with** (if Replace action): Replacement string
- Note for append: a space is automatically inserted between existing text and new text
- Submits as async job

---

#### 2.5.5 Remove Duplicate Queue Posts

- Select a queue
- Identify and remove duplicate posts (identical text) from the queue
- Submits as async job

---

#### 2.5.6 Bulk Download Queue Posts

- Select a queue
- Export all queue posts as a UTF-8 CSV file for download/backup

---

### 2.6 Bulk Scheduled Post Operations

Batch operations for one-time scheduled posts.

---

#### 2.6.1 Bulk Upload Posts

Users can upload a CSV file to create many scheduled posts or queue posts at once.

**Fields:**

- **Upload file**: CSV, UTF-8 encoded, max 10 MB
- **Destination**: Upload to social profile (scheduled) or Upload to a queue
- **Social profile** or **Queue**: Selector
- **Recycle toggle** (queue only): Recycle post after publication
- **Spinnable text flag**: Posts contain spinnable syntax
- **Randomize queue after upload** (queue only): Checkbox
- **Scheduling (for scheduled posts)**:
  - Start publishing at: date/time picker
  - Frequency: Once every N [unit]
  - Days of week: Multi-select
  - Hours: Multi-select hourly windows
- **Auto-destruct** (optional): Delete posts after N [unit] of time
- **Post tags** (optional): Apply tag(s) to all uploaded posts
- Note: Images/video cannot be included in user-created CSV uploads; media is only preserved in CSV files exported from the app itself

---

#### 2.6.2 Bulk Download Scheduled Posts

- Export all scheduled posts (filtered by current filters) as a UTF-8 CSV file

---

#### 2.6.3 Bulk Pause / Resume Posts

- **Social profile**: Select which profile's posts/queues to pause
- **Action**: Pause publishing | Resume publishing
- **Scope**: Apply to scheduled posts for that profile | Apply to queues publishing to that profile

---

#### 2.6.4 Bulk Delete Posts

- Select which profile and scope to bulk delete from
- Destructive; confirmation required

---

### 2.7 Tags

Tags are internal organizational labels applied to posts and queue posts for filtering.

**Tag List View**

- List of all tags
- Per-tag: tag name, actions (Change/Rename, Delete)

**Add Tag**

- Name field only
- Tags are scoped to the user/account

**Tag Usage**

- Tags are applied at post creation time (multi-select)
- Tags filter the Scheduled Posts list and Queue Posts list

---

### 2.8 Webhooks

Webhooks allow external services (e.g., IFTTT, custom apps) to push posts into the scheduler via HTTP POST.

**Webhook List View**

- Filter by network
- Per-webhook: name, connected profile/queue, notes
- Per-webhook actions: Edit, Delete, View Notes

**Add/Edit Webhook**

- **Name**: Internal label
- **Network**: Platform selector
- **Destination**: Connect to a social profile (publish immediately) or connect to a queue (add to end)
- **Internal notes**: Markdown-supported

**Webhook API (inbound)**

The app exposes a unique URL per webhook. External services POST to that URL.

Text-only posts:

- Method: HTTPS POST
- Content-Type: `application/json`
- Fields: `title` (string), `body` (string)
- Network mapping: Twitter/Facebook/LinkedIn use `body`

Image/video posts:

- Method: HTTPS POST
- Content-Type: `multipart/form-data`
- Fields: `media_file` (file), `json_payload` (JSON-encoded string with `title` and `body`)

Rate limiting:

- 60 requests per webhook per rate window
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- 429 response when exceeded, with `retry_after` in seconds

HTML handling: HTML is stripped from `body` for Twitter/Facebook/LinkedIn.

**Webhook Security:**

- **HMAC-SHA256 signature verification** (optional): When creating/editing a webhook, the user can set a shared secret. When a shared secret is configured, incoming requests must include an `X-Webhook-Signature` header containing the HMAC-SHA256 digest of the raw request body using the shared secret. Requests with missing or invalid signatures are rejected with 401.
- **IP allowlist** (optional): Per-webhook IP allowlist. If configured, requests from IPs not on the list are rejected with 403.
- **Request body validation**: Reject payloads larger than 1 MB (413 response). Validate that required fields (`body`) are present. Sanitize any HTML from body text before storage.
- **Automatic IP blocking**: After 10 consecutive 429 (rate limit) responses to the same source IP, that IP is temporarily blocked for the duration of the rate limit window.

---

### 2.9 AI Post Generation

Integrates with OpenAI's ChatGPT API to generate posts and bulk-add them to a queue.

**Fields:**

- **Queue**: Select target queue
- **OpenAI API Key**: User supplies their own API key (not stored server-side — per-request only)
- **Topic**: Free-text. Use `and` to combine topics, `or` to alternate. No punctuation.
- **Number of posts**: Integer, 1–50
- **Character (role)** (optional): Dropdown — ~30 personas (Academic Researcher, Marketing Expert, Life Coach, etc.)
- **Tone** (optional): Dropdown — ~25 tones (Casual, Formal, Witty, Assertive, etc.)
- **Language** (optional): Dropdown — extensive list of world languages (defaults to English)
- Note on billing: OpenAI bills the user directly for API usage. The app does not mark up or resell this.

After generation, posts are added to the selected queue with a **draft** status by default. The user can review and promote them to active queue posts, or process them with any of the bulk queue operations (deduplication, randomize, modify text, etc.).

---

### 2.10 HTML to Markdown Converter

A standalone utility page.

- Input: HTML text area
- Output: Markdown text area
- Used to prepare content for platforms that accept Markdown
- No saving or post creation from this view

---

### 2.11 User Account & Settings

#### 2.11.1 Profile Settings

- **Email**: Used for system notifications
- **Username**: 3–100 characters, letters/numbers/underscore/hyphen
- **Profile image**: Upload avatar
- **First name / Last name**: For system communications
- **Timezone**: Full IANA timezone list — used to schedule posts at the correct local time
- **Date format**: 8 format options (mm/dd/yyyy or dd.mm.yyyy or yyyy-mm-dd, each with 12hr or 24hr clock)
- **Entries per page**: Number of rows shown on paginated list views

#### 2.11.2 Display Preferences

- **Timezone**: Same as profile (may be separately configurable for display vs. scheduling)
- **Date format**: Same options as profile
- **Entries per page**: List pagination size

#### 2.11.3 Change Password

- Current password, new password, confirm new password

#### 2.11.4 Two-Factor Authentication

- Enable/disable TOTP-based 2FA
- QR code setup flow

#### 2.11.5 Security Questions

- Set recovery questions and answers for account access recovery (used when email is not accessible)

#### 2.11.6 Email Logs

- Log of all system emails sent to the user (notifications, errors, etc.)
- Filterable/paginated list

#### 2.11.7 Notification Preferences

- **Publish failure alerts**: Enable/disable email notification when a post fails to publish after all retries are exhausted
- **OAuth token expiry warnings**: Enable/disable email notification when a connected profile's OAuth token is approaching expiration (default: 7 days before expiry)
- **Rate limit warnings**: Enable/disable email notification when platform API usage reaches a configurable threshold (e.g., 80% of monthly limit)
- **Queue empty alerts**: Enable/disable email notification when a queue runs out of posts

---

### 2.12 Post Scheduling Engine (Background Worker)

This is not a UI feature but is the core background system requirement.

**Requirements:**

- A persistent job/queue worker that runs independently of the web UI
- Polls all queues and scheduled posts continuously
- For each queue: checks if current time falls within the queue's configured schedule (day-of-week, hour window, interval)
- Publishes the next post in the queue to the connected social profile via the platform API
- After publish: marks post as published, records timestamp, logs result (success/error)
- If recycling is enabled: moves published post to the end of the queue
- For scheduled one-time posts: publishes at the specified datetime, marks as published
- For auto-destruct posts: schedules a delete call to the platform API after the specified time period
- Implements retry logic on transient errors (exponential backoff, max 3 retries)
- Records all publish attempts in a history log per post
- Rate limiting: respects platform-enforced limits (see Section 2.18 — Platform Rate Limit Tracking)
- Recommended implementation: Bull/BullMQ (Node.js) with Redis as the message broker

**Failure Handling & Dead Letter Queue:**

- After max retries (3) are exhausted: the post moves to a permanent `failed` state, a notification is sent (email + in-app), and the post requires manual intervention — the user must edit and reschedule, or delete the post
- BullMQ dead letter queue: jobs that fail all retries are moved to a dedicated dead letter queue for inspection and debugging
- **Crash recovery**: The worker uses BullMQ's built-in stalled job detection. If the worker crashes mid-publish, the stalled job is automatically retried by another worker instance (or the same worker on restart). To prevent duplicate publishes, the worker checks the platform API for an existing post before re-publishing (idempotency check using `platform_post_id` — see Section 2.25)
- **Duplicate publish prevention**: After a successful publish, the worker stores the platform-returned post ID in the `platform_post_id` column on the Post record. On retry, the worker checks if `platform_post_id` is already set — if so, the publish is skipped and the job is marked as successful

**Failure Notification Flow:**

- On publish failure after retry exhaustion: emit a notification event
- Notification events are processed by the notification service (see Section 2.20)
- Error details are recorded in the publish log and surfaced on the scheduled posts list

---

### 2.13 Spinnable Text

A cross-cutting content feature supported in post text fields.

**Syntax:** `{option1|option2|option3}`

- At publish time, one option is randomly selected from each spin group
- Multiple spin groups allowed in a single post
- The "contains spinnable text" checkbox/flag on the post form signals to the engine to apply spin resolution before publishing
- The Queue Posts list shows a "View Spinnable Text" action to preview all variants

---

### 2.14 Post History

Available on both Scheduled Posts and Queue Posts.

- Per-post modal/panel showing a log of all publish attempts
- Each entry: timestamp, success/failure, error message (if any)
- Error messages are also surfaced inline on the posts list for posts with status = error

---

### 2.15 Draft Posts

**Purpose:** Allow composing and saving posts without committing them to a schedule or queue.

**Functional Requirements:**

- A post can be saved with status `draft` from any post creation form via a "Save as Draft" action
- Draft posts appear in the Scheduled Posts list with a `draft` status badge
- Drafts are filterable by the status filter (Draft)
- Drafts do not have a scheduled publish time and are not picked up by the scheduling engine
- A draft can be edited and promoted to `scheduled` by assigning a publish date/time, or added to a queue
- AI-generated posts land in draft status by default, allowing review before activation
- Drafts support all the same fields as scheduled posts (media, tags, notes, spinnable text, etc.)

---

### 2.16 Character Counting

**Purpose:** Accurate character counting for each platform, accounting for platform-specific rules.

**Twitter/X:**

- Implement character counting using Twitter's `twitter-text` reference library (available as an npm package)
- URLs always count as 23 characters regardless of actual length (Twitter's t.co wrapping)
- Certain Unicode characters (e.g., CJK, some emoji) count as 2 characters
- Emoji character counting follows Twitter's specific rules (some emoji sequences count differently)
- Real-time character count displayed on the post creation form with color-coded indicator (green → yellow → red as limit approaches)
- Maximum: 280 characters per tweet; thread separator `[[tweet]]` resets the count

**Facebook:**

- Maximum: 63,206 characters
- Standard string length counting
- Display character count on form

**LinkedIn:**

- Maximum: 3,000 characters for shares
- Standard string length counting
- Display character count on form

---

### 2.17 Post Preview

**Purpose:** Show an approximate visual preview of how a post will render on each platform before publishing.

**Functional Requirements:**

- Each post creation form includes a "Preview" panel or toggle
- The preview renders the post text, media thumbnails, and link cards in a layout that approximates the target platform's visual style
- Twitter preview: shows avatar, display name, tweet text with t.co-style link shortening, attached media grid (1–4 images or video thumbnail), thread preview for multi-tweet posts
- Facebook preview: shows page name, post text, link card (if URL provided), media grid
- LinkedIn preview: shows profile/company name, share text, image preview, visibility indicator
- Preview updates in real-time as the user edits the post text and attaches media
- Spinnable text previews show one randomly selected variant with a "Respin" button to see alternatives

---

### 2.18 Platform Rate Limit Tracking

**Purpose:** Track API usage per connected profile against each platform's rate limits and warn the user before limits are hit.

**Twitter/X:**

- Track tweets posted per calendar month against the 500 tweets/month free tier limit
- Display current usage count on the profile detail view and on the dashboard
- Warning threshold: configurable (default 80%) — when usage exceeds the threshold, display a warning banner and send a notification (if enabled)
- When the limit is reached: the scheduling engine skips Twitter posts and logs an error with a clear message ("Monthly tweet limit reached"), rather than attempting to publish and receiving a 429
- **Pre-flight check on schedule/queue creation**: When a user schedules a new Twitter post or adds one to a queue, estimate the total tweets for the current calendar month (existing scheduled + queued + new additions). If the estimated total exceeds 450 (90% of the 500 limit), show a warning: "You are approaching the monthly tweet limit (estimated {count}/500)." If the estimated total exceeds 500, block the action with an error explaining the limit.
- **CSV bulk upload pre-flight**: When uploading a CSV targeting a Twitter profile, count the rows in the CSV, add to the current month's total, and apply the same warn-at-450 / block-at-500 logic before processing the upload

**Facebook:**

- Track against Facebook's Graph API rate limits (200 calls per user per hour)
- Implement backoff when approaching limits

**LinkedIn:**

- Track against LinkedIn's daily API call limits
- Implement backoff when approaching limits

**Dashboard Widget:**

- A summary widget on the main dashboard showing current usage vs. limits for each connected profile
- Color-coded status: green (below 50%), yellow (50–80%), red (above 80%)

---

### 2.19 OAuth Token Lifecycle Management

**Purpose:** Proactively manage OAuth token expiration and refresh to prevent silent publishing failures.

**Token Refresh Strategy:**

- **Facebook Page tokens**: Exchange short-lived tokens for long-lived tokens during initial OAuth flow. Long-lived tokens last ~60 days. The worker should attempt automatic refresh 7 days before expiry using the token refresh endpoint.
- **LinkedIn tokens**: Access tokens expire after 60 days. Refresh tokens (if available) last 365 days. The worker should attempt automatic refresh 7 days before expiry.
- **Twitter/X OAuth 1.1 tokens**: Do not expire unless revoked by the user. No automatic refresh needed, but the app should detect revocation errors and flag the profile.

**Token Health Monitoring:**

- A background job runs daily to check token expiry dates for all connected profiles
- Profiles with tokens expiring within 7 days are flagged with a warning badge in the Profile List View
- If automatic refresh fails, the profile is flagged as "Needs Re-authentication" and a notification is sent
- Profiles with expired/invalid tokens are excluded from the scheduling engine's publish loop — posts are skipped with a clear error message rather than failing silently

**Profile Status Indicators:**

- Green: token is valid, >7 days until expiry
- Yellow: token expires within 7 days, automatic refresh pending
- Red: token is expired or invalid, re-authentication required
- These indicators are shown in the Profile List View and on the dashboard

---

### 2.20 Notification System

**Purpose:** Alert the user to publish failures, token issues, and other events that require attention.

**Notification Channels:**

- **Email**: Primary channel. Uses the email address configured in User Settings.
- **In-app notification bell**: A notification icon in the web UI header that shows unread notification count and a dropdown of recent notifications.

**Notification Events:**

| Event | Default | Configurable |
|---|---|---|
| Post publish failure (after retry exhaustion) | Email + In-app | Yes |
| OAuth token expiring soon (7 days) | Email + In-app | Yes |
| OAuth token expired / re-auth required | Email + In-app | Always on |
| Platform rate limit warning (threshold hit) | In-app | Yes |
| Platform rate limit reached (publishing paused) | Email + In-app | Always on |
| Queue empty (no more posts to publish) | In-app | Yes |
| Bulk operation completed | In-app | No |

**Email Delivery:**

- Configure SMTP settings in the app's environment variables (Docker Compose)
- Required env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Emails are logged in the Email Logs view (Section 2.11.6)

---

### 2.21 Hashtag Sets & Saved Text Snippets

**Purpose:** Store reusable text fragments (hashtag groups, CTAs, signatures) for quick insertion into posts.

**Functional Requirements:**

**Snippet List View**

- List of all saved snippets
- Per-snippet: name, content preview, category (hashtag set / text snippet), usage count
- Actions: Edit, Delete, Copy to Clipboard

**Add/Edit Snippet**

- **Name**: Internal label (e.g., "Marketing hashtags", "Product launch CTA")
- **Category**: Hashtag Set | Text Snippet
- **Content**: The reusable text (supports multi-line)
- **Tags** (optional): Organize snippets with internal tags

**Usage in Post Creation**

- An "Insert Snippet" button/dropdown is available on all post creation forms
- Clicking a snippet inserts its content at the cursor position in the post text field
- Snippets can also be referenced in CSV bulk uploads using a `{{snippet:name}}` syntax that is resolved at upload processing time

---

### 2.22 Calendar View

**Purpose:** Provide a visual calendar showing all scheduled posts and queue runs across all profiles.

**Functional Requirements:**

- Monthly calendar view showing posts/queue events by day
- Weekly calendar view showing posts by day and time slot
- Daily calendar view showing detailed timeline of posts
- Color-coded by platform (e.g., blue for Twitter, dark blue for Facebook, teal for LinkedIn)
- Each calendar entry shows: post text preview (truncated), platform icon, time, profile name
- Click a calendar entry to open the post detail/edit view
- Click an empty time slot to create a new post pre-filled with that date/time
- Filter by: platform, social profile, tags
- Toggle visibility of queue-scheduled posts vs. one-time scheduled posts
- Navigation: previous/next month/week/day, "Today" button

**Conflict Detection:**

- When scheduling a post, check for existing posts on the same social profile within a ±5-minute window of the requested publish time. If a conflict is found, show a non-blocking warning: "Another post is scheduled for this profile at [time]." The user may proceed or adjust the time.
- The calendar view highlights conflicting time slots with a visual indicator (e.g., orange border or warning icon on overlapping entries) so the user can spot scheduling collisions at a glance

---

### 2.23 Media Storage

**Purpose:** Store uploaded media files (images, GIFs, videos) for use in posts.

**Storage Backend:**

- Default: Local filesystem storage using a Docker volume mapped to a persistent directory on the Proxmox host
- Optional: S3-compatible object store (e.g., MinIO running as an additional Docker container) for users who prefer external storage
- Configuration via environment variable: `MEDIA_STORAGE_BACKEND=local|s3`
- S3 configuration: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`

**File Processing:**

- On upload, generate a thumbnail (max 300px wide) for UI display in post lists and previews
- Store both original and thumbnail versions
- For images: validate format and dimensions, resize if exceeding platform limits before publish
- For videos: validate format, duration, and file size against platform limits. Transcode if necessary using `ffmpeg` (included in the Docker image) to meet platform encoding requirements (e.g., H.264 for Twitter, MP4 for Facebook)
- **Video transcoding is asynchronous**: The upload HTTP request returns immediately with status `processing`. A BullMQ job handles the actual transcoding in the background. The `MediaFile` record tracks transcoding state via the `transcode_status` column (`pending` → `processing` → `completed` | `failed`).
- **Transcoding timeout**: 5 minutes per file. If transcoding exceeds this limit, the job is marked as `failed` with an appropriate error message in `transcode_error`.
- **Publishing guard**: Posts with attached media in `processing` or `pending` transcode state cannot be published. The scheduling worker skips these posts with a log message ("Skipping post {id}: media still processing") and retries on the next cycle.
- For animated GIFs: validate file size against platform limits

**File Organization:**

- Files stored under: `{storage_root}/media/{profile_id}/{year}/{month}/{filename}`
- Filename: `{uuid}.{extension}` to avoid collisions
- Metadata (original filename, MIME type, dimensions, file size, upload date) stored in the database

**Cleanup:**

- Media files associated with deleted posts are soft-deleted (marked for cleanup)
- A weekly background job permanently deletes soft-deleted media files older than 30 days
- A "Storage Usage" indicator in Settings shows total media storage consumed

---

### 2.24 Security Architecture

**Purpose:** Define encryption, session management, and key handling requirements to protect credentials and user data.

**OAuth Token Encryption at Rest:**

- All OAuth tokens stored in the `SocialProfile` table are encrypted using AES-256-GCM before being written to the database
- The encryption key is provided via the `ENCRYPTION_KEY` environment variable — it is never stored in the database or committed to source control
- Each encrypted value is stored alongside its initialization vector (IV) and authentication tag

**Key Rotation Procedure:**

- The `SocialProfile` table includes a `token_encryption_version` column (INT, default 1) indicating which encryption key version was used
- To rotate the key: set `ENCRYPTION_KEY_OLD` to the current key, set `ENCRYPTION_KEY` to the new key, and run a migration command that decrypts all tokens with the old key and re-encrypts them with the new key, incrementing `token_encryption_version`
- During the rotation window, the app supports decrypting with either key based on the version column
- After rotation completes and is verified, `ENCRYPTION_KEY_OLD` can be removed

**Redis Security:**

- Decrypted OAuth tokens are never cached in Redis
- The worker loads encrypted tokens from Postgres, decrypts them in memory, uses them for the API call, and discards the decrypted value immediately after use
- Redis is used only for BullMQ job data, rate limit counters, and session storage — never for credential material

**CSRF Protection:**

- All state-changing HTTP requests (POST, PUT, DELETE) require a CSRF token
- CSRF tokens are issued per session and validated server-side
- Cookies use `SameSite=Strict` attribute to prevent cross-site request forgery

**Session Management:**

- Sessions use HTTP-only, Secure cookies (no JavaScript access to session tokens)
- Session expiry: 24 hours with a sliding window (activity resets the timer)
- On logout or expiry, the session is invalidated server-side

**OpenAI API Key Handling:**

- The user's OpenAI API key is never persisted to disk, database, or logs
- It is passed in the request body from the client, used for the single OpenAI API call, and discarded
- The key is never included in job payloads, BullMQ jobs, or Redis

**Content Security Policy:**

- HTTP response headers are configured via `helmet` (Node.js middleware) including: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`

---

### 2.25 Post Lifecycle & State Machine

**Purpose:** Define the complete set of valid post states and transitions to prevent invalid operations and ensure consistency.

**Valid States:**

| State | Description |
|---|---|
| `draft` | Post saved but not scheduled. Not picked up by the worker. |
| `scheduled` | Post has a future publish time assigned. Waiting for the worker. |
| `queued` | Post is in a queue and will be published on the queue's next run. |
| `publishing` | Worker has picked up the post and is actively making the API call. |
| `published` | Successfully published to the platform. |
| `failed` | All retry attempts exhausted. Requires manual intervention. |
| `auto_destructing` | Published post is waiting for its auto-destruct timer to fire. |
| `destroyed` | Post has been deleted from the platform via auto-destruct. |

**Valid Transitions:**

- `draft` → `scheduled` (user assigns a publish date/time)
- `draft` → `queued` (user adds post to a queue)
- `scheduled` → `publishing` (worker picks up the post at scheduled time)
- `queued` → `publishing` (queue schedule fires and selects this post)
- `publishing` → `published` (platform API confirms success)
- `publishing` → `failed` (all retries exhausted)
- `failed` → `scheduled` (user edits and reschedules the post)
- `failed` → `draft` (user resets to draft for further editing)
- `published` → `auto_destructing` (auto-destruct timer is set)
- `auto_destructing` → `destroyed` (worker deletes post from platform)
- `scheduled` → `draft` (user removes the schedule)
- `queued` → `draft` (user removes from queue)

**Blocked Actions:**

- Posts in `publishing` state cannot be edited or deleted — the UI disables edit/delete actions and the API rejects such requests with a 409 Conflict
- Published posts cannot be directly deleted from within the app — only auto-destruct is supported (the user can manually delete on the platform)

**Optimistic Locking:**

- The `Post` table includes a `post_version` column (INT, default 1), incremented on every update
- When the worker picks up a post for publishing, it reads the current `post_version`. Before making the platform API call, it performs a conditional update (`UPDATE ... WHERE id = ? AND post_version = ?`). If the version has changed (user edited the post while it was being processed), the publish is aborted and the job is re-queued.
- This prevents publishing stale content when a user edits a post moments before the scheduled publish time

---

### 2.26 Operational Monitoring

**Purpose:** Provide health check endpoints and structured logging for operational visibility and Docker orchestration.

**Health Check Endpoint:**

- `GET /health` — returns a JSON object with the following fields:
  - `status`: `"healthy"` | `"degraded"` | `"unhealthy"`
  - `redis`: `"connected"` | `"disconnected"` — result of a Redis PING
  - `postgres`: `"connected"` | `"disconnected"` — result of a simple query (`SELECT 1`)
  - `worker_alive`: `true` | `false` — based on worker heartbeat (see below)
  - `pending_jobs`: integer — count of pending jobs in the BullMQ publish queue
  - `last_publish_at`: ISO 8601 timestamp | `null` — timestamp of the most recent successful publish
- Overall `status` is `"healthy"` if all subsystems are connected, `"degraded"` if the worker is down but DB/Redis are up, and `"unhealthy"` if Postgres or Redis is disconnected
- The endpoint does not require authentication (it returns only operational status, no sensitive data)

**Docker Healthcheck:**

- The Docker Compose file includes a healthcheck for the `web` service: `curl -f http://localhost:3000/health || exit 1` with interval 30s, timeout 5s, retries 3
- The `worker` service healthcheck verifies the worker process is running

**Worker Heartbeat:**

- The BullMQ worker reports a heartbeat timestamp to Redis on every job completion and at a regular interval (every 30 seconds)
- The `/health` endpoint checks the heartbeat timestamp — if no heartbeat has been received for 60 seconds, `worker_alive` is reported as `false`

**Structured Logging:**

- All log output is structured JSON (not plain text) for compatibility with log aggregation tools
- Each log entry includes: `timestamp`, `level` (info/warn/error), `message`, `correlation_id`, and context-specific fields
- **Correlation IDs**: Every HTTP request is assigned a unique correlation ID (UUID) via middleware, passed through to the worker via BullMQ job data, and included in all log entries related to that request/job chain
- Sensitive data (tokens, API keys, passwords) is never included in log output

---

### 2.27 Post Search

**Purpose:** Enable full-text search across post content to help the user quickly find specific posts.

**Implementation:**

- Use PostgreSQL's built-in full-text search (`tsvector` / `tsquery`) — no external search engine is needed for a single-user application
- A `search_vector` column (type `tsvector`) is added to the `Post` and `QueuePost` tables, maintained via a trigger that updates on insert/update
- The search vector indexes: post text content, internal notes, and associated tag names
- A GIN index on the `search_vector` column ensures fast query performance

**Search Availability:**

- Search is available on: the Scheduled Posts list view, the Queue Posts list view, and the Calendar view
- A search input field is added to each view's filter bar
- Search works in combination with existing filters (platform, status, tags, profile)

**Search Results:**

- Results are returned ranked by relevance (PostgreSQL `ts_rank`)
- Matching text is highlighted in the search results using `ts_headline` — matched terms are wrapped in `<mark>` tags for visual emphasis
- Search is case-insensitive and supports stemming (e.g., searching "marketing" also matches "marketed", "markets")

---

## 3. Data Model Summary

| Entity | Key Fields |
|---|---|
| User | email, username, password_hash, timezone, date_format, page_size, 2fa_secret, profile_image, notification_preferences (JSON) |
| SocialProfile | id, user_id, network (twitter/facebook/linkedin), account_name, oauth_tokens (encrypted), token_expires_at, token_status (valid/expiring/expired), token_encryption_version (INT DEFAULT 1), token_refreshed_at (TIMESTAMP nullable), label, notes, connected_at |
| Queue | id, user_id, profile_id, name, schedule_config (JSON), notes, created_at |
| Post | id, user_id, profile_id, queue_id (nullable), content (JSON), post_type, status (draft/scheduled/queued/publishing/published/failed/auto_destructing/destroyed), post_version (INT DEFAULT 1), platform_post_id (TEXT nullable — ID returned by the platform after publish), spin_variant_used (TEXT nullable — the resolved spin text actually published), scheduled_at, published_at, recycled (bool), spinnable (bool), auto_destruct_config (JSON), search_vector (tsvector), created_at |
| QueuePost | id, queue_id, post_content (JSON), post_type, position (int), spinnable (bool), status (draft/active), search_vector (tsvector), created_at |
| Tag | id, user_id, name |
| PostTag | post_id, tag_id |
| Webhook | id, user_id, profile_id or queue_id, name, token (unique URL slug), notes |
| PublishLog | id, post_id, attempted_at, success (bool), error_message |
| MediaFile | id, user_id, post_id (nullable), storage_path, thumbnail_path, original_filename, mime_type, file_size, width, height, transcode_status (ENUM: pending/processing/completed/failed — nullable, applies to video files only), transcode_error (TEXT nullable), uploaded_at, deleted_at (nullable) |
| Snippet | id, user_id, name, category (hashtag_set/text_snippet), content, usage_count, created_at |
| Notification | id, user_id, event_type, message, read (bool), created_at |
| RateLimitUsage | id, profile_id, period_start, period_end, usage_count, limit_value |

---

## 4. Platform API Notes

### Twitter/X

- User must supply their own Twitter Developer App credentials (OAuth 1.1)
- Free tier API (v2 Free): 500 tweets/month write limit. At typical posting frequency, the free tier should be sufficient.
- Supports: text tweets, image tweets (up to 4 images), GIF, video, tweet threads
- Auto-destruct: DELETE tweet endpoint
- Requires storing: Consumer Key, Consumer Secret, Access Token, Access Token Secret per profile
- Tokens do not expire unless revoked — detect revocation via API error response (401)

### Facebook

- OAuth via Facebook Graph API
- Connects to Pages (not personal profiles)
- Supports: text posts, image posts (up to 10), video posts, URL link posts
- Auto-destruct: DELETE post endpoint
- Requires: Page Access Token
- Short-lived tokens must be exchanged for long-lived tokens (valid ~60 days)
- Long-lived tokens can be refreshed before expiry via the token refresh endpoint
- Rate limit: 200 calls per user per hour (Graph API)

### LinkedIn

- OAuth via LinkedIn API v2
- Supports: Personal Profile and Company Page
- Supports: text shares, single image shares
- Visibility control: public vs. connections-only
- No auto-destruct natively — app handles via scheduled delete job in the worker
- Access tokens expire after 60 days; refresh tokens last 365 days
- Daily API call limits apply

---

## 5. Infrastructure & Architecture Notes

### Docker Compose Services

- `web` — Node/React frontend + Express/Node API server
- `worker` — Background job processor (BullMQ)
- `redis` — Job queue broker (BullMQ dependency)
- `postgres` — Primary database
- `nginx` — Reverse proxy with TLS termination (required for OAuth callbacks and webhook ingress)

**HTTPS is required** (not optional) because OAuth callback URLs for Facebook and LinkedIn require HTTPS, and webhooks should be served over HTTPS. For Proxmox environments, use Cloudflare Tunnel or Let's Encrypt via nginx.

### Key Architectural Decisions

- The scheduler worker must run continuously and independently — do not rely on cron jobs inside the web container
- OAuth tokens must be encrypted at rest in the database (AES-256-GCM recommended; encryption key stored as environment variable, not in the database)
- All times stored in UTC; converted to user's timezone for display and input. DST transitions are handled by the IANA timezone database — always use the user's IANA timezone identifier, never a fixed UTC offset.
- CSV import/export is synchronous (small files) or async (large files)
- AI generation calls are synchronous per request (user waits for OpenAI response)
- Webhook endpoint must be publicly accessible (via Cloudflare Tunnel or similar)

### Database Migrations

- Use a migration tool (e.g., `node-pg-migrate`, Knex migrations, or Prisma Migrate) to manage schema changes
- Migrations run automatically on container startup before the web server begins accepting requests
- Each migration is versioned and idempotent
- The migration runner acquires an advisory lock to prevent concurrent migration execution (important if multiple containers start simultaneously)
- Rollback scripts are maintained for each migration

### Backup & Restore

- **Database**: Automated daily `pg_dump` via a cron job in a dedicated backup container (or a simple script in the `postgres` container). Backups stored on the Proxmox host filesystem outside the Docker volumes.
- **Media files**: Daily rsync of the media storage directory to a backup location on the Proxmox host.
- **Redis**: Enable Redis RDB persistence. Redis data is recoverable but not critical — BullMQ jobs can be reconstructed from the database state.
- **Encryption keys**: Document that the `ENCRYPTION_KEY` environment variable must be backed up separately and securely. Loss of this key means OAuth tokens cannot be decrypted and all profiles must be re-authenticated.
- **Restore procedure**: A documented one-command restore script that:
  1. Stops all containers
  2. Restores the Postgres dump
  3. Restores the media directory
  4. Restarts all containers
  5. Runs any pending migrations
- **Retention**: Keep 7 daily backups and 4 weekly backups by default (configurable)

---

## 6. Out of Scope

The following features are explicitly excluded from this build:

- Bluesky, Discord, Mastodon, Tumblr, WordPress.com, WordPress.org support
- Team and collaboration features (multiple users, associates, review/approval workflow)
- RSS feed post sourcing
- Blog management
- Pricing/subscription/licensing management
- Affiliate program
- Multi-team management
- Analytics / post performance metrics (likes, retweets, comments pulled from platforms)
- Link shortening / UTM parameter management

---

## 7. Feature Priority (Suggested Build Order)

1. User auth (login, password, 2FA, timezone/prefs)
2. Social profile connection — Twitter first (OAuth 1.1)
3. Media storage infrastructure (local filesystem + thumbnail generation)
4. Post creation — Twitter (text, images, thread support) with character counting (`twitter-text`)
5. Draft posts support
6. Scheduled posts list with status tracking
7. Scheduling engine / background worker + publish loop
8. Post preview (Twitter first)
9. Queue system (queue config, queue posts CRUD, recycling)
10. OAuth token lifecycle management (health checks, auto-refresh, status indicators)
11. Notification system (in-app + email via SMTP)
12. Calendar view
13. Tags
14. Hashtag sets & saved text snippets
15. Bulk upload (CSV import)
16. Bulk download (CSV export)
17. Facebook profile + post creation + preview
18. LinkedIn profile + post creation + preview
19. Platform rate limit tracking + dashboard widget
20. Bulk queue operations (randomize, purge, copy, modify text, deduplicate)
21. Bulk pause/resume
22. AI post generation (OpenAI integration)
23. Webhooks (inbound API)
24. Auto-destruct posts
25. Email logs
26. HTML-to-Markdown utility
27. Backup & restore automation
28. Database migration automation

---

## 8. Platform Notes & Gotchas

**On Twitter/X:** The free developer tier gives you 500 tweets/month (write), which at a few tweets per day is perfectly fine. You'll need to register a Developer App at developer.twitter.com and use OAuth 1.1 credentials — you store these in the app per connected account.

**On the queue worker:** This is where the real architecture complexity lives. BullMQ + Redis is a natural fit for Docker and Node.js — it gives you reliable job scheduling, retries, and persistence without needing a heavyweight message broker.

**On LinkedIn auto-destruct:** LinkedIn doesn't have a native delete-by-schedule API endpoint the way Twitter does, so auto-destruct for LinkedIn would need to be a scheduled delete job your worker handles, calling the delete post API at the calculated future time.

**On DST transitions:** When a user schedules a post for "9:00 AM Eastern" and a DST transition occurs between now and the scheduled time, the app must respect the IANA timezone (America/New_York) and resolve to the correct UTC time at scheduling time. If a queue runs at "every day at 9 AM," DST handling means the UTC offset shifts — BullMQ cron jobs should use the timezone-aware cron option.

**On media processing:** Video transcoding via ffmpeg can be CPU-intensive. For the worker container, ensure adequate CPU allocation on Proxmox. Consider processing media uploads asynchronously (queue a processing job) rather than blocking the upload HTTP request.
