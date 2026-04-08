# Phase 2: Authentication & User Account - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 02-authentication-user-account
**Areas discussed:** Initial account setup, Account recovery flow, 2FA experience, Settings page layout, Password requirements, Session behavior, Change password UX

---

## Initial Account Setup

| Option | Description | Selected |
|--------|-------------|----------|
| Setup wizard | First visit shows one-time setup page: email, password, settings. App locks into single-user mode after. | ✓ |
| CLI seed command | Run `pnpm seed:user` before first launch. Requires terminal access. | |
| Environment variables | Set ADMIN_EMAIL and ADMIN_PASSWORD in .env. App creates on first boot. | |

**User's choice:** Setup wizard
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Credentials + timezone | Setup collects email, password, IANA timezone. Other settings default. | ✓ |
| Credentials only | Just email and password. Everything defaults. | |
| Full settings | All SETTINGS-01 fields during setup. | |

**User's choice:** Credentials + timezone

| Option | Description | Selected |
|--------|-------------|----------|
| Hard single-user | No user creation endpoint after setup. Setup route returns 403 forever. | ✓ |
| Soft single-user | No UI to add more, but API doesn't block it. | |
| Max-user config | MAX_USERS env var (default 1). | |

**User's choice:** Hard single-user

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal form | Clean email + password fields, app name, submit. | |
| Branded login | Logo/icon, subtle background, centered card. | |
| You decide | Claude picks. | ✓ |

**User's choice:** You decide (Claude's discretion)

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect to login | Unauthenticated → /login → back to original URL after auth. | ✓ |
| API returns 401 | API 401, frontend catches and shows login. | |
| Both | API 401 + frontend redirect. | |

**User's choice:** Redirect to login

| Option | Description | Selected |
|--------|-------------|----------|
| No remember me | 24h sliding window only per AUTH-02. | ✓ |
| 7-day session | Checked = 7 days. | |
| 30-day session | Checked = 30 days. | |

**User's choice:** No remember me

| Option | Description | Selected |
|--------|-------------|----------|
| Rate limit 5 failures | 15-minute lockout. Generic error message. | ✓ |
| No rate limiting | Single-user on own hardware. | |
| CAPTCHA after 3 | CAPTCHA service required. | |

**User's choice:** Rate limit after 5 failures

| Option | Description | Selected |
|--------|-------------|----------|
| SPA route | /setup as React route in web package. | ✓ |
| Server-rendered | API serves minimal HTML form. | |
| You decide | Claude picks. | |

**User's choice:** SPA route

---

## Account Recovery Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Security questions only | 3 questions, no email dependency. Self-contained. | ✓ |
| Email reset link | SMTP-dependent. Phase 9 infrastructure. | |
| Security questions + email | Both available. | |
| CLI reset only | Server shell command. | |

**User's choice:** Security questions only

| Option | Description | Selected |
|--------|-------------|----------|
| Predefined list, pick 3 | ~10 predefined questions. Answers hashed with argon2. | ✓ |
| Custom questions | User writes own questions. | |
| Mix 2+1 | 2 predefined + 1 custom. | |

**User's choice:** Predefined list, pick 3

| Option | Description | Selected |
|--------|-------------|----------|
| Optional, from account page | Not required during setup. | ✓ |
| Required during setup | Must set before completing setup. | |
| Prompted after first login | Dismissible banner/modal. | |

**User's choice:** Optional, from account page

| Option | Description | Selected |
|--------|-------------|----------|
| All 3 | Must answer all correctly. | ✓ |
| 2 of 3 | Any 2 correct. | |

**User's choice:** All 3

| Option | Description | Selected |
|--------|-------------|----------|
| Security questions bypass 2FA | Full account reset: password + disable 2FA. | ✓ |
| Separate 2FA recovery | Security questions reset password only. | |
| CLI fallback for 2FA | SSH + CLI command. | |

**User's choice:** Security questions bypass 2FA

| Option | Description | Selected |
|--------|-------------|----------|
| Case-insensitive | Normalized to lowercase + trimmed before hashing. | ✓ |
| Case-sensitive | Exact match. | |

**User's choice:** Case-insensitive

| Option | Description | Selected |
|--------|-------------|----------|
| /recover route | Forgot-password link on login → /recover. No session required. | ✓ |
| Only from login page | Recovery inline on login page. | |
| You decide | Claude picks. | |

**User's choice:** /recover route

| Option | Description | Selected |
|--------|-------------|----------|
| Same rules (5 attempts, 15 min) | Consistent with login rate limiting. | ✓ |
| Stricter — 3 attempts | Tighter limits for security questions. | |
| No rate limiting | Single-user, own server. | |

**User's choice:** Same rules

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, invalidate all | All Redis sessions wiped. Must re-login. | ✓ |
| No, keep sessions | Existing sessions continue. | |

**User's choice:** Yes, invalidate all

| Option | Description | Selected |
|--------|-------------|----------|
| Last login time only | Shown on account page. No attempt history. | ✓ |
| Full audit log | All attempts with timestamp/IP. | |
| None | No tracking. | |

**User's choice:** Last login time only

---

## 2FA Experience

| Option | Description | Selected |
|--------|-------------|----------|
| QR code + text secret | QR for scanning + copyable secret key below. | ✓ |
| QR code only | Cleaner but less accessible. | |
| Text secret only | Manual entry only. | |

**User's choice:** QR code + text secret

| Option | Description | Selected |
|--------|-------------|----------|
| No backup codes | Security questions handle lost-device scenario. | ✓ |
| 8 one-time codes | Standard practice but redundant with security questions. | |
| 1 master recovery code | Single code, single point of failure. | |

**User's choice:** No backup codes

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, verify before saving | Enter valid TOTP code to confirm setup. | ✓ |
| No verification | Activates immediately. | |

**User's choice:** Verify before saving

| Option | Description | Selected |
|--------|-------------|----------|
| Second step after password | Separate screen for TOTP code. | ✓ |
| Same page, conditional field | TOTP field appears inline. | |
| You decide | Claude picks. | |

**User's choice:** Second step after password

| Option | Description | Selected |
|--------|-------------|----------|
| 5-minute timeout | Redirects to login after timeout. | ✓ |
| No timeout | Stays open indefinitely. | |
| You decide | Claude picks. | |

**User's choice:** 5-minute timeout

| Option | Description | Selected |
|--------|-------------|----------|
| Password + TOTP code | Both required to disable. | ✓ |
| Password only | Matches AUTH-06 literally. | |
| You decide | Claude picks. | |

**User's choice:** Password + TOTP code

| Option | Description | Selected |
|--------|-------------|----------|
| ±1 window (90s total) | Standard TOTP tolerance. | ✓ |
| Current window only | Strict 30s. | |
| You decide | Claude picks. | |

**User's choice:** ±1 window

---

## Settings Page Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Single page with sections | Scrollable: Profile, Preferences, Security. | ✓ |
| Tabbed layout | Tabs: Profile, Preferences, Security. | |
| Sidebar navigation | Left sidebar with section links. | |

**User's choice:** Single page with sections

| Option | Description | Selected |
|--------|-------------|----------|
| Local upload via multer | Stored in Docker volume. Resized to square thumbnail. | ✓ |
| Gravatar | External dependency. | |
| Initials placeholder only | Zero complexity. | |
| You decide | Claude picks. | |

**User's choice:** Local upload via multer

| Option | Description | Selected |
|--------|-------------|----------|
| Per-section Save | Each section saves independently. | ✓ |
| One Save button | Single submit for all. | |
| Auto-save on change | Instant save per field. | |

**User's choice:** Per-section Save

| Option | Description | Selected |
|--------|-------------|----------|
| Modals for password and 2FA | Main page shows status. Actions open modals. | ✓ |
| Inline forms | Everything expands in-place. | |
| Separate routes | Each action has its own page. | |

**User's choice:** Modals

---

## Password Requirements

| Option | Description | Selected |
|--------|-------------|----------|
| Length only — 12+ chars | NIST SP 800-63B recommendation. No complexity rules. | ✓ |
| 8+ chars with complexity | Uppercase + lowercase + number + special. | |
| No restrictions | Any password. | |
| 12+ chars + common password check | Length + breached password list. | |

**User's choice:** Length only — 12+ chars

---

## Session Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Allow concurrent | Multiple devices, independent 24h windows. | ✓ |
| Single session only | New login kills previous. | |
| Allow but show active sessions | Concurrent + session list in settings. | |

**User's choice:** Allow concurrent

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, in Security section | "Log out all other sessions" button. Wipes Redis sessions except current. | ✓ |
| No | Just regular Logout. | |
| You decide | Claude includes if easy. | |

**User's choice:** Yes, in Security section

---

## Change Password UX

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, invalidate others | All sessions except current invalidated. | ✓ |
| No, keep sessions | Existing sessions continue. | |
| Ask during change | Checkbox option. | |

**User's choice:** Yes, invalidate others

| Option | Description | Selected |
|--------|-------------|----------|
| Character count only | Count + 12-char minimum indicator. Green when met. | ✓ |
| Visual strength meter | zxcvbn-style bar. | |
| No indicator | Validation on submit only. | |

**User's choice:** Character count only

---

## Claude's Discretion

- Login page visual design (minimal vs branded)
- Frontend auth state management approach
- Protected route wrapper pattern
- Predefined security question list
- Entries-per-page dropdown options
- Date format options list

## Deferred Ideas

None — discussion stayed within phase scope.
