---
phase: 08-linkedin-facebook-post-creation
plan: 07
type: execute
wave: 4
depends_on: [01, 02, 03, 04, 05a, 05b]
files_modified:
  - .planning/phases/08-linkedin-facebook-post-creation/08-VALIDATION.md
  - .planning/phases/08-linkedin-facebook-post-creation/08-VERIFICATION.md
autonomous: false
requirements:
  - POST-LI-01
  - POST-LI-02
  - POST-LI-03
  - POST-LI-04
  - POST-LI-05
  - POST-FB-01
  - POST-FB-02
  - POST-FB-03
  - POST-FB-04
  - POST-FB-05
  - POST-FB-06
  - LIMIT-06
  - LIMIT-07
  - LIMIT-08
threats:
  - T-API-01
  - T-API-02
  - T-API-03
  - T-WORKER-01
  - T-WORKER-02
  - T-WORKER-03
  - T-DATA-01
  - T-LIMITS-01
must_haves:
  truths:
    - "Full test suite (pnpm -r test --run) exits 0 across all packages"
    - "Posting a real LinkedIn share against a sandbox profile lands on linkedin.com"
    - "Posting a real Facebook multi-image post against a sandbox Page lands on facebook.com"
    - "Rate-limit color band on dashboard widget visually verified at 30%, 75%, 95% counters"
    - "08-VALIDATION.md frontmatter nyquist_compliant flips to true after sign-off"
  artifacts:
    - path: .planning/phases/08-linkedin-facebook-post-creation/08-VERIFICATION.md
      provides: "Phase-end verification record (test suite output + manual sign-off)"
    - path: .planning/phases/08-linkedin-facebook-post-creation/08-VALIDATION.md
      provides: "Updated frontmatter (nyquist_compliant: true, wave_0_complete: true)"
  key_links:
    - from: "08-VERIFICATION.md"
      to: "all Plan 01, 02, 03, 04, 05a, 05b SUMMARY.md files"
      via: "manual verification log"
      pattern: "08-(01|02|03|04|05a|05b)-SUMMARY.md"
---

<objective>
Close out Phase 8 with end-to-end verification: run the full multi-package test suite, perform the manual sandbox-publish smoke tests against real LinkedIn and Facebook accounts, visually verify the rate-limit dashboard color bands, and flip 08-VALIDATION.md's nyquist_compliant flag to true.

Purpose: Plans 01-05b deliver code; this plan certifies the phase. Without it, the manual-only verifications listed in 08-VALIDATION.md remain pending and the phase cannot ship.

Output: 08-VERIFICATION.md captured with test-suite output and human sign-off; 08-VALIDATION.md frontmatter flipped.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/08-linkedin-facebook-post-creation/08-VALIDATION.md
@.planning/phases/08-linkedin-facebook-post-creation/08-CONTEXT.md
@.planning/phases/08-linkedin-facebook-post-creation/08-01-SUMMARY.md
@.planning/phases/08-linkedin-facebook-post-creation/08-02-SUMMARY.md
@.planning/phases/08-linkedin-facebook-post-creation/08-03-SUMMARY.md
@.planning/phases/08-linkedin-facebook-post-creation/08-04-SUMMARY.md
@.planning/phases/08-linkedin-facebook-post-creation/08-05a-SUMMARY.md
@.planning/phases/08-linkedin-facebook-post-creation/08-05b-SUMMARY.md
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Run the full multi-package test suite and capture output</name>
  <files>
    .planning/phases/08-linkedin-facebook-post-creation/08-VERIFICATION.md
  </files>
  <read_first>
    - .planning/phases/08-linkedin-facebook-post-creation/08-VALIDATION.md (per-task verification map and sign-off list)
  </read_first>
  <action>
1. From the repo root, run the entire suite:
```bash
cd /Users/slaughterassistant/social-media-scheduler
pnpm -r test --run 2>&1 | tee /tmp/phase8-test-suite.log
```

2. If any failure surfaces:
- For each failing test, identify which Plan (02/03/04/05a/05b) was responsible.
- STOP and surface the failure to the user; do NOT proceed to the manual sign-off until it's GREEN.
- Do NOT skip, mark `it.todo`, or otherwise mute failing assertions.

3. Once GREEN, create `.planning/phases/08-linkedin-facebook-post-creation/08-VERIFICATION.md` with the captured output:
```markdown
---
phase: 8
slug: linkedin-facebook-post-creation
verified_at: <ISO timestamp>
nyquist_compliant: true
manual_signoff_pending: true
---

# Phase 8 Verification

## Automated Test Suite

`pnpm -r test --run` — exited 0

<details>
<summary>Test output (last 200 lines)</summary>

```
<paste tail -200 /tmp/phase8-test-suite.log here>
```

</details>

## Per-Requirement Verification

| Requirement | Test File | Status |
|-------------|-----------|--------|
| POST-LI-01 | packages/api/src/__tests__/posts-platform.test.ts | green |
| POST-LI-02 | packages/worker/src/__tests__/linkedin-publish.test.ts | green |
| POST-LI-03 | packages/web/src/__tests__/VisibilitySelector.test.tsx | green |
| POST-LI-04 | packages/shared/src/__tests__/platform-text-limits.test.ts | green |
| POST-LI-05 | packages/web/src/__tests__/LinkedInPreview.test.tsx | green |
| POST-FB-01 | packages/api/src/__tests__/posts-platform.test.ts | green |
| POST-FB-02 | packages/worker/src/__tests__/facebook-publish.test.ts | green |
| POST-FB-03 | packages/worker/src/__tests__/facebook-publish.test.ts | green |
| POST-FB-04 | packages/worker/src/__tests__/facebook-publish.test.ts | green |
| POST-FB-05 | packages/shared/src/__tests__/platform-text-limits.test.ts | green |
| POST-FB-06 | packages/web/src/__tests__/FacebookPreview.test.tsx | green |
| LIMIT-06 | packages/api/src/__tests__/rate-limit-platform.test.ts | green |
| LIMIT-07 | packages/api/src/__tests__/rate-limit-platform.test.ts | green |
| LIMIT-08 | packages/web/src/__tests__/RateLimitsCard.test.tsx | green |

## Manual Verifications Pending

Tasks below require human sign-off — see Task 2 (checkpoint).
```
  </action>
  <verify>
    <automated>cd /Users/slaughterassistant/social-media-scheduler &amp;&amp; pnpm -r test --run &amp;&amp; ls .planning/phases/08-linkedin-facebook-post-creation/08-VERIFICATION.md</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm -r test --run` exits 0 across @sms/shared, @sms/db, @sms/api, @sms/worker, @sms/web
    - File `.planning/phases/08-linkedin-facebook-post-creation/08-VERIFICATION.md` exists with frontmatter `nyquist_compliant: true, manual_signoff_pending: true`
    - Each requirement ID has a corresponding test file row in the per-requirement table
  </acceptance_criteria>
  <done>Full test suite GREEN; verification record captured with per-requirement mapping; manual sign-off remains pending.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Manual sandbox-publish + visual sign-off</name>
  <what-built>
    Plans 01-05b shipped LinkedIn and Facebook publishing with platform-aware forms, previews, and a per-platform rate-limit dashboard widget. Task 1 confirmed the full test suite is GREEN.
  </what-built>
  <how-to-verify>
    Five manual verifications listed in 08-VALIDATION.md "Manual-Only Verifications" must each pass. Walk each in order; if any fails, stop and report the issue.

    1) **LinkedIn live publish (POST-LI-01..05):**
       - Connect a sandbox LinkedIn personal profile via /profiles (Phase 7 OAuth flow).
       - Navigate to /posts/new.
       - Select the LinkedIn profile in the picker.
       - Compose: text "Phase 8 verification — text only", visibility = Anyone on LinkedIn.
       - Click "Publish now".
       - Open linkedin.com/feed in a separate tab; confirm the post appears within 30 seconds with the same text + Anyone visibility.
       - Repeat with text "Phase 8 verification — with image" and a single 5 MB JPG attached.
       - Confirm the image renders correctly on linkedin.com.

    2) **Facebook live publish (POST-FB-01..06):**
       - Connect a sandbox Facebook Page via /profiles.
       - Navigate to /posts/new, select the Facebook Page profile.
       - Compose: text "Phase 8 verification — multi-image", attach 4 JPGs, link = https://example.com.
       - Click "Publish now".
       - Open facebook.com/<page-name> in a separate tab; confirm the post appears with text + 4 images in 2x2 grid + link unfurl card.
       - Repeat with a single video (small MP4 < 10 MB) and confirm playback on facebook.com.

    3) **LinkedIn preview fidelity (POST-LI-05):**
       - On /posts/new with the LinkedIn profile selected, paste a multi-paragraph post with one URL and the spinnable text "{Hello|Hi|Greetings} world".
       - Confirm preview pane shows: avatar placeholder, profile name, "Anyone on LinkedIn" visibility line, multi-paragraph text with line breaks preserved, URL highlighted in primary color (NOT clickable), spinnable variants highlighted in primary.
       - Compare side-by-side with linkedin.com/feed; medium-fidelity match expected (no brand colors, no engagement buttons, but layout is recognizable).

    4) **Facebook preview fidelity (POST-FB-06):**
       - Switch to the Facebook profile; paste 5 image URLs (or upload 5 images), confirm preview shows 3-col grid with 5 visible cells (no +N overlay since 5 ≤ 6).
       - Add 5 more images (10 total); confirm preview now shows 6 cells with "+4" overlay on the last cell.
       - Add a video to the form; confirm preview replaces image grid with the aspect-video Play icon placeholder.

    5) **Rate-limit color band visual (LIMIT-08):**
       - In the database, manually set linkedin_daily_count to 30 (out of 100), refresh /dashboard, confirm green dot + green bar.
       - Set to 60, refresh, confirm yellow dot + yellow bar + yellow numeric.
       - Set to 95, refresh, confirm red dot + red bar + red numeric.
       - Set facebook_hourly_count to 180 (out of 200), confirm red band on the FB row.
       - Confirm the "Resets in" relative time updates correctly when the user's timezone (Settings → Timezone) is changed.

    Reset all manually-tuned counters to 0 before signing off.
  </how-to-verify>
  <resume-signal>
    Type "approved" once all five manual checks pass. If any fail, describe the specific behavior observed (URL screenshots welcomed) so the appropriate plan can be revised.
  </resume-signal>
  <action>Pause execution and surface the five verification steps in <how-to-verify> to the operator. Do not auto-continue. Resume only on explicit "approved" signal.</action>
  <verify>Operator confirms all five manual verifications pass before resume.</verify>
  <done>Operator typed "approved" after all five sandbox verifications and visual color-band checks succeeded.</done>
</task>

<task type="auto">
  <name>Task 3: Flip 08-VALIDATION.md frontmatter to nyquist_compliant + commit</name>
  <files>
    .planning/phases/08-linkedin-facebook-post-creation/08-VALIDATION.md
  </files>
  <read_first>
    - .planning/phases/08-linkedin-facebook-post-creation/08-VALIDATION.md (current frontmatter has nyquist_compliant: false, wave_0_complete: false)
    - .planning/phases/08-linkedin-facebook-post-creation/08-VERIFICATION.md (Task 1 output proving suite is green)
  </read_first>
  <action>
1. Update the frontmatter of `.planning/phases/08-linkedin-facebook-post-creation/08-VALIDATION.md`:
```yaml
---
phase: 8
slug: linkedin-facebook-post-creation
status: complete
nyquist_compliant: true
wave_0_complete: true
verified_at: <ISO timestamp matching 08-VERIFICATION.md>
---
```

2. Update the per-task verification map: replace each row's `Status: ⬜ pending` with `Status: ✅ green` and each `File Exists: ❌ W0` with `✅ W0`.

3. Update the sign-off block at the bottom:
```markdown
**Approval:** approved <ISO date>
- [x] All tasks have <automated> verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] nyquist_compliant: true set in frontmatter
```

4. Commit:
```bash
cd /Users/slaughterassistant/social-media-scheduler
git add .planning/phases/08-linkedin-facebook-post-creation/08-VALIDATION.md .planning/phases/08-linkedin-facebook-post-creation/08-VERIFICATION.md
git commit -m "docs(phase-08): complete validation + verification — phase 8 ships"
```
  </action>
  <verify>
    <automated>rg "nyquist_compliant: true" /Users/slaughterassistant/social-media-scheduler/.planning/phases/08-linkedin-facebook-post-creation/08-VALIDATION.md &amp;&amp; rg "wave_0_complete: true" /Users/slaughterassistant/social-media-scheduler/.planning/phases/08-linkedin-facebook-post-creation/08-VALIDATION.md</automated>
  </verify>
  <acceptance_criteria>
    - 08-VALIDATION.md frontmatter contains `nyquist_compliant: true` and `wave_0_complete: true`
    - 08-VALIDATION.md per-task verification map shows ✅ green for every row
    - 08-VERIFICATION.md exists with `manual_signoff_pending: false` (after Task 2 sign-off)
    - Commit recorded on branch
  </acceptance_criteria>
  <done>Phase 8 documentation reflects complete and verified state; ready for Phase 9 (Notifications) to begin planning.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Plans 02-04 implementations ↔ live LinkedIn/Facebook APIs | This plan's manual checkpoint is the only step that exercises the real platform endpoints with real OAuth tokens; sandbox accounts isolate blast radius |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-API-01..T-LIMITS-01 | (composite) | end-to-end | mitigate | Each threat's mitigation was implemented and unit-tested in Plans 02-04; this plan's automated suite re-runs all those tests as a regression gate before manual sign-off. The manual sandbox publish doubles as a smoke test that production-shape API calls do not leak credentials (T-WORKER-03) — checkpoint task asks the human to inspect the published post for any token-shaped substring. |
</threat_model>

<verification>
Phase 8 is officially shipped when:
1. Task 1 produced a green `pnpm -r test --run`
2. Task 2 received human approval covering all five manual checks (real LinkedIn publish, real Facebook publish, LI preview fidelity, FB preview fidelity, rate-limit color bands)
3. Task 3 committed the updated frontmatter and verification record
</verification>

<success_criteria>
- Full test suite: green
- Real LinkedIn sandbox post: visible on linkedin.com
- Real Facebook sandbox post (multi-image + video variants): visible on facebook.com
- Dashboard rate-limit widget: green/yellow/red color band thresholds visually correct
- 08-VALIDATION.md: nyquist_compliant: true
- 08-VERIFICATION.md: full record captured
- Phase 8 marked complete in ROADMAP.md (orchestrator action — out of plan scope)
</success_criteria>

<output>
After completion, create `.planning/phases/08-linkedin-facebook-post-creation/08-07-SUMMARY.md`
</output>
