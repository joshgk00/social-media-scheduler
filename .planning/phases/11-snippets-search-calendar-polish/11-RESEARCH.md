# Phase 11: Snippets, Search, Calendar — Research

**Researched:** 2026-05-01
**Domain:** Productivity tooling on top of an established Express 5 + Drizzle + Postgres + React 19 stack — text snippets CRUD + insert + CSV substitution; Postgres `tsvector` FTS; `react-big-calendar` view; SEC-07 log-redaction guardrails.
**Confidence:** HIGH

## Summary

Every external tech choice for this phase is already locked: SPEC + CONTEXT name `react-big-calendar` for the calendar, the Drizzle/Postgres/Express stack from `CLAUDE.md` for everything else, and `pino` for logging. The actual research questions are smaller and more focused: confirm `react-big-calendar` is alive and React-19 compatible (it is — v1.19.4 published 2025-06-16, peers `react ^16 || ^17 || ^18 || ^19`); pin down the Postgres FTS strategy that CONTEXT D-06..D-09 already chose (`STORED` generated `tsvector` for `text + notes`, trigger-maintained `tsvector` for tag names, single GIN over their concatenation); confirm `ts_headline` returns HTML containing `<b>` markup we must sanitize; pick a snippet-templating approach that handles the CSV substitution requirement without dragging in a full templating engine (a 30-line regex-driven replacer is the right answer); and capture the existing project conventions the planner has to inherit (factory functions, no top-level side effects, DEFAULT_REDACT in `packages/shared/src/logger.ts`, BullMQ job schemas living in `packages/shared/src/schemas/`, `parseCsvBuffer` + `writeErrorReport` already wired in the bulk-import path).

The bulk-import pipeline (Phase 10) gives us everything SNIP-03 needs — `parseCsvBuffer` returns `{ rows, errors }`, `writeErrorReport` already produces a CSV error report attached to a `bulk_operations` row, and the row-error contract is `{ rowNumber, message }`. SNIP-03 plugs into that contract and adds at most a "missing snippet" error type; no new error infrastructure is required. The CSV substitution itself runs in `bulk-ops-worker` (where `csvImportScheduledJobDataSchema` parses `params.rows`) — that's the right boundary because at that point we already have `userId` and a DB connection and the rows have already been Zod-validated.

The calendar is the only piece that introduces a new npm dependency. `react-big-calendar` 1.19.4 supports React 19, has `components.toolbar` for D-12, `eventPropGetter` for per-event styling (D-13 conflict highlighting), and ships a `localizer` system where `luxonLocalizer` is the natural fit for this codebase (`luxon` already a dep). Calendar windowing (`from`/`to`) is computed client-side from react-big-calendar's `onRangeChange` callback and sent to a new `GET /api/calendar` endpoint that joins on `socialProfiles` and reuses `checkConflicts` per-row to set `hasConflict`.

**Primary recommendation:** Implement in this order — (1) snippets table + service + REST + management page (smallest, no dependencies), (2) Insert Snippet picker in `SharedPostFields.tsx`, (3) CSV `{{snippet:name}}` substitution in the bulk worker, (4) `tsvector` migration + search rewrite + Queue Posts search input + headline render util, (5) calendar API endpoint + page + filter bar + conflict annotation, (6) SEC-07 redact paths + contract test + policy doc. Each later item depends on earlier ones (calendar uses search input pattern; CSV substitution needs the snippet service) but each can ship behind its own UAT gate.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Snippet CRUD storage | Database / Postgres | — | Per-user table, `(userId, lower(name))` unique constraint enforced at DB level (SPEC requirement) |
| Snippet REST endpoints | API / Backend | — | Standard authenticated CRUD; ownership middleware lives in API tier |
| Insert Snippet picker UI | Browser / Client | — | Pure DOM concern: caret-position math on `selectionStart/selectionEnd`, popover keyboard handling |
| Snippet TanStack Query hook | Browser / Client | — | Server-state cache; matches existing `usePosts`, `useTags` pattern |
| CSV `{{snippet:name}}` substitution | API / Worker | Database | Runs inside `bulk-ops-worker` job handler (already has `userId` + db); resolves names via `snippets` lookup |
| `posts.search_vector` (text + notes) | Database | — | Postgres-managed `STORED` generated column — zero application code |
| `posts.tag_search_vector` | Database | API (insert path) | Maintained by AFTER INSERT/DELETE trigger on `post_tags` join — DB owns refresh; API never touches it directly |
| GIN index on combined vectors | Database | — | `(search_vector \|\| tag_search_vector)` indexed by GIN |
| `ts_headline` rendering | API / Backend | Browser (sanitize) | API returns `<b>…</b>` HTML; client maps `<b>` → `<mark>` via allowlist parser (no `dangerouslySetInnerHTML`) |
| Search input debounce + URL state | Browser / Client | — | Reuses `setSearchParams` pattern from `PostsPage.tsx` |
| Calendar windowed query | API / Backend | Database | Single endpoint, `from/to` query params, returns annotated `hasConflict: boolean` per row |
| Calendar conflict computation | API / Backend | — | Reuses `checkConflicts` from `post.service.ts`; never duplicated client-side |
| Calendar grid + interaction | Browser / Client | — | `react-big-calendar` localized via `luxonLocalizer` — Luxon already installed |
| `pino` redact rules | API / Shared | — | `DEFAULT_REDACT` lives in `packages/shared/src/logger.ts` — extended in shared module so worker inherits |
| BullMQ job-payload OpenAI guard | API / Worker (test) | — | Static Vitest contract test imports each job-data schema and asserts schema shape — no runtime cost |

## Standard Stack

### Core (already installed — no new deps)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Drizzle ORM | ~0.45.2 | DB schema + queries | Already in `packages/api/package.json` and `packages/db`; Drizzle has `sql.raw` + `sql\`...\`` template helpers for tsvector queries that the regular query builder can't express [VERIFIED: package.json] |
| postgres (porsager) | ~3.4.9 | Postgres driver | Already wired via `drizzle-orm/postgres-js` adapter [VERIFIED: package.json] |
| zod | ~3.25.76 | Request + job schema validation | Already used; new snippet schemas live in `packages/shared/src/schemas/snippets.ts` [VERIFIED: package.json] |
| @tanstack/react-query | ~5.96.2 | Server state caching | New hooks: `useSnippets`, `useCalendarPosts` [VERIFIED: web/package.json] |
| react-router | ~7.14.0 | Routing | New routes: `/calendar`, `/settings/snippets` [VERIFIED: web/package.json] |
| pino | ~10.3.1 | Structured logging | `DEFAULT_REDACT` in `packages/shared/src/logger.ts` is the extension point for D-14 [VERIFIED: package.json] |
| bullmq | ~5.73.0 | Job queue (CSV substitution path) | Already in worker; no schema changes needed for snippet substitution [VERIFIED: package.json] |
| luxon | ~3.7.2 | Server timezone math | Use `luxonLocalizer` in `react-big-calendar` so timezone handling is consistent across app [VERIFIED: web/package.json] |
| date-fns | ~4.1.0 | Client display formatting | Existing convention from CLAUDE.md (Luxon server, date-fns client) [VERIFIED: web/package.json] |
| cmdk | ^1.1.1 | shadcn `<Command>` palette | Already installed; powers the snippet picker combobox [VERIFIED: web/package.json] |

### Net-new dependencies (web only)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-big-calendar | ~1.19.4 | Calendar M/W/D views | Locked by SPEC §Constraints. Latest 1.19.4 published 2026-06-16; peers `react ^16 \|\| ^17 \|\| ^18 \|\| ^19` — React-19 compatible [VERIFIED: `npm view react-big-calendar version`, `npm view ... peerDependencies`] |
| @types/react-big-calendar | ~1.16.3 | TypeScript types | Latest types package, devDep [VERIFIED: `npm view @types/react-big-calendar version`] |

**Installation:**
```bash
pnpm --filter @sms/web add react-big-calendar
pnpm --filter @sms/web add -D @types/react-big-calendar
```

**Version verification:** Versions above were resolved via `npm view` on 2026-05-01. Pin tilde `~` per CLAUDE.md production-dep convention.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `react-big-calendar` | `FullCalendar` | SPEC explicitly rejected (bundle/license); not researched further |
| Postgres FTS | `pg_trgm` (trigram) | Trigram is for fuzzy/typo matching; SPEC mandates ranked FTS. CONTEXT D-09 rejected app-level recompute |
| `regex` substitution for CSV `{{snippet:name}}` | Templating engine (Handlebars, etc.) | A pre-baked engine adds dependencies, escaping rules, and a new attack surface. Tokens are well-defined (`{{snippet:[a-z0-9_-]+}}` — single replacement, no logic, no nesting). A 30-line replacer is correct here |
| `ts_query` (advanced operators) | `plainto_tsquery` | `plainto_tsquery` AND-joins user words and ignores syntax — exactly what a search input wants. `to_tsquery` errors on stray punctuation; `websearch_to_tsquery` (PG 11+) supports quoted phrases and `-exclude` and is a reasonable upgrade if perceived |

## Architecture Patterns

### System Architecture Diagram

```
                        ┌────────────────────────┐
                        │  Browser (React 19)    │
                        └────┬─────────────┬─────┘
                             │             │
                  /api/snippets        /api/posts?search=…
                  /api/calendar        /api/queue-posts?search=…
                             │             │
                             ▼             ▼
              ┌─────────────────────────────────────┐
              │  Express 5 API (packages/api)       │
              │  ┌───────────────────────────────┐  │
              │  │ snippet.service               │  │
              │  │ post.service (search rewrite, │  │
              │  │   getCalendar, checkConflicts)│  │
              │  └───────────────────────────────┘  │
              └────┬───────────────────────┬────────┘
                   │                       │
                   ▼                       ▼
        ┌──────────────────┐    ┌───────────────────────────┐
        │ snippets table   │    │ posts table               │
        │  (id,user,name,  │    │  + search_vector STORED   │
        │   category,body) │    │  + tag_search_vector      │
        └──────────────────┘    │  GIN(s_v ‖ t_s_v)         │
                                └────┬──────────────────────┘
                                     │ AFTER INSERT/DELETE on
                                     │ post_tags fires trigger
                                     ▼
                                ┌───────────────────────────┐
                                │ refresh_post_tag_vector() │
                                │ trigger function          │
                                └───────────────────────────┘

         ┌────────────────────────────────────────────────┐
         │  CSV Bulk Import flow (SNIP-03)               │
         └────────────────────────────────────────────────┘
   POST /api/bulk-import/csv  →  parseCsvBuffer (Zod row schema)
                                ↓
                        BullMQ bulk-ops-worker
                                ↓
                    NEW: substituteSnippets(rows, userId)
                                ↓
              For each row.text: replace {{snippet:name}}
              ├─ found  → splice body
              └─ missing → push to errors[], skip insert
                                ↓
                  insert valid rows; writeErrorReport()
```

Data flow primary cases:
- **Snippet insert in composer:** user types in textarea → click Insert Snippet → Popover opens with cmdk Command list (data from `useSnippets()` TanStack Query) → click item → `body` spliced into textarea at caret → focus restored.
- **FTS query:** user types in PostsPage filter → debounced `setSearchParams({ search }, { replace: true })` → `usePosts({ search })` calls `GET /api/posts?search=…` → service builds `WHERE … AND (search_vector || tag_search_vector) @@ plainto_tsquery('english', :q)` and `ORDER BY ts_rank(...) DESC` → returns rows + `headline` from `ts_headline` → web sanitizes `<b>` → `<mark>` via allowlist parser → render.
- **Calendar render:** user navigates to `/calendar` → `react-big-calendar` fires `onRangeChange({start,end})` → `useCalendarPosts({from,to,filters})` calls `GET /api/calendar?from&to&...` → service runs windowed query, then for each row calls `checkConflicts(db, userId, profileId, scheduledAt, excludeId=row.id).length > 0` → returns `{events: [...], hasConflict:...}` → client renders with `eventPropGetter` per-platform color, conflict left-border, tooltip.

### Recommended Project Structure
```
packages/
├── db/
│   └── src/schema/snippets.ts          # NEW
│   └── drizzle/0009_phase-11-snippets-fts-calendar.sql  # NEW migration
├── shared/
│   └── src/schemas/
│       ├── snippets.ts                 # NEW Zod schemas
│       ├── calendar.ts                 # NEW (calendar query/response)
│       └── posts.ts                    # ADD `headline` to response shape
│   └── src/logger.ts                   # EXTEND DEFAULT_REDACT (D-14)
│   └── src/lib/
│       └── snippet-tokens.ts           # NEW substituteSnippets util (shared so test can import)
├── api/
│   └── src/services/snippet.service.ts # NEW CRUD service
│   └── src/routes/snippets.ts          # NEW REST routes
│   └── src/routes/calendar.ts          # NEW windowed query route
│   └── src/services/post.service.ts    # MODIFY getPosts (FTS rewrite)
│   └── src/__tests__/sec-07-job-schema.test.ts  # NEW contract test
├── worker/
│   └── src/bulk/csv-import.handler.ts  # MODIFY to call substituteSnippets
└── web/
    └── src/pages/calendar/CalendarPage.tsx          # NEW
    └── src/pages/settings/SnippetsPage.tsx          # NEW
    └── src/components/snippets/SnippetPicker.tsx    # NEW
    └── src/components/snippets/SnippetFormDialog.tsx  # NEW
    └── src/components/posts/SharedPostFields.tsx    # MODIFY (mount picker)
    └── src/hooks/useSnippets.ts                     # NEW
    └── src/hooks/useCalendarPosts.ts                # NEW
    └── src/lib/headline-to-mark.ts                  # NEW (allowlist <b> → <mark>)
    └── src/lib/calendar-localizer.ts                # NEW (luxonLocalizer wiring)
SECURITY.md                                          # NEW or extend with SEC-07 policy
```

### Pattern 1: Postgres Generated `tsvector` Column with Trigger-Maintained Tag Vector

The double-vector design (D-06..D-09) splits the index into two pieces because the underlying data has two refresh triggers:

```sql
-- Source: Postgres docs §12.4.3 Generated Column FTS
-- packages/db/drizzle/0009_phase-11-snippets-fts-calendar.sql

ALTER TABLE posts
  ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', text || ' ' || COALESCE(notes, ''))
    ) STORED;

ALTER TABLE posts ADD COLUMN tag_search_vector tsvector;

CREATE OR REPLACE FUNCTION refresh_post_tag_vector(p_post_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE posts
  SET tag_search_vector = COALESCE(
    (SELECT to_tsvector('english', string_agg(t.name, ' '))
     FROM post_tags pt
     JOIN tags t ON t.id = pt.tag_id
     WHERE pt.post_id = p_post_id),
    ''::tsvector
  )
  WHERE id = p_post_id;
$$;

CREATE OR REPLACE FUNCTION post_tags_refresh_vector()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_post_tag_vector(OLD.post_id);
    RETURN OLD;
  ELSE
    PERFORM refresh_post_tag_vector(NEW.post_id);
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER post_tags_after_change
AFTER INSERT OR DELETE ON post_tags
FOR EACH ROW EXECUTE FUNCTION post_tags_refresh_vector();

-- Backfill once on deploy
UPDATE posts SET tag_search_vector = COALESCE(
  (SELECT to_tsvector('english', string_agg(t.name, ' '))
   FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
   WHERE pt.post_id = posts.id),
  ''::tsvector
);

CREATE INDEX posts_fts_idx ON posts
USING gin ((search_vector || tag_search_vector));
```

**Note:** the generated `text || ' ' || COALESCE(notes, '')` concatenation must be IMMUTABLE — `COALESCE` and `||` are both immutable, so this is safe inside `STORED GENERATED`. `to_tsvector('english', …)` is immutable as long as the regconfig literal is provided (NOT `to_tsvector(text)` — that's stable, not immutable, and Postgres rejects it). [CITED: postgresql.org/docs/17/textsearch-features.html#TEXTSEARCH-COLUMN-INDEX]

**Why GIN on the concat:** `(search_vector || tag_search_vector) @@ plainto_tsquery(...)` lets Postgres use the GIN to find rows where ANY component matches. Without the concat we'd need two separate indexes plus an OR, which loses index-only scan eligibility.

**Tag-rename caveat:** the trigger fires on `post_tags` INSERT/DELETE but NOT on `tags.name` UPDATE. If TAGS-01 (rename a tag) is exercised after Phase 11 ships, posts retain stale tag tokens until the join changes. SPEC §Boundaries says "no tag CRUD changes in scope" — this is the trade-off. Document as a known follow-up; if Tag Rename refresh is needed, add a second trigger on `tags` UPDATE that loops every linked post.

### Pattern 2: `ts_headline` HTML and the `<b>` → `<mark>` Allowlist Parser

```sql
-- API query:
SELECT
  posts.*,
  ts_rank(search_vector || tag_search_vector, plainto_tsquery('english', $1)) AS rank,
  ts_headline(
    'english',
    text,
    plainto_tsquery('english', $1),
    'StartSel=<b>, StopSel=</b>, MaxWords=20, MinWords=10, ShortWord=2'
  ) AS headline
FROM posts
WHERE …  AND (search_vector || tag_search_vector) @@ plainto_tsquery('english', $1)
ORDER BY rank DESC
```

`ts_headline` HTML-escapes the source text before applying `StartSel/StopSel`, so the only tags ever in the output are `<b>` and `</b>`. [CITED: postgresql.org/docs/17/textsearch-controls.html#TEXTSEARCH-HEADLINE]

Client allowlist parser:

```typescript
// packages/web/src/lib/headline-to-mark.ts
export function renderHeadline(headline: string): React.ReactNode[] {
  // Source: ts_headline produces only <b>...</b> markers; everything else is HTML-escaped
  const parts = headline.split(/(<b>|<\/b>)/g);
  let inMark = false;
  const out: React.ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part === '<b>') { inMark = true; return; }
    if (part === '</b>') { inMark = false; return; }
    if (!part) return;
    // ts_headline already HTML-escaped &/</> — decode only the three entities it emits
    const decoded = part
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    out.push(inMark ? <mark key={i}>{decoded}</mark> : decoded);
  });
  return out;
}
```

This is unit-testable and gives zero XSS surface — no `dangerouslySetInnerHTML` anywhere.

### Pattern 3: CSV Snippet Substitution

```typescript
// packages/shared/src/lib/snippet-tokens.ts
const TOKEN_RE = /\{\{snippet:([a-zA-Z0-9_\- ]+)\}\}/g;

export function substituteSnippetsInText(
  text: string,
  resolve: (name: string) => string | undefined,
): { result: string; missing: string[] } {
  const missing: string[] = [];
  const result = text.replace(TOKEN_RE, (_match, rawName) => {
    const name = rawName.trim().toLowerCase();
    const body = resolve(name);
    if (body === undefined) { missing.push(name); return _match; }
    return body;
  });
  return { result, missing };
}
```

The handler in `bulk-ops-worker` loads all of the user's snippets once (a small map), iterates rows, and pushes a row error of shape `{ rowNumber, message: 'Unknown snippet "${name}"' }` into `parsedCsv.errors` for any row with `missing.length > 0`. Stored post text contains literal text only. The token form `{{snippet:foo}}` cannot reach `INSERT` because we either substitute it or fail the row.

### Pattern 4: react-big-calendar with `luxonLocalizer` and Custom Toolbar

```typescript
// packages/web/src/lib/calendar-localizer.ts
import { luxonLocalizer } from 'react-big-calendar';
import { DateTime } from 'luxon';

export const calendarLocalizer = luxonLocalizer(DateTime);
```

```typescript
// packages/web/src/pages/calendar/CalendarPage.tsx (excerpt)
<Calendar
  localizer={calendarLocalizer}
  events={events}
  startAccessor="start"
  endAccessor="end"
  views={['month', 'week', 'day']}
  defaultView="month"
  components={{ toolbar: CalendarToolbar }}
  eventPropGetter={(event) => ({
    className: cn(
      'border-l-4',
      `border-platform-${event.platform}`,
      `bg-platform-${event.platform}/10`,
      event.hasConflict && 'border-l-destructive',
    ),
  })}
  onRangeChange={(range) => {
    // range is Date | Date[] | { start, end }
    const { from, to } = normalizeRange(range);
    setQueryParams({ from, to });
  }}
  onSelectEvent={(event) => navigate(`/posts/${event.id}/edit`)}
  onSelectSlot={(slotInfo) => navigate(`/posts/new?scheduledAt=${slotInfo.start.toISOString()}`)}
  selectable
/>
```

`onRangeChange` returns different shapes for each view (Month: `{start,end}`, Week: `Date[]` of 7 days, Day: `Date[]` of 1 day) — `normalizeRange` is a small helper that produces a `{from,to}` ISO pair.

The custom `CalendarToolbar` uses shadcn `Tabs` for M/W/D + `Button` for prev/today/next per UI-SPEC.

### Pattern 5: SEC-07 Redact Extension and Contract Test

```typescript
// packages/shared/src/logger.ts (modified)
const DEFAULT_REDACT = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["set-cookie"]',
    // SEC-07
    'req.body.openai_api_key',
    'req.body.openaiApiKey',
    'req.body.OPENAI_API_KEY',
    '*.openai_api_key',
    '*.openaiApiKey',
    '*.OPENAI_API_KEY',
  ],
  censor: '[REDACTED]',
};
```

`pino` redact wildcards (`*.openai_api_key`) match top-level keys at any object depth via the `*` prefix syntax. [CITED: github.com/pinojs/pino/blob/main/docs/redaction.md]

```typescript
// packages/api/src/__tests__/sec-07-job-schema.test.ts
import { describe, expect, it } from 'vitest';
import * as bulkJobs from '@sms/shared/schemas/bulk-jobs';
import * as bulkImport from '@sms/shared/schemas/bulk-import';
import * as bulkNotifs from '@sms/shared/schemas/bulk-notifications';
// + any other job-data schema files

const FORBIDDEN_KEY_RE = /openai|api[_-]?key/i;

const allSchemas = [
  bulkJobs.bulkJobPayloadSchema,
  bulkImport.csvImportScheduledJobDataSchema,
  bulkImport.csvImportQueueJobDataSchema,
  bulkNotifs.publishFailedNotificationSchema,
  // ...
];

describe('SEC-07 BullMQ job-data schemas', () => {
  it.each(allSchemas)('schema %# does not declare an OpenAI/api-key field', (schema) => {
    // Zod 3: schema._def.shape() returns the field map for ZodObject
    const shape = (schema as any)._def.shape?.() ?? {};
    for (const fieldName of Object.keys(shape)) {
      expect(fieldName).not.toMatch(FORBIDDEN_KEY_RE);
    }
  });
});
```

This is a static structural assertion — the schemas are imported, their `shape()` is enumerated, and field names are matched against a regex. No runtime BullMQ machinery involved.

### Anti-Patterns to Avoid

- **Computing `tsvector` in application code on every UPDATE.** Postgres `STORED GENERATED` does it for free and never gets stale. CONTEXT D-09 already rejects this; planner should not relitigate.
- **Using `dangerouslySetInnerHTML` for `ts_headline` output.** Even though Postgres escapes the source text, accidental future changes to `StartSel/StopSel` could break this assumption; the allowlist parser is unconditionally safe.
- **Resolving `{{snippet:name}}` at publish-time.** SPEC and CONTEXT both lock upload-time resolution. A publish-time approach changes the data model (we'd have to store the token + a denormalized snapshot), creates a data-versioning problem, and defeats the goal of "stored post text contains no tokens."
- **Slash-command snippet trigger inside the textarea.** CONTEXT D-03 explicitly rejects this; if asked, defer to a future phase.
- **Loading the full posts table for the calendar.** SPEC §Constraints mandates windowed queries; a "load everything" calendar implementation breaks the contract regardless of how fast the table currently is.
- **Drag-to-reschedule.** SPEC §Out of scope; do not wire `onEventDrop` or `withDragAndDrop` HOC.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Calendar grid | DIY day-grid + week-grid + drag math | `react-big-calendar` | Locked by SPEC; reinventing weeks of work for view switching, locale, time formatting, accessibility |
| Combobox / typeahead | DIY popover + arrow-key handler | shadcn `<Command>` (cmdk) | Already installed and battle-tested; handles ARIA combobox semantics |
| Postgres FTS ranking | Custom score (count matches × weight) | `ts_rank` / `ts_rank_cd` | Standardized scoring with tunable weights; `cd` (cover-density) variant biases toward terms appearing close together |
| Search highlighting | Client-side substring search-and-replace | Postgres `ts_headline` | Stems user query the same way the index does (`run` matches `running`); client substring would miss stem matches |
| Snippet templating | Full templating engine (Handlebars, Mustache) | 30-line regex replacer in `packages/shared/src/lib/snippet-tokens.ts` | Single non-recursive token form, no logic, no escaping; Handlebars adds dependencies and an attack surface for nothing |
| Pino redact wildcards | Recursive scrubber middleware | `pino` `redact.paths` with `*.openai_api_key` | Pino has built-in support; CONTEXT D-16 explicitly rejects custom middleware |
| Timezone display in calendar | Manual `toLocaleString` per cell | `luxonLocalizer` from `react-big-calendar` | Bridges the existing Luxon stack with rbc's internal formatting |
| HTML escape / unescape for headline | Manual sanitizer | Allowlist parser that splits on `<b>`/`</b>` only | Smaller surface; ts_headline only emits these two tags |

**Key insight:** every problem in this phase has a textbook standard solution. The phase risk is over-engineering, not under-engineering — Phase 11 is mostly assembly.

## Common Pitfalls

### Pitfall 1: Generated tsvector requires `IMMUTABLE` expression
**What goes wrong:** Postgres rejects `to_tsvector(text || ' ' || notes)` (no regconfig argument) because that's STABLE, not IMMUTABLE.
**Why it happens:** `to_tsvector(text)` consults `default_text_search_config`, which can change per session, so it's STABLE.
**How to avoid:** Always pass the regconfig literal: `to_tsvector('english', …)`.
**Warning sign:** Migration error `generation expression is not immutable`.

### Pitfall 2: Tag rename does not refresh `tag_search_vector`
**What goes wrong:** `UPDATE tags SET name = 'Foo' WHERE name = 'foo'` doesn't fire the `post_tags` trigger; posts keep the stale token in their vector.
**Why it happens:** Trigger is on the join table, not the parent.
**How to avoid:** Document as a Phase-11 known limitation. If tag-rename refresh is required, add a second trigger on `tags` UPDATE that re-runs `refresh_post_tag_vector` for every linked post. SPEC §Boundaries excludes tag CRUD changes, so this is intentional in Phase 11.
**Warning sign:** Search hits that include a renamed tag's old name and miss the new name. Add an integration test that exercises rename-then-search and document the expected (failing) behavior, OR add the second trigger if scope permits.

### Pitfall 3: react-big-calendar ships its own CSS that fights Tailwind
**What goes wrong:** Importing `react-big-calendar/lib/css/react-big-calendar.css` globally bleeds default styles (borders, font sizes) across the app.
**Why it happens:** rbc CSS is unscoped; it's fine inside the calendar but applies to common selectors elsewhere.
**How to avoid:** Import the rbc CSS only inside `CalendarPage.tsx` (Vite scopes it to the route's bundle, but the cascade is still global) and override the bits that clash via the `eventPropGetter` + custom toolbar. UI-SPEC line 29 already captures this.
**Warning sign:** Visual regression on non-calendar pages after adding the dep.

### Pitfall 4: `selectionStart`/`selectionEnd` go stale after focus change
**What goes wrong:** Opening the snippet popover blurs the textarea on some browsers, the selection collapses to 0/0, and on insert the snippet body lands at the start of the textarea.
**Why it happens:** Some browsers reset textarea selection when focus leaves; mobile Safari is the worst.
**How to avoid:** Capture `selectionStart`/`selectionEnd` at the moment the picker trigger is clicked (in the trigger's `onMouseDown` or `onPointerDown` BEFORE focus changes), store in a ref, and use the ref on insert.
**Warning sign:** The Vitest cursor-position test (D-05) passes but Cypress/manual mobile tests show the snippet lands at position 0.

### Pitfall 5: `onRangeChange` shape varies by view
**What goes wrong:** Backend gets `{from: undefined, to: undefined}` because the calendar passed an array instead of an object.
**Why it happens:** rbc returns `{start, end}` for Month, `Date[7]` for Week, `Date[1]` for Day, and `{start, end}` for Agenda. [CITED: react-big-calendar docs `onRangeChange`]
**How to avoid:** Wrap with `normalizeRange(range)` that handles each shape explicitly; unit-test it with all three view outputs.
**Warning sign:** Calendar appears empty on Week/Day views but works on Month.

### Pitfall 6: `plainto_tsquery` + AND semantics over short queries
**What goes wrong:** User types "launch announce" → query is `'launch' & 'announce'` → no hit because rows have only one of the two.
**Why it happens:** `plainto_tsquery` AND-joins terms.
**How to avoid:** Acceptable for v1 (search precision is desirable), but if user feedback says "too few results" upgrade to `websearch_to_tsquery` (PG 11+) which supports OR via spaces and AND via quoted phrases. Document as a tunable.
**Warning sign:** Users complain that obvious-looking queries return nothing.

### Pitfall 7: `ts_rank` is `0` when the WHERE @@ matches via `tag_search_vector` only
**What goes wrong:** A row where the only match is a tag name ranks 0 against `ts_rank(search_vector, query)`.
**Why it happens:** `ts_rank` is computed against the vector you pass; if only the tag vector matched, the post-text vector returns 0.
**How to avoid:** Pass the concatenation: `ts_rank(search_vector || tag_search_vector, query)`. Mirrors the `WHERE` predicate.
**Warning sign:** Tag-only matches sink to the bottom of results despite being "good" hits.

### Pitfall 8: Pino redact `*.field` only matches top-level objects, not arrays
**What goes wrong:** `*.openaiApiKey` matches `{a: {openaiApiKey: 'x'}}` but NOT `{rows: [{openaiApiKey: 'x'}]}`.
**Why it happens:** Pino wildcards are object-key wildcards, not deep paths. [CITED: pino redaction docs]
**How to avoid:** For arrays of objects, use `arrayPath[*].field`. The SEC-07 contract test mitigates this — if no schema declares an `openai…` field, the at-runtime risk is zero.
**Warning sign:** A future job payload `{rows: [{openaiApiKey: ...}]}` would log unredacted; the static schema test catches this before it ships.

### Pitfall 9: react-big-calendar 1.19.4 React 19 strict-mode warnings
**What goes wrong:** rbc may produce act() warnings or ref-related warnings in React 19's stricter checks.
**Why it happens:** rbc was written for React 16+; its peer accepts 19 but internal patterns may be older.
**How to avoid:** Test once with React 19 strict mode in Vitest; if warnings appear, isolate them so they don't drown CI logs. None blocking — peer accepts 19. [VERIFIED: `npm view react-big-calendar peerDependencies`]
**Warning sign:** Console noise in dev; component tests pass.

### Pitfall 10: GIN index slow-write under heavy POST traffic
**What goes wrong:** GIN updates are O(log N) per token but expensive on bulk inserts.
**Why it happens:** GIN maintains posting lists.
**How to avoid:** For this single-user app the posts table will never be huge; do not pre-optimize. `fastupdate=on` (the default) defers index maintenance via the pending list; keep the default. Watch index size during long-running bulk imports.
**Warning sign:** CSV bulk import with 1000+ rows shows degraded throughput.

## Runtime State Inventory

This is not a rename or migration phase — Phase 11 is additive (new table, new columns, new code). No existing runtime state needs reconfiguration.

- **Stored data:** None to migrate. New `snippets` table is empty on first deploy. New `posts.search_vector` and `posts.tag_search_vector` columns are populated by the migration's `UPDATE` backfill in a single pass.
- **Live service config:** None affected. No external services have config that references this work.
- **OS-registered state:** None affected.
- **Secrets/env vars:** None affected. SEC-07 explicitly does NOT add `OPENAI_API_KEY` to env.
- **Build artifacts:** None affected.

The migration is forward-only (D-08); on rollback the new columns/index/triggers are dropped — no data loss because nothing else references them.

## Code Examples

### Snippet table schema (Drizzle)

```typescript
// packages/db/src/schema/snippets.ts
import { pgTable, pgEnum, uuid, varchar, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const snippetCategoryEnum = pgEnum('snippet_category', ['hashtag_set', 'text']);

export const snippets = pgTable('snippets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  category: snippetCategoryEnum('category').notNull().default('text'),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // SPEC: case-insensitive uniqueness per user enforced at DB level
  uniqueIndex('snippets_user_lower_name_unq').on(table.userId, sql`lower(${table.name})`),
  index('snippets_user_idx').on(table.userId),
]);
```

`drizzle-kit generate` will produce a `CREATE UNIQUE INDEX … ON snippets (user_id, lower(name))` — Postgres supports functional unique indexes natively.

### FTS query in service

```typescript
// packages/api/src/services/post.service.ts (excerpt)
import { sql } from 'drizzle-orm';

if (query.search) {
  const tsq = sql`plainto_tsquery('english', ${query.search})`;
  whereConditions.push(sql`(${posts.searchVector} || ${posts.tagSearchVector}) @@ ${tsq}`);
  selectFields.headline = sql<string>`ts_headline('english', ${posts.text}, ${tsq},
    'StartSel=<b>, StopSel=</b>, MaxWords=20, MinWords=10, ShortWord=2')`;
  selectFields.rank = sql<number>`ts_rank(${posts.searchVector} || ${posts.tagSearchVector}, ${tsq})`;
  orderBy = sql`rank DESC`;
}
```

`drizzle-orm/sql` template tag escapes parameters; `${query.search}` is a parameter, not interpolated.

### Calendar route handler

```typescript
// packages/api/src/routes/calendar.ts (sketch)
router.get('/', requireAuth, validateQuery(calendarQuerySchema), async (req, res) => {
  const { from, to, platforms, profileIds, tagIds, scope } = req.validatedQuery;
  const userId = req.session.userId;

  const rows = await db.select({...}).from(posts)
    .where(and(
      eq(posts.userId, userId),
      gte(posts.scheduledAt, new Date(from)),
      lte(posts.scheduledAt, new Date(to)),
      isNotNull(posts.scheduledAt),
      ...platforms?.length ? [inArray(posts.platform, platforms)] : [],
      ...profileIds?.length ? [inArray(posts.profileId, profileIds)] : [],
      scope === 'queued' ? [eq(posts.status, 'queued')] :
        scope === 'scheduled' ? [eq(posts.status, 'scheduled')] :
          [inArray(posts.status, ['scheduled', 'queued', 'publishing'])],
    ));

  // Annotate hasConflict per row using existing checkConflicts (D-13)
  const annotated = await Promise.all(rows.map(async (row) => {
    const conflicts = await checkConflicts(db, userId, row.profileId, row.scheduledAt!.toISOString(), row.id);
    return { ...row, hasConflict: conflicts.length > 0 };
  }));

  res.json({ events: annotated });
});
```

**Performance note:** The N+1 `checkConflicts` per row is acceptable for the single-user calendar (typical month load is 50–200 events, each conflict check is one indexed query). If profiling shows it's hot, batch with a single self-join over the windowed range. Defer that optimization until proven needed.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `csurf` middleware | `csrf-csrf` (Double Submit) | csurf deprecated 2022 | Already in this codebase |
| Manual `tsvector` triggers on every column | `STORED GENERATED` columns | PG 12 (2019) | What CONTEXT D-06 chose for `text + notes` |
| `to_tsquery` (errors on punctuation) | `plainto_tsquery` for forms, `websearch_to_tsquery` for explicit operators | PG 11 (2018) | This phase uses `plainto_tsquery` |
| FullCalendar v3/v4 React wrappers | `react-big-calendar` direct React component | rbc has been stable since ~2020; FC moved to a paid commercial license for Premium features | rbc remains the open-source standard for React calendars |

**Deprecated/outdated in this codebase domain:**
- `pg` (node-postgres) → `postgres` (porsager). Already migrated.
- `bcrypt` → `argon2`. Already migrated.

## Project Constraints (from CLAUDE.md)

The planner MUST honor these directives — they are equal in authority to CONTEXT decisions:

- **Module structure:** All services expose factory functions; no top-level side effects; env vars read inside functions, not at module scope. Snippet service follows this.
- **Error handling:** Every async op needs explicit handling; resource cleanup in `finally`; no empty catch blocks; wrap low-level errors with context.
- **Naming:** Booleans use `is/has/should` prefix; no `data`/`result` generic names; spell out abbreviations except `id`/`url`/`db`. The calendar `hasConflict` field follows this.
- **Validation:** Enum-like Zod strings → `z.enum()`; multi-step DB mutations in `db.transaction()`; remove unused schema fields. `snippet.category` is `z.enum(['hashtag_set', 'text'])`.
- **Type safety:** No `any` or `unknown` without narrowing; explicit param + return types.
- **Testing:** Security-critical code 100% branch coverage. SEC-07 redact + contract test must hit both pass and fail paths.
- **Dependencies:** Production deps tilde `~` (patch-only). New `react-big-calendar` pin: `~1.19.4`. CLAUDE.md version specs must match installed.
- **Docker / infra:** No new container images required for this phase.
- **GSD workflow enforcement:** Edits go through GSD commands.
- **No Claude attribution in commits or PR review comments** (global rule).

`packages/web/CLAUDE.md` and `packages/api/CLAUDE.md` referenced from CONTEXT also bind — semantic HTML, accessibility, naming, middleware order, pino redact pattern.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 LTS | API + worker + web build | ✓ | (project-pinned via `engines` and Docker base) | — |
| Postgres 17 | FTS migration | ✓ | per `INFRA-04` | — |
| Redis 7.4 | BullMQ (CSV substitution path) | ✓ | per `INFRA-05` | — |
| pnpm workspaces | New deps in `@sms/web` only | ✓ | per `INFRA-01` | — |
| `react-big-calendar` 1.19.4 | Calendar UI | ✗ (not yet installed) | — | none — installing this is a phase deliverable |
| `@types/react-big-calendar` 1.16.3 | TypeScript types | ✗ | — | none — devDep installed alongside |

**Missing dependencies with no fallback:** none — only `react-big-calendar` is net-new and SPEC mandates it.

**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (per CLAUDE.md and `package.json` per-package `vitest` script) |
| Config file | per-package `vitest.config.ts` (existing) |
| Quick run command | `pnpm --filter @sms/api test -- --run path/to/test.ts -t 'name'` |
| Full suite command | `pnpm test` (root, runs all packages) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SNIP-01 | Snippet CRUD service: create/list/update/delete + ownership 404 + duplicate-name 409 | unit + integration | `pnpm --filter @sms/api test -- snippet.service.test` | ❌ Wave 0 |
| SNIP-01 | DB-level case-insensitive unique constraint rejects duplicate | integration (real Postgres) | `pnpm --filter @sms/api test -- integration/snippets-api.test` | ❌ Wave 0 |
| SNIP-02 / POST-CMN-08 | Snippet picker inserts body at textarea cursor without overwriting unrelated text (D-05) | component | `pnpm --filter @sms/web test -- SharedPostFields.test` | ❌ Wave 0 (extend existing) |
| SNIP-02 | Picker keyboard nav (arrow / enter / escape) | component | `pnpm --filter @sms/web test -- SnippetPicker.test` | ❌ Wave 0 |
| SNIP-03 | `substituteSnippetsInText` happy path: 1 token replaced | unit (shared lib) | `pnpm --filter @sms/shared test -- snippet-tokens.test` | ❌ Wave 0 |
| SNIP-03 | Missing snippet returns to `missing[]` and original token preserved | unit | same as above | ❌ Wave 0 |
| SNIP-03 | CSV bulk import end-to-end: 3 rows (valid, missing, none) → 2 inserts + 1 error report row | integration | `pnpm --filter @sms/worker test -- bulk/csv-import.handler.test` | ❌ Wave 0 (extend existing) |
| SEARCH-01 | Search input on PostsPage, QueuePostsPage, CalendarPage debounces and updates URL | component | `pnpm --filter @sms/web test -- QueuePostsPage.test` | ❌ Wave 0 (PostsPage already covers this) |
| SEARCH-02 | `getPosts({ search })` builds tsquery, filters, ranks, returns headline | unit (mocked db) | `pnpm --filter @sms/api test -- post.service.test` | ✓ extend existing |
| SEARCH-02 | Real Postgres FTS: seed ≥50 posts, query returns ranked + highlighted | integration | `pnpm --filter @sms/api test -- integration/posts-search.test` | ❌ Wave 0 |
| SEARCH-02 | `EXPLAIN` on the FTS query shows `Bitmap Index Scan on posts_fts_idx` | integration | same as above | ❌ Wave 0 |
| SEARCH-02 | Scheduled-list search excludes queued/published rows; Queue search excludes others | integration | same as above | ❌ Wave 0 |
| CAL-01 | `GET /api/calendar?from&to` returns rows in window, none outside | integration | `pnpm --filter @sms/api test -- integration/calendar-api.test` | ❌ Wave 0 |
| CAL-01 | CalendarPage renders M/W/D switcher and refetches on view change | component | `pnpm --filter @sms/web test -- CalendarPage.test` | ❌ Wave 0 |
| CAL-02 | `eventPropGetter` returns per-platform classes; click event navigates to edit; click slot navigates to new with `scheduledAt` | component | same as above | ❌ Wave 0 |
| CAL-03 | Filter changes propagate as query params and narrow returned events | integration + component | combined | ❌ Wave 0 |
| CAL-04 | API annotates `hasConflict=true` for two same-profile posts ±5min apart; false for different profiles | integration | `pnpm --filter @sms/api test -- integration/calendar-conflict.test` | ❌ Wave 0 |
| CAL-04 | Calendar applies destructive left-border to `hasConflict=true` events; tooltip wording matches `ScheduleConflictBanner` | component | CalendarPage.test | ❌ Wave 0 |
| SEC-07 | Pino redact masks `openai_api_key`, `openaiApiKey`, `OPENAI_API_KEY`, nested copies, `Authorization` | unit | `pnpm --filter @sms/shared test -- logger.test` (extend) | ✓ extend existing (`packages/api/src/__tests__/logger.test.ts` line 17–26 is the model) |
| SEC-07 | All BullMQ job-data Zod schemas reject any field name matching `/openai\|api[_-]?key/i` (contract test) | unit | `pnpm --filter @sms/api test -- sec-07-job-schema.test` | ❌ Wave 0 |
| SEC-07 | `grep -r "openai" packages/api/src` finds only the redact config + this test | shell check (manual gate) | `rg "openai" packages/api/src` | n/a — manual closure check per D-18 |

### Sampling Rate
- **Per task commit:** Per-package quick test for the touched area (`pnpm --filter @sms/api test -- snippet.service.test`).
- **Per wave merge:** Full suite for affected packages (`pnpm --filter @sms/api test && pnpm --filter @sms/web test`).
- **Phase gate:** Full root `pnpm test` green before `/gsd-verify-work`. Manual `rg "openai" packages/api/src` check per D-18.

### Key Invariants Per Requirement

- **SNIP-01:** No code path inserts a snippet without an authenticated `userId`. Cross-user reads return 404, never 403 (no info leak about existence).
- **SNIP-02:** Inserting a snippet never overwrites text outside the user's selection. The cursor lands strictly after the inserted body.
- **SNIP-03:** Stored `posts.text` after a CSV import never contains `{{` or `}}`. (Asserted by SQL `LIKE` check in the integration test.)
- **SEARCH-02:** GIN index hit is verified by `EXPLAIN (FORMAT JSON)` parsing — the test asserts an index scan node exists referencing `posts_fts_idx`.
- **SEARCH-02:** Search responses always include `headline` and `rank` fields when `search` was passed; never when it was absent.
- **CAL-01:** No call to `getCalendar` returns rows with `scheduledAt < from` or `> to`.
- **CAL-04:** `hasConflict` annotation logic is the SAME function (`checkConflicts`) as the post creation form — divergence is forbidden.
- **SEC-07:** No production code in `packages/api/src/**` (excluding `__tests__/`) references `openai`, `OPENAI_API_KEY`, or any AI service. Asserted by ripgrep on every Phase 11 plan-checker run.
- **SEC-07:** Every BullMQ job-data schema is enumerated by the contract test. New schemas added in future phases are auto-included as long as the test imports its module.

### Wave 0 Gaps
- [ ] `packages/db/src/schema/snippets.ts` — new schema file
- [ ] `packages/db/drizzle/0009_phase-11-snippets-fts-calendar.sql` — generated migration + manual trigger SQL appended
- [ ] `packages/shared/src/schemas/snippets.ts` — Zod schemas for snippet CRUD
- [ ] `packages/shared/src/schemas/calendar.ts` — query + response schemas
- [ ] `packages/shared/src/lib/snippet-tokens.ts` — `substituteSnippetsInText` shared util
- [ ] `packages/api/src/services/snippet.service.ts` + tests
- [ ] `packages/api/src/routes/snippets.ts` + tests
- [ ] `packages/api/src/routes/calendar.ts` + tests
- [ ] `packages/api/src/__tests__/integration/posts-search.test.ts`
- [ ] `packages/api/src/__tests__/integration/calendar-api.test.ts`
- [ ] `packages/api/src/__tests__/integration/snippets-api.test.ts`
- [ ] `packages/api/src/__tests__/sec-07-job-schema.test.ts`
- [ ] `packages/web/src/pages/calendar/CalendarPage.tsx` + tests
- [ ] `packages/web/src/pages/settings/SnippetsPage.tsx` + tests
- [ ] `packages/web/src/components/snippets/SnippetPicker.tsx` + tests
- [ ] `packages/web/src/components/snippets/SnippetFormDialog.tsx`
- [ ] `packages/web/src/hooks/useSnippets.ts`, `useCalendarPosts.ts`
- [ ] `packages/web/src/lib/headline-to-mark.ts` + tests
- [ ] `packages/web/src/lib/calendar-localizer.ts`
- [ ] Extend `packages/web/src/components/posts/SharedPostFields.tsx` test for cursor insertion
- [ ] Extend `packages/api/src/__tests__/logger.test.ts` for new redact paths
- [ ] Extend bulk-import worker test for `{{snippet:name}}` substitution end-to-end
- [ ] `SECURITY.md` (or `docs/SECURITY.md`) — new file or section

## Security Domain

Required — `security_enforcement` is enabled by absence of `false`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing session middleware (Phase 2) — every Phase 11 route uses `requireAuth`; no new auth |
| V3 Session Management | yes | Existing express-session + connect-redis; no changes |
| V4 Access Control | yes | All snippet endpoints filter by `userId`; calendar query filters by `userId`; cross-user 404 (not 403) |
| V5 Input Validation | yes | All endpoints use Zod schemas via existing `validateBody` / `validateQuery` middleware; `snippet.name` is `z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_\- ]+$/)`; `body` `.max(10_000)`; calendar `from`/`to` ISO datetime |
| V6 Cryptography | no | No new credentials or secrets in this phase. SEC-07 explicitly forbids storing OpenAI keys |
| V7 Error Handling | yes | Existing `AppError` pattern; never leak DB error messages to client |
| V11 Business Logic | yes | CSV substitution missing-snippet path returns row error, not 500; tag-rename caveat documented |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via search input | Tampering | Drizzle `sql\`...\`` parameter binding; `plainto_tsquery` accepts arbitrary user text without escaping needed |
| XSS via `ts_headline` HTML | Tampering | Allowlist parser converts `<b>` → `<mark>`; never `dangerouslySetInnerHTML` |
| XSS via stored snippet body | Tampering | Body rendered as text (no HTML), inserted into a `<textarea>` `value` not `innerHTML` |
| CSRF on snippet mutations | Tampering | Existing `csrf-csrf` middleware applies to all POST/PATCH/DELETE; no exceptions in Phase 11 |
| IDOR — read another user's snippet by ID | Information Disclosure | Service queries always include `eq(snippets.userId, sessionUserId)`; cross-user lookup returns 404 |
| Mass assignment via Zod `.passthrough()` | Tampering | All schemas use `.strict()` (existing pattern from `posts.ts` schema) |
| Log injection / token leak in CSV substitution | Information Disclosure | Substitution runs in worker; no logging of full row content; only `rowNumber` + `errorType` |
| BullMQ payload contains OpenAI key | Information Disclosure | SEC-07 contract test fails build if any job schema declares an OpenAI-key field |
| Calendar query DoS via huge `from..to` window | DoS | `calendarQuerySchema` enforces max window (e.g., 90 days); reject larger ranges with 400 |
| Snippet body XSS in CSV-imported posts | Tampering | Posts table content is text only — only the eventual social-platform render is the consumer; platform APIs handle their own escaping |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `react-big-calendar` 1.19.4 has no React 19 strict-mode show-stopper bugs (peer accepts 19; manual smoke test required at install) | Pitfall 9 | Calendar component throws on render — would force pinning to 1.18.x or wrapping in a boundary |
| A2 | The `posts.text + ' ' + COALESCE(notes,'')` generated expression is accepted by Postgres 17 as immutable | Pattern 1 | Migration fails; mitigation in same section (always pass `'english'` regconfig literal) |
| A3 | Pino redact wildcards (`*.openai_api_key`) match top-level wildcards as documented | Pattern 5 | Logged objects with deeply-nested keys could leak — mitigation is the static contract test on schemas, which closes the gap |
| A4 | `_def.shape()` is the right Zod 3 reflection API for ZodObject (works on `ZodObject` but breaks on `ZodEffects`/`ZodRefinement` wrapping) | Pattern 5 | Test passes on `.strict()` objects but skips fields when schema is wrapped in `.refine()`; fix by unwrapping `_def.schema` first |
| A5 | The N+1 `checkConflicts` per calendar row is acceptable performance for typical month windows | Code Examples | If profiling shows it's hot, refactor to a single self-join — deferred until proven |
| A6 | `cmdk` (`<Command>`) is already installed via shadcn (UI-SPEC asserts so; not directly verified in this research) | Pattern 1 | If absent, add via `pnpm dlx shadcn add command` — already in UI-SPEC component inventory |

**The remaining factual claims in this research were verified via tool calls** (npm view, file reads, ripgrep) **or directly cited from project files (CONTEXT.md, SPEC.md, UI-SPEC.md, REQUIREMENTS.md, CLAUDE.md, existing codebase).**

## Open Questions (RESOLVED)

1. **Tag-rename → tsvector refresh — accept the gap or add a second trigger?**
   - What we know: SPEC §Boundaries excludes tag CRUD changes from this phase.
   - What's unclear: Whether existing TAGS-01 (tag rename) exercises stale-vector behavior often enough to matter today.
   - RESOLVED: Documented as accepted gap. Plan 11-03 threat T-11-03-05 records the disposition; tag CRUD is excluded by SPEC §Boundaries and no second trigger is added in Phase 11.

2. **`websearch_to_tsquery` vs `plainto_tsquery`?**
   - What we know: Both are PG-builtin; CONTEXT prescribes neither explicitly (D-06..D-09 cover storage, not query).
   - What's unclear: Whether users want OR semantics ("launch announce" → either word) for breadth.
   - RESOLVED: Plans 11-06 and 11-07 use `plainto_tsquery` (AND semantics) at the search service layer; switch to `websearch_to_tsquery` is deferred until user feedback warrants it.

3. **`SECURITY.md` location — root or `docs/`?**
   - What we know: CONTEXT D-17 says "planner picks based on existing project convention."
   - What's unclear: This repo has no `SECURITY.md` today and no `docs/` directory at root.
   - RESOLVED: `SECURITY.md` lives at the repo root (GitHub-recognized convention, adjacent to `README.md`); the docs plan in this phase writes to that path.

4. **Calendar window size cap?**
   - What we know: SPEC says windowed; no max declared.
   - What's unclear: Whether we should reject ranges larger than e.g. 90 days as a DoS guard.
   - RESOLVED: 100-day window cap implemented in plan 11-01 `calendarQuerySchema.refine` and enforced in plan 11-07 Test 2.

5. **Snippet name allowed character set in `{{snippet:name}}`?**
   - What we know: SPEC says "case-insensitive name match." UI allows `[a-zA-Z0-9_\- ]+`.
   - What's unclear: Whether spaces in names are valid inside `{{snippet:name with spaces}}` tokens.
   - RESOLVED: `[a-zA-Z0-9_\- ]+` allowed in both the UI snippet name validator (plan 11-09) and the CSV `{{snippet:name}}` regex (plan 11-10), with trim-before-lookup applied at the resolver.

## Sources

### Primary (HIGH confidence)
- Local files (verified via Read/Bash):
  - `.planning/phases/11-snippets-search-calendar-polish/11-CONTEXT.md` — locked decisions D-01..D-18
  - `.planning/phases/11-snippets-search-calendar-polish/11-SPEC.md` — 11 requirements
  - `.planning/phases/11-snippets-search-calendar-polish/11-UI-SPEC.md` — design contract
  - `.planning/REQUIREMENTS.md` — full project requirements
  - `CLAUDE.md` — project conventions, locked stack
  - `packages/db/src/schema/posts.ts` — current posts schema
  - `packages/api/src/services/post.service.ts` — `checkConflicts`, `getPosts` (current `ilike`)
  - `packages/shared/src/logger.ts` — `DEFAULT_REDACT` extension point
  - `packages/api/src/__tests__/logger.test.ts` — current redact test pattern
  - `packages/shared/src/schemas/bulk-jobs.ts`, `bulk-import.ts` — sample BullMQ job schemas
  - `packages/web/src/pages/posts/PostsPage.tsx` — search input + empty-state pattern
  - `packages/web/package.json`, `packages/api/package.json` — version pins
- Tool-verified versions:
  - `react-big-calendar@1.19.4` (npm view, peers `react ^16 || ^17 || ^18 || ^19`)
  - `@types/react-big-calendar@1.16.3`

### Secondary (MEDIUM confidence — cited)
- Postgres 17 docs §12.4.3 *Generated Columns and FTS* — generated `tsvector` requires immutable expression
- Postgres 17 docs §12.3.4 *Highlighting Results* — `ts_headline` HTML escapes source text
- Postgres docs *Text Search Functions* — `ts_rank` semantics, `plainto_tsquery` AND semantics
- `react-big-calendar` README + `components.toolbar`, `eventPropGetter`, `onRangeChange`, `luxonLocalizer` — official API
- `pino` redaction docs (github.com/pinojs/pino/blob/main/docs/redaction.md) — wildcard semantics

### Tertiary (LOW — assumed, see Assumptions Log)
- Behavior of Zod 3 `_def.shape()` reflection on `ZodEffects` (A4)
- Calendar perf assumption that N+1 `checkConflicts` is acceptable (A5)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dep exists in `package.json` except `react-big-calendar`, which was version-verified via `npm view`.
- Architecture: HIGH — all decisions are pre-locked in CONTEXT and consistent with the existing codebase patterns.
- Pitfalls: HIGH for the Postgres ones (cited to docs); MEDIUM for the React 19 strict-mode rbc pitfall (no documented bugs but not exhaustively tested).
- Validation architecture: HIGH — every requirement maps to a known test file pattern.
- Security: HIGH — all controls inherit from existing middleware; SEC-07 contract test design is concrete.

**Research date:** 2026-05-01
**Valid until:** 2026-06-01 (30 days — stable stack; rbc release cadence and Postgres FTS API are unlikely to invalidate within that window)

---

## RESEARCH COMPLETE

**Phase:** 11 — Snippets, Search, Calendar
**Confidence:** HIGH

### Key Findings (5 plan-shaping bullets)

1. **The phase is mostly assembly, not invention.** Every external choice is pre-locked: `react-big-calendar` (with React-19-compatible peer, version-verified at 1.19.4), Postgres FTS via `STORED GENERATED tsvector` + trigger-maintained tag vector + GIN over their concatenation (CONTEXT D-06..D-09), `pino` redact extension (D-14), and a 30-line regex-based snippet substituter. No new architectural patterns are needed — the planner should resist the urge to design and instead lean on existing conventions (factory functions, `parseCsvBuffer`/`writeErrorReport`, `DEFAULT_REDACT`, shadcn primitives).

2. **Postgres FTS migration is the highest-risk piece — verify immutability and bench the GIN.** The generated column expression must use `to_tsvector('english', …)` (immutable form, not the regconfig-less stable form) or the migration fails outright. The combined GIN `(search_vector || tag_search_vector)` is essential — separate indexes lose index-scan eligibility. A real-Postgres integration test asserting `EXPLAIN` shows `Bitmap Index Scan on posts_fts_idx` is the right signal for SEARCH-02 acceptance.

3. **Snippet picker cursor handling has a sneaky cross-browser bug — capture selection BEFORE focus moves.** The Vitest cursor-position test (D-05) won't catch this; mobile Safari blurs the textarea on popover open and collapses `selectionStart` to 0. Capture `selectionStart`/`selectionEnd` in `onPointerDown` of the trigger button, not `onClick`, and store in a ref. Plan should call this out as a wave invariant.

4. **CSV substitution belongs in the worker, not the API route.** SNIP-03 plugs into the existing `bulk-ops-worker` flow at the point where `params.rows` is already Zod-validated. The shared `substituteSnippetsInText` lives in `packages/shared/src/lib/` so both the worker and a future test can import it. Stored post text never contains `{{` or `}}` — assert this with a SQL `LIKE` check in integration tests.

5. **SEC-07 is a static contract — three concrete artifacts, zero runtime AI code.** (a) Extend `DEFAULT_REDACT` in `packages/shared/src/logger.ts` (worker inherits automatically), (b) ship `packages/api/src/__tests__/sec-07-job-schema.test.ts` enumerating every BullMQ Zod schema and asserting no field name matches `/openai|api[_-]?key/i`, (c) write `SECURITY.md` at repo root with the per-request-only policy. Phase closure requires `rg "openai" packages/api/src` to find ONLY the redact config + test file. The contract test is the structural guarantee for Phase 12.

### File Created
`.planning/phases/11-snippets-search-calendar-polish/11-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All versions verified via `npm view` or `package.json` reads |
| Architecture | HIGH | Decisions pre-locked in CONTEXT; consistent with codebase patterns |
| Pitfalls | HIGH | Postgres pitfalls cited to docs; rbc + cursor pitfalls grounded in known browser behavior |
| Validation Architecture | HIGH | Every requirement mapped to a Vitest invocation; Wave 0 gaps enumerated |
| Security | HIGH | SEC-07 has concrete artifacts (paths, test file, regex) |

### Open Questions
1. Tag-rename → tsvector staleness: accept the gap (recommended) vs. add a second trigger.
2. `plainto_tsquery` (AND, recommended) vs. `websearch_to_tsquery` (OR + phrase support).
3. `SECURITY.md` location — repo root recommended (GitHub convention).
4. Calendar window cap (100 days recommended as DoS guard).
5. Allowed character set for `{{snippet:name}}` tokens (recommend `[a-zA-Z0-9_\- ]+`).

### Ready for Planning
Research is complete. Planner can now create PLAN.md grounded in this research + CONTEXT decisions + UI-SPEC.
