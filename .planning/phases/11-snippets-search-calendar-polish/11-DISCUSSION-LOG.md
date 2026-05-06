# Phase 11: Snippets, Search, Calendar - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-01
**Phase:** 11-snippets-search-calendar-polish
**Areas discussed:** Snippet picker UX, tsvector + tag-name strategy, Calendar IA + nav placement, SEC-07 redact placement + enforcement

---

## Snippet picker UX

| Option | Description | Selected |
|--------|-------------|----------|
| Button + Radix Combobox | Button next to textarea opens Radix Popover with search-as-you-type combobox; inserts at cursor and re-focuses. | ✓ |
| Button + slash-command typeahead | Button + typing `/` in textarea opens inline typeahead at caret. Power-user friendly but caret-position math, conflicts with literal `/`, mobile friction. | |
| Button-only modal | Centered modal with snippet list. Loses cursor position context; requires ref + selectionStart restore on insert. | |

**User's choice:** Button + Radix Combobox (Recommended)
**Notes:** Aligns with existing Radix-based dialogs in `packages/web/src/components/profiles/`. Slash-command rejected for caret-math/mobile-keyboard reasons. Modal rejected for lost cursor context.

---

## tsvector + tag-name strategy

| Option | Description | Selected |
|--------|-------------|----------|
| STORED generated col for text+notes + AFTER trigger on postTags for tag names | Separate columns: `search_vector` STORED GENERATED on text+notes; `tag_search_vector` updated by triggers on postTags. Combined GIN index. | ✓ |
| Single shadow column maintained by triggers on posts AND postTags AND tags | One column, more triggers, cascade risk. | |
| Application-level recompute on every relevant write | Recompute in service layer; every mutation path must remember to call it. | |

**User's choice:** STORED generated column + AFTER trigger on postTags (Recommended)
**Notes:** DB-managed maintenance avoids application drift. Application-level rejected because out-of-band SQL would bypass the cache.

---

## Calendar IA + nav placement

| Option | Description | Selected |
|--------|-------------|----------|
| New top-level "Calendar" sidebar item between Queues and New Post | Adds sidebar entry; Posts list stays default. Custom toolbar built with shadcn/ui Button + Tabs. | ✓ |
| Posts page tabs: List \| Calendar | Calendar lives under `/posts` as a tab; requires Posts page header refactor; filter UI duplication risk. | |
| Replace Posts with Calendar as default for posts section | Default `/posts` becomes calendar; biggest UX shift, riskiest. | |

**User's choice:** New top-level "Calendar" sidebar item (Recommended)
**Notes:** Custom toolbar is built with shadcn `Tabs` for view switcher to match existing UI. Conflict indicator at entry level (per react-big-calendar event), not as a banner.

---

## SEC-07 redact placement + enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Extend pino redact paths + Vitest contract test on BullMQ schemas | Explicit paths covering OpenAI key naming variants; static contract test asserting no job schema accepts an openai/api_key field. | ✓ |
| Wildcard redact + runtime job-payload scrubber middleware | Wildcard pattern + Express+BullMQ middleware. Runtime safety net but masks legitimate fields, harder to reason about. | |
| Docs + redact paths only, no contract test | Smallest blast radius. Risk: Phase 12 silently adds an `openaiApiKey` and SEC-07 is breached without a tripwire. | |

**User's choice:** Extend pino redact paths + Vitest contract test (Recommended)
**Notes:** Static contract test fails CI fast if Phase 12 accidentally adds AI to a job payload. No runtime overhead. Wildcard-only redact rejected due to legitimate-field collision risk.

---

## Claude's Discretion

- Search input debounce — defaulting to 250ms unless prior art in the codebase prescribes otherwise.
- Search URL state — `setSearchParams(...)` with `replace: true`.
- `ts_headline` rendering — allowlist parser mapping `<b>` → React `<mark>`, no `dangerouslySetInnerHTML`.
- Calendar window buffer — month view loads ±7d around the visible month; week and day views load exactly the visible range.
- Snippet management page route — `/snippets` vs `/settings/snippets`; planner picks based on existing Settings nesting convention.
- Trigger language for `tag_search_vector` — plpgsql vs sql at planner's discretion.

## Deferred Ideas

- Drag-to-reschedule on calendar entries — out of scope for Phase 11.
- Cron-projection ghost slots on the calendar — out of scope.
- Archive search (published / destroyed posts) — would be its own phase.
- Snippet sharing, folders, versioning — out of scope.
- Slash-command snippet trigger in textarea — rejected during discussion.
- Visual "polish" sweep — "& Polish" was dropped from the phase title in SPEC.md.
- Any AI feature, AI endpoint, AI UI, or `OPENAI_API_KEY` env wiring — Phase 12 territory.
