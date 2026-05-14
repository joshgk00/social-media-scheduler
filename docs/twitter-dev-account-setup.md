# Twitter / X Dev Account Setup

One-time setup for connecting a Twitter/X profile to the scheduler. The
scheduler uses **OAuth 1.0a** with four manually-supplied credentials —
no callback flow, no browser redirect, no stored tokens from an OAuth
dance. You paste four strings into the Connect Profile dialog and the
app encrypts them with AES-256-GCM before writing to the database.

Scratchpad for your own credentials lives in `.env.local` at the repo
root (gitignored). That file is not loaded by the app — it's just a
clipboard source.

---

## 1. Create a throwaway X account (strongly recommended)

Free-tier write cap is **500 tweets/month per app** and you'll burn
through that fast during UAT of state transitions, conflict detection,
edit flows, and publish-now tests. Don't point this at your real handle.

Steps:

1. Use a **different email** than your real account. Gmail `+` aliases
   work fine: `yourname+smstest@gmail.com` still lands in your normal
   inbox but X treats it as distinct.
2. Sign up at https://x.com. Use a plausible display name and bio —
   brand-new empty accounts with no profile details occasionally get
   flagged for spam when applying for dev access.
3. **Verify by phone.** X requires phone verification before letting
   you apply for a developer account. A VoIP number usually won't
   work; use a real mobile. You can remove the phone from the account
   after dev access is granted.
4. **Let it age.** Brand-new accounts (< 30 min old) applying for dev
   access sometimes get rejected. Walk away for a few hours. This doc
   exists so you can come back and pick up where you left off.
5. While you wait, fill in `TEST_TWITTER_HANDLE`, `TEST_TWITTER_EMAIL`,
   and `TEST_TWITTER_PHONE` in `.env.local` so you don't forget them.

---

## 2. Apply for a Developer account

After the account has aged a bit:

1. Sign in as the test account.
2. Go to
   <https://developer.x.com/en/portal/petition/essential/basic-info>.
3. Pick the **Free** tier. Do not pick Basic or Pro — those are paid
   ($100/mo and up) and you don't need them. Free gives 500 writes/mo
   per app and 1,500 reads/mo per user, which is plenty for a
   single-user scheduler.
4. **Use case description** — keep it honest and specific. Example:

   > Personal self-hosted scheduling tool for my own account. I'm
   > building a queue-based scheduler to replace a SaaS product and
   > publish my own posts from my own infrastructure. Read + write
   > access to my own timeline only. No other users, no analytics
   > pipeline, no data resale, no redistribution.

   Avoid buzzwords like "AI", "automation", "bot", "engagement" — the
   approval system flags these. "Personal scheduling tool" is the
   magic phrase.

5. Agree to the developer agreement. Free tier approval is typically
   instant; occasionally it goes to manual review and can take 1-2
   days.

---

## 3. Create a Project + App

Once approved, you're in the developer portal:

1. **Create Project** — name it whatever. `social-media-scheduler`
   is fine. Pick a use case category ("Exploring the API" works).
2. Inside the project, **Create App**. The app name must be
   globally unique — append your handle or a suffix, e.g.
   `sms-josh-dev`.
3. Immediately after creation, the portal shows **API Key** and
   **API Key Secret**. These are shown **once**. Copy both now into
   `.env.local`:
   - `TWITTER_CONSUMER_KEY` ← API Key
   - `TWITTER_CONSUMER_SECRET` ← API Key Secret

   If you miss this screen, you can regenerate them later from the
   Keys and Tokens tab, but regeneration invalidates the previous
   values.

---

## 4. Set permissions to Read + Write (DO THIS BEFORE GENERATING TOKENS)

This is the step that catches everyone. Skip it and you'll generate
read-only tokens, the scheduler will get 403s on every post attempt,
and you'll have to come back, fix permissions, **and regenerate
tokens** (old tokens don't inherit new permissions).

1. In your app, click **Settings** tab.
2. Under **User authentication settings**, click **Set up**.
3. **App permissions**: select `Read and write`.
4. **Type of App**: select `Web App, Automated App or Bot`.
5. **App info** — fill in the required fields:
   - Callback URI / Redirect URL: `http://127.0.0.1:5173/`
     (required field but unused — the scheduler doesn't do OAuth
     redirect flow, it uses the four-credential PIN-less flow)
   - Website URL: any valid URL, e.g. `http://localhost:5173`
6. Click **Save**.

---

## 5. Generate the Access Token + Secret

Now that permissions are Read+Write:

1. Go to the **Keys and Tokens** tab.
2. Under **Access Token and Secret**, click **Generate**.
3. Copy both values into `.env.local`:
   - `TWITTER_ACCESS_TOKEN` ← Access Token
   - `TWITTER_ACCESS_TOKEN_SECRET` ← Access Token Secret

   Also shown once. Regeneration invalidates the previous pair.

4. Under each generated token, the portal shows the permission level.
   Verify it says **Read and Write** (not Read Only). If it says
   Read Only, go back to step 4, fix the app permissions, then
   regenerate the tokens here.

At the end of this step, `.env.local` should have all four real
credentials populated.

---

## 6. Sanity-check the write permission

Before wiring into the scheduler UI, confirm the token can actually
post. The scheduler's `POST /api/profiles` handler calls
`GET /2/users/me` as its validation step — so the easiest sanity check
is to just let the Connect Profile dialog do the work. A 200 from
`users/me` proves the token is valid; a 403 on an actual tweet would
then point to a permission mismatch.

If you want to test from the command line first, signing OAuth 1.0a by
hand is painful. Use a small Node one-liner instead:

```bash
cd packages/api
node -e "
  const { TwitterApi } = require('twitter-api-v2');
  const client = new TwitterApi({
    appKey: process.env.TWITTER_CONSUMER_KEY,
    appSecret: process.env.TWITTER_CONSUMER_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });
  client.v2.me().then(r => console.log('OK:', r.data)).catch(e => console.error('FAIL:', e.data || e.message));
" $(grep -E '^TWITTER_' ../../.env.local | xargs)
```

Expected output: `OK: { id: '...', name: '...', username: '...' }`.

If it fails with "Could not authenticate you", one of the four values
is wrong or has stray whitespace. If it fails with 403 on write-level
endpoints but 200 on `users/me`, re-do step 4 + step 5.

---

## 7. Connect the profile in the scheduler UI

1. Start the stack: `npm run dev` (or whatever your normal command
   is).
2. Log into the scheduler.
3. Navigate to `/profiles`.
4. Click **Connect Profile**.
5. Paste the four credentials from `.env.local` into the masked
   fields. The eye-icon toggles reveal each field independently.
6. Submit.

Expected result: a profile card appears with the test account's
avatar, display name, @handle, "Twitter/X" badge, and a "connected on
..." timestamp. A toast confirms success.

---

## 8. Test the validation error path (optional, before step 7)

If you want to see the error UX before you have real credentials,
paste the `PLACEHOLDER_*` values from `.env.local` into the Connect
Profile dialog. Twitter will reject the garbage keys, the app will
classify the error as "invalid credentials", and you'll see an inline
error message:

> Could not verify these credentials. Please check that all four
> values are correct and that your Access Token has Read + Write
> permission.

This exercises the full request/response round-trip without needing
real dev access — useful while the test account is still aging.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Could not verify these credentials" on every attempt | Whitespace pasted into one of the fields | Re-copy from `.env.local`, watch for trailing newlines |
| Profile connects but posting fails with 403 | Tokens generated before app permissions were set to Read+Write | Portal → Keys and Tokens → regenerate Access Token and Secret, re-connect in UI |
| Profile connects but posting fails with 401 | Consumer key/secret were regenerated after you saved them | Portal → Keys and Tokens → copy fresh values, update `.env.local`, disconnect and reconnect in the scheduler |
| 429 Too Many Requests during UAT | Hit the 500 writes/month cap, or per-15-minute burst limit | Use Save as Draft / Schedule Post instead of Publish Now; wait for window to roll |
| Test account suspended the day after signup | X anti-spam flagged it as a new empty account | Add a profile picture, bio, and one innocuous tweet before applying for dev access next time |
| "Could not authenticate you" from `users/me` but credentials look right | Often a clock skew issue with OAuth 1.0a signing | `sudo sntp -sS time.apple.com` (macOS) to resync system clock |

---

## Budget notes

- **500 writes/month, per app.** Counts every successful POST to
  Twitter's write endpoints.
- **Drafts and scheduled posts are free** — they don't hit the API
  until the worker publishes them. Phase 4 (the publish worker) isn't
  built yet, so scheduled posts will sit in Postgres and never
  consume quota during Phase 3 UAT.
- **Publish Now** is the only path that actually writes during
  Phase 3 testing. Reserve it for one or two end-to-end smoke tests.
- Deleting a tweet from X does **not** refund the quota. The counter
  is per-API-call, not per-live-tweet.
- The quota resets on the first of each calendar month (UTC).

---

## Credential hygiene

- Never paste real credentials into a chat, commit message, or
  screenshot. `.env.local` is gitignored; keep them there.
- If you regenerate any of the four values, disconnect and
  reconnect the profile in the scheduler — the old encrypted copy
  in the DB is now dead.
- If credentials are ever exposed (committed, pasted somewhere
  public, etc.), go to the developer portal, regenerate both the
  consumer pair and the access token pair, then reconnect the
  profile in the scheduler.
- Rotation: the scheduler has a `token_encryption_version` column
  for key rotation at the application layer, but Twitter credentials
  themselves can be rotated manually at any time via the developer
  portal.
