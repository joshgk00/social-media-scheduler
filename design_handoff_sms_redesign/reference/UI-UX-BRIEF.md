# UI/UX Brief — Social Media Scheduler

This brief accompanies the screenshot set in this archive. Hand the whole archive to Claude Design.

## What this app is

A self-hosted Twitter / LinkedIn / Facebook scheduler. Single-user, runs on the operator's own infrastructure (Docker Compose on Proxmox in the typical deploy). The user owns the OAuth credentials and the data — there is no SaaS layer. Built as a SocialOomph replacement.

Primary jobs:

1. **Compose** a post once and have it go out at a chosen time (or feed it into a recurring queue).
2. **Manage queues** that auto-publish on a recurring schedule with hour-window filters.
3. **Connect & manage** social profiles, see token health and rate-limit headroom.
4. **Watch the schedule** on a calendar to catch conflicts or gaps.

It's a single-operator tool — never multi-tenant — so UX can be opinionated and dense.

## Tech context for redesign output

- Vite + React 19, React Router 7. Tailwind / shadcn-style component primitives.
- TanStack Query for server state, Zustand for UI state, React Hook Form + Zod for forms.
- Currently dark-theme only. The visual language is "developer admin tool" — flat blacks (`#0A0A0A` ish), thin white text, no accent color beyond status indicators (red for danger, green for healthy/active).
- WCAG AA contrast is a project standard.

The redesign should keep the React component architecture but can replace the visual language wholesale.

---

## Problems, by severity

### Critical — visibly broken or misleading

1. **Sidebar nav active state is wrong on every screen.** "New Post" stays highlighted across every page (Dashboard, Posts, Queues, Calendar…) even when the user is not on the New Post route. Look at any screenshot — `02-dashboard/01-dashboard.png`, `03-posts/01-posts-list.png`, etc. The page title is right, but the sidebar lies about where you are.

2. **Security page reports impossible session count.** `08-settings/01b-settings-security.png` shows *"You are logged in on **3470 devices**"*. That's not a typo — the session table never prunes expired entries, and the UI surfaces the raw count. Either render this honestly (active sessions, last 7d) or stop showing the number at all.

3. **Calendar Month view renders the day-name header but no day cells beneath it.** See `05-calendar/01-calendar.png` and `05-calendar/05-calendar-month-full.png` — `Sun Mon Tue Wed Thu Fri Sat` row appears, but the grid below is empty. (Compare `02-calendar-day.png` and `03-calendar-week.png` which do render content.) Either it's a real bug or it's an empty-state that fails to communicate "no events this month." Either way, the redesign needs an unambiguous empty state.

4. **Twitter-only copy in a multi-platform composer.** `03-posts/02-posts-new.png` and `03-posts/08-posts-new-filled.png` — labels say *"Tweet text"*, *"Your tweet preview will appear here…"*, placeholder *"What's happening?"*. Even when the selected profile *is* a Twitter account this is fine; when LinkedIn or Facebook is selected, the labels stay Twitter-themed. The composer needs to either dynamically rename per platform or use generic terms ("Post text", "Post preview").

5. **Profile display in the Posts list is inconsistent.** `03-posts/01-posts-list.png` — one row shows `@JS9429587142272` (raw Twitter user-id-looking handle), most show `@codexlocal` (sensible display). The first row is the same profile as `JS (deprecated)` in `06-profiles/01-profiles-list.png` but rendered very differently. Treatment of "deprecated" / unhealthy profiles needs to be either consistent with the rest or visually distinguished on purpose.

### Major — significant comprehension or workflow drag

6. **Dashboard is sparse and leads with the wrong widget.** `02-dashboard/01-dashboard.png` shows only a "Rate Limits" table. Rate limits are an exception-state concern, not a primary at-a-glance metric. The first thing a returning user should see: *what's queued up to publish in the next 24 hours*, *which queues are active*, *any errors that need attention*. The dashboard is currently the least useful page in the app.

7. **Connect Profile modal mixes three platforms with mismatched UI density.** `06-profiles/02-connect-profile-modal.png` — LinkedIn and Facebook are one-click OAuth buttons; Twitter requires 4 manually-entered secrets (Consumer Key + Secret + Access Token + Secret) plus eye-icon reveal toggles. The modal is taller than the viewport. Either tab the platforms (one at a time) or push Twitter's complexity behind a "Use Developer App credentials" disclosure.

8. **Queue creation form's "Interval type" + "Hour windows" model is opaque.** `04-queues/02a-queues-new-full-fixed.png` and `04-queues/02b-queues-new-full-variable.png`. Filed as `gh#94`. Operator's stated case ("publish Mon-Fri at 8 / 12 / 3") has no obvious form path. Variable interval = "N hours after last publish, filtered by hour windows." Fixed interval = "every Nth slot of every hour, where the windows filter which slots fire." Nobody constructs that mental model from "I want three posts a day." The shipped help text below the Interval select mitigates this slightly but doesn't solve it. The redesign should consider a third "Specific times" mode, OR a live preview of the next 5 publish times so the user can experiment without saving.

9. **Settings IA is split between top tabs and a stray peer button.** `08-settings/01-settings.png` — tabs across the top read *Profile · Preferences · Security · Notifications · Storage*, but a "Snippets" button hangs immediately below them as a same-level peer. Either Snippets is a tab (consistent treatment), a sidebar item (it's a content library, not really a setting), or a section heading. Right now it's an orphan.

10. **Native date / time inputs are jarring inside an otherwise styled form.** Both `03-posts/02-posts-new.png` (Schedule field, `mm/dd/yyyy, --:--`) and `04-queues/02-queues-new.png` (Start date). Native browser pickers don't match the dark theme, don't expose useful affordances ("schedule for 1 hour from now"), and look broken on hover. A custom date-time picker with shortcut buttons is a clear win.

11. **The "x" icon next to profile labels on the Dashboard rate-limits table is misleading.** `02-dashboard/01-dashboard.png` — each profile row starts with what looks like a delete icon but is presumably a platform indicator. Replace with the real platform glyph (Twitter/X bird, LinkedIn "in", Facebook "f") or drop it entirely if redundant with the profile name.

12. **The notifications page is wall-to-wall red.** `07-notifications/01-notifications.png` — multiple "Publish failed", "Rate limit reached", etc., each row shows a red ! icon and the Severity column ALSO says "Error" in red. The severity is encoded three times (icon, row colour wash, text column) and dominates a page that should be scannable. Visual treatment needs collapsing.

13. **Failed-post error context lives in two places at once.** `03-posts/01-posts-list.png` has the truncated *"Your client app is not configured …"* in the Error column. Expanding the row (`03-posts/04-posts-row-expanded.png`) shows the same message again under "Failure Reason" plus an empty "Publish History". Pick one disclosure pattern.

### Moderate — clunky, fixable in a redesign pass

14. **Import Posts wizard ("Don't Import" / "Import" footer buttons).** `03-posts/10-import-full.png` — the cancel button is labelled *"Don't Import"*. Standard pattern is "Cancel" or "Back to Posts". The numbered-step layout is otherwise good — keep that structure.

15. **Bulk actions menu opens to the *left* of the trigger button and overlays the table headers.** `03-posts/11-bulk-actions-menu.png`. The grouping (Publishing controls / Edit / Export / Danger zone) is well-organised — preserve the grouping in the redesign — but the popover position needs reconsidering.

16. **"Resets in 10d (Jun 1)" is two redundant time formats.** Dashboard rate-limits table (`02-dashboard/01-dashboard.png`). Pick one.

17. **Profile cards (`06-profiles/01-profiles-list.png`) repeat low-value metadata.** Every card lists *"Connected N days ago / Never published / No posts scheduled / 0 / 500 tweets (0%)"* in a four-line stack. For a profile that's never been used (most of them), three of those four lines say nothing. Collapse to a single compact line and elevate "next scheduled post" or "last published" when relevant.

18. **Status pills aren't consistent.** Posts list (`03-posts/01-posts-list.png`) — `Failed` is a filled red pill with white text; `Scheduled` is an outline pill with a small clock icon; `Queued` is an outline pill with a small dot icon; `Draft` is a filled grey pill with an icon. Pick one shape language (outline-with-icon is the safest) and apply consistently across statuses.

19. **The "Spinnable text" feature is hidden behind a toggle with a one-line explainer.** `03-posts/06-posts-edit.png` shows *"Spinnable text · Use {option1|option2} syntax. One variant is randomly chosen at publish time."* The feature is power-user gold for queue variety but the explanation is too terse. A live preview ("Hello {there|world}!" → swatches showing both renderings) would unlock it.

20. **No breadcrumbs.** Going to a queue's posts (`/queues/:id/posts`, `04-queues/05-queue-posts.png`) gives you the page contents but no back-to-queue or back-to-queues-list affordance other than the sidebar nav.

### Minor / polish

21. **Single theme.** Dark only. A light option would help during the day; even if dark stays the default, the theme tokens should be defined so light can flip on.

22. **Forgot-password link is just a tiny underlined text below the Sign In button.** Login (`01-public/01-login.png`). It's the only recovery affordance — give it more visual weight or move into a clearer "Need help signing in?" group.

23. **"Recover" page asks for email then jumps straight to security questions.** `01-public/02-recover.png`. Pattern is fine, but the page header *"Account Recovery"* could promise the steps up front ("Step 1 of 3: Confirm your email").

24. **Calendar's segmented controls have two stacks visually identical but semantically different.** *Scheduled / Queued / Both* (filter) and *M / W / D* (view) (`05-calendar/01-calendar.png`). Same shape, opposite ends of the toolbar. The view-switcher in particular has single-letter labels that aren't immediately readable.

25. **Notification bell badge stays at "7" everywhere.** No snooze, no "mark all read from header." The notifications page has a Read/Unread/All filter (`07-notifications/01-notifications.png`) but no bulk action.

26. **"Admin queues" in the main sidebar.** `02-dashboard/01-dashboard.png` etc. — it's a redirect to Bull Board (BullMQ's admin dashboard for the worker queues — see `09-admin/bull-board/` for what it looks like). That's an operator/debug tool, not a user-level navigation item. Move under Settings or behind a power-user toggle.

27. **"JS (deprecated)" / "UAT Test 21" / "UAT Test 24 Rebuild" / "UAT Test 24 Retry" profile names in the dev fixture data.** `06-profiles/01-profiles-list.png`. Not a UX problem — just noise in the screenshots Claude Design will see. Real users will have profile names like "Personal Twitter" or "Brand LinkedIn". Don't redesign around the test names.

---

### The Bull Board layer — design-system collision

The `/admin/queues` link in the sidebar redirects to **Bull Board** (`@bull-board/express` — a third-party operator dashboard for BullMQ). See `09-admin/bull-board/` for full captures. Worth knowing for the redesign:

- **Completely different visual language.** Light theme, default sans-serif, neutral greys, no shared design tokens with the React app. Going from the scheduler's dark UI to Bull Board feels like crossing into a different product.
- **It is genuinely useful.** Three worker queues are exposed (`publish`, `notification`, `bulk-ops`) with filters for ACTIVE / WAITING / PRIORITIZED / COMPLETED / FAILED / DELAYED / PAUSED. Per-job JSON inspection, retry, clean. This is where the operator goes when something didn't publish and they want to know why.
- **You don't control its visuals.** Bull Board ships with its own UI. Re-skinning it is possible but fragile and not worth Claude Design's time. The redesign should accept that this layer stays as-is.
- **What the redesign *should* do** is reframe the entry point. Instead of an "Admin queues" sidebar link that yanks the user into a different design system with no warning, treat it as an external operator tool. Options:
  - Move it under a Settings → Advanced section labeled "Worker queue inspector (Bull Board)" so the visual transition is intentional and labeled.
  - Open it in a new tab.
  - Add a tiny "Powered by Bull Board" header / banner inside the iframe-style page that explains the visual mismatch.
- **The notification queue has 8,297 failed jobs** (`09-admin/bull-board/06-notification-failed.png`). All are `queue-empty` events. That is a real production bug — the queue-empty notification handler is failing silently and accumulating across 830 pages of history. **Not a redesign concern**, but worth filing as a follow-up issue independent of this work.

## What to preserve

The redesign shouldn't throw these out:

- **Sidebar + content split** is the right layout for an operator tool with this many sections.
- **Status pill + expandable row** pattern in the Posts list is good — keep the disclosure idea even if the visual changes.
- **Bulk actions grouping** (Publishing controls / Edit / Export / Danger zone) is excellent IA, with the red "Danger zone" label distinguishing destructive operations.
- **Per-profile rate-limit progress bars** with the 0/500 tweets text. Twitter's free tier is the binding constraint and surfacing the consumed-vs-cap is genuinely useful — just present it somewhere more discoverable than as the only thing on the dashboard.
- **Numbered-step Import Posts page** (`03-posts/10-import-full.png`) — 1. Target → 2. Profile → 3. File. That's the right shape; just polish the copy.
- **Inline failure reason** on a failed post (expanded row in `03-posts/04-posts-row-expanded.png`) is the right place for it. Just don't also show it in the table column.

---

## Style direction the redesign should answer

If Claude Design wants directional input, these are the open questions worth resolving:

1. **Density vs comfort.** This is a power-user dashboard, not a marketing site. Compact rows, small typography, lots of information per screen — yes. But the current dark-only flat-black treatment feels unfinished rather than minimal. A clear distinction between surfaces, hover states with feedback, and an accent colour beyond status red/green would help.

2. **Accent / brand colour.** The app has none. Status reds and greens are doing all the colour work. A neutral accent (a clear blue, teal, or violet) for primary actions and selection states would give the UI a centre of gravity.

3. **Information hierarchy on cards.** Profile cards (`06-profiles/01-profiles-list.png`) currently treat every metadata line as equal weight. The redesign should differentiate identity (name, handle, platform) from state (active, rate-limit headroom) from history (last published, days connected).

4. **Forms vs page actions.** The composer (`03-posts/02-posts-new.png`) is a long vertical form with a preview pane on the right. The preview is decent but the form below it doesn't take advantage of the split layout — fields run full-width as if there's no preview. Consider whether scheduling / tags / advanced flags belong as a right-rail panel of toggles instead of stacked below the text body.

5. **Empty states.** Most empty states in this app are absent (Calendar Month) or implicit (the dashboard with only Rate Limits implies nothing else exists). Each empty state should explain *what would be here if you used the feature* and link to the action that populates it.
