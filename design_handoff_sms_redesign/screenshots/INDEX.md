# Screenshots Index

Each PNG is 1440×900 native resolution, downscaled to ~924×540 for capture. Use these as the visual tiebreaker when the spec's prose is ambiguous.

The matching `README.md` section is listed for each.

## Auth (unauthenticated)
| # | File | Spec |
|---|---|---|
| 32 | `32-login.png` | README → Login |
| 33 | `33-recover-step-1.png` | README → Recover (step 1) |
| 34 | `34-recover-step-3.png` | README → Recover (step 3) |
| 35 | `35-setup.png` | README → Setup |

## Dashboard
| # | File | Spec |
|---|---|---|
| 01 | `01-dashboard.png` | README → Dashboard |

## Posts
| # | File | State |
|---|---|---|
| 02 | `02-posts-list.png` | Default — no selection |
| 03 | `03-posts-bulk-actions.png` | One row selected, Bulk-actions menu open showing all four sections |
| 04 | `04-posts-failed-expanded.png` | Failed filter active; the failed row expanded showing full text + error banner + Retry |
| 05 | `05-composer-twitter.png` | Composer, no profile selected (default labels) |
| 06 | `06-composer-linkedin.png` | Composer with LinkedIn profile selected — labels swap to "Post text", 3000-char limit, LinkedIn preview |
| 07 | `07-composer-spinnable.png` | Spinnable text toggled on — 3 variant previews rendering |
| 08 | `08-composer-snippet-picker.png` | Snippet picker modal open |
| 09 | `09-import-csv.png` | Import wizard — 3 numbered steps + template downloads |

## Queues
| # | File | State |
|---|---|---|
| 10 | `10-queues-list.png` | List view with 3 queues across statuses |
| 11 | `11-queue-create-specific-times.png` | New queue, Specific-times mode (recommended) + live preview right rail |
| 12 | `12-queue-create-fixed.png` | Fixed-interval mode — day picker + hour windows visible |
| 13 | `13-queue-create-variable.png` | Variable-interval mode |
| 14 | `14-queue-detail.png` | Queue overview — stats + schedule summary + post list preview |
| 15 | `15-queue-posts.png` | Full ordered list of posts in queue with reorder controls |

## Calendar
| # | File | State |
|---|---|---|
| 16 | `16-calendar-month.png` | Month view — today highlighted, events on multiple days |
| 17 | `17-calendar-week.png` | Week view — time grid with events |
| 18 | `18-calendar-day.png` | Day view — 24-hour timeline |

## Profiles
| # | File | State |
|---|---|---|
| 19 | `19-profiles.png` | Profile cards in 3-column grid |
| 20 | `20-connect-profile-linkedin.png` | Connect modal — LinkedIn tab, OAuth banner |
| 21 | `21-connect-profile-twitter.png` | Connect modal — Twitter tab with dev-app credential inputs |

## Notifications
| # | File | State |
|---|---|---|
| 22 | `22-notifications.png` | Notifications page — colored dots + contextual actions |
| 23 | `23-bell-flyout.png` | Topbar bell flyout open |

## Settings
| # | File | Tab |
|---|---|---|
| 24 | `24-settings-profile.png` | Profile |
| 25 | `25-settings-preferences.png` | Preferences |
| 26 | `26-settings-security.png` | Security — note the "1 active session, N stale auto-pruned" text |
| 27 | `27-settings-notifications.png` | Notifications — SMTP warning + per-event table |
| 28 | `28-settings-snippets.png` | Snippets (now a peer tab, issue 9) |
| 29 | `29-settings-storage.png` | Storage |
| 30 | `30-settings-advanced.png` | Advanced |

## Admin
| # | File | State |
|---|---|---|
| 31 | `31-admin-bull-board.png` | Bull Board wrapper page — 3 queue cards + embedded iframe |

---

## Notes

- **Letter chip glyphs** (𝕏 / in / f) — these are intentional. We deliberately do not use the platform logos.
- **The "View login screens" debug switcher** — visible in the prototype only, NOT in production. Strip it.
- **Tweaks panel** — visible via toolbar toggle in the prototype, NOT in production.
- **Color in screenshots** — the prototype is captured with the **default Tweaks values**: accent `#ed474a`, primary `#640f0d`, density Regular, theme Dark. Variants exist; the screenshots show the default.
