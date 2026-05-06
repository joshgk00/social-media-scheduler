# Phase 11: Snippets, Search, Calendar - Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 24 new + 6 modified = 30
**Analogs found:** 28 / 30 (2 net-new patterns: generated `tsvector` column + `react-big-calendar` integration)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/db/src/schema/snippets.ts` | Drizzle schema | CRUD | `packages/db/src/schema/tags.ts` | exact |
| `packages/db/src/schema/index.ts` (modify) | Barrel export | — | self | exact |
| `packages/db/drizzle/0009_phase-11-snippets-fts-calendar.sql` | SQL migration | DDL / batch | `packages/db/drizzle/0008_phase-10-bulk-operations.sql` | role-match (no prior tsvector analog — net-new) |
| `packages/db/src/schema/posts.ts` (modify) | Drizzle schema | CRUD | self (existing posts) | exact |
| `packages/shared/src/schemas/snippets.ts` | Zod schema | request-response | `packages/shared/src/schemas/tags.ts` | exact |
| `packages/shared/src/schemas/calendar.ts` | Zod schema | query/response | `packages/shared/src/schemas/posts.ts` (`postQuerySchema`, lines 223-251) | exact |
| `packages/shared/src/schemas/posts.ts` (modify) | Zod schema | request-response | self | exact |
| `packages/shared/src/index.ts` (modify) | Barrel export | — | self | exact |
| `packages/shared/src/lib/snippet-tokens.ts` | Shared util | transform | `packages/shared/src/lib/spinnable-text.ts`, `normalize-text.ts` | exact |
| `packages/shared/src/logger.ts` (modify) | Logger config | — | self (`DEFAULT_REDACT`, lines 3-6) | exact |
| `packages/api/src/services/snippet.service.ts` | Express service module | CRUD | `packages/api/src/services/tag.service.ts` | exact |
| `packages/api/src/routes/snippets.ts` | Express router factory | request-response | `packages/api/src/routes/tags.ts` | exact |
| `packages/api/src/routes/calendar.ts` | Express router factory | request-response | `packages/api/src/routes/tags.ts` (factory shape) + `packages/api/src/services/post.service.ts` `getPosts` (query shape) | role-match |
| `packages/api/src/services/post.service.ts` (modify) | Express service module | CRUD/search | self (`getPosts` lines 424-507) | exact |
| `packages/api/src/app.ts` (modify) | Express app factory | wiring | self (lines 51-123) | exact |
| `packages/api/src/__tests__/logger.test.ts` (modify) | Vitest unit test | — | self (lines 17-26 — redact paths shape) | exact |
| `packages/api/src/__tests__/sec-07-job-schema.test.ts` | Vitest contract test | static schema check | `packages/shared/src/__tests__/posts-discriminated-union.test.ts` (Zod reflection style) | role-match |
| `packages/api/src/__tests__/integration/snippets-api.test.ts` | Integration test | — | `packages/api/src/__tests__/integration/posts-api.test.ts` | exact |
| `packages/api/src/__tests__/integration/posts-search.test.ts` | Integration test | — | same | exact |
| `packages/api/src/__tests__/integration/calendar-api.test.ts` | Integration test | — | same | exact |
| `packages/api/src/services/__tests__/snippet.service.test.ts` | Vitest unit test | — | `packages/api/src/services/__tests__/profile.service.test.ts` (mock-db pattern) | exact |
| `packages/worker/src/bulk/csv-import-scheduled.handler.ts` (modify) | BullMQ job handler | batch | self (lines 1-46) | exact |
| `packages/web/src/hooks/use-snippets.ts` | TanStack Query hook | request-response | `packages/web/src/hooks/use-posts.ts` (`usePosts`, `useCreatePost`, etc.) | exact |
| `packages/web/src/hooks/use-calendar-posts.ts` | TanStack Query hook | request-response | same | exact |
| `packages/web/src/components/snippets/SnippetPicker.tsx` | React feature component | event-driven | `packages/web/src/components/posts/TagSelector.tsx` + shadcn `<Command>` | role-match |
| `packages/web/src/components/snippets/SnippetFormDialog.tsx` | React dialog | request-response | `packages/web/src/components/profiles/EditProfileDialog.tsx` | exact |
| `packages/web/src/pages/settings/SnippetsPage.tsx` | React page | request-response | `packages/web/src/pages/settings/EmailLogsPage.tsx` (page shell) + `packages/web/src/pages/posts/PostsPage.tsx` (table + empty-state) | role-match |
| `packages/web/src/pages/calendar/CalendarPage.tsx` | React page | event-driven | `packages/web/src/pages/posts/PostsPage.tsx` (filter + URL state) | role-match (rbc is net-new) |
| `packages/web/src/components/posts/SharedPostFields.tsx` (modify) | React component | event-driven | self (lines 60-160) | exact |
| `packages/web/src/components/layout/Sidebar.tsx` (modify) | Layout | — | self (`navItems` lines 22-31) | exact |
| `packages/web/src/lib/headline-to-mark.ts` | Pure util | transform | `packages/shared/src/lib/spinnable-text.ts` (regex-driven parser) | role-match |
| `packages/web/src/lib/calendar-localizer.ts` | Adapter / config | — | `packages/web/src/lib/timezone.ts` | role-match |
| `packages/web/src/components/snippets/__tests__/SnippetPicker.test.tsx` | Component test | — | `packages/web/src/components/profiles/__tests__/EditProfileDialog.test.tsx` | exact |
| `SECURITY.md` | Docs | — | `.planning/REQUIREMENTS.md` (markdown style) | role-match |

---

## Pattern Assignments

### `packages/db/src/schema/snippets.ts` (Drizzle schema, CRUD)

**Analog:** `packages/db/src/schema/tags.ts` (full file, 22 lines)

**Imports + table shape pattern** (lines 1-15):
```typescript
import { pgTable, uuid, varchar, timestamp, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { posts } from './posts.js';

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 50 }).notNull(),
  color: varchar('color', { length: 7 }).notNull().default('#6b7280'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('tags_user_name_lower').on(table.userId, sql`lower(${table.name})`),
]);
```

**Copy verbatim:** the cascade-from-users FK, `withTimezone: true` timestamps, and the functional `lower(${table.name})` unique index expression for the case-insensitive uniqueness constraint (D-CONTEXT.md SNIP-01 requirement).

**Divergence:** add `pgEnum('snippet_category', ['hashtag_set', 'text'])` and `body text` column (no length cap — `text` type, validated at Zod layer to 10_000 chars per RESEARCH §Security V5).

**Barrel export:** add `export { snippets, snippetCategoryEnum } from './snippets.js';` to `packages/db/src/schema/index.ts` line 8.

---

### `packages/db/drizzle/0009_phase-11-snippets-fts-calendar.sql` (SQL migration, DDL)

**Analog:** `packages/db/drizzle/0008_phase-10-bulk-operations.sql` (lines 1-22 show the format)

**Migration format pattern**:
```sql
CREATE TYPE "public"."bulk_operation_status" AS ENUM('queued', 'running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "bulk_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	...
);
--> statement-breakpoint
ALTER TABLE "bulk_operations" ADD CONSTRAINT "bulk_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bulk_operations_user_status_idx" ON "bulk_operations" USING btree ("user_id","status");
```

**Copy:** the `--> statement-breakpoint` separator drizzle-kit emits between every DDL statement; quoted identifier style; `ON UPDATE no action` boilerplate.

**Divergence (net-new — no prior analog):** `STORED GENERATED tsvector` column on `posts`, `plpgsql` trigger function, `CREATE INDEX … USING gin` over `(search_vector || tag_search_vector)`. RESEARCH §Pattern 1 lines 172-223 supply the complete SQL — copy that into the migration verbatim, append AFTER the `drizzle-kit generate` output for the `snippets` table. Include the one-time `UPDATE posts SET tag_search_vector = ...` backfill in the same file (D-08).

---

### `packages/shared/src/schemas/snippets.ts` (Zod schema, request-response)

**Analog:** `packages/shared/src/schemas/tags.ts` (full file, 14 lines)

**Schema pattern** (full content):
```typescript
import { z } from 'zod';

export const createTagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(50, 'Tag name must be 50 characters or fewer').trim(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color').default('#6b7280'),
});

export const updateTagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(50, 'Tag name must be 50 characters or fewer').trim().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color').optional(),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
```

**Copy:** the create/update split, `.trim()` on free-text, exported `z.infer` types named `CreateXInput` / `UpdateXInput`.

**Divergence:** add `category: z.enum(['hashtag_set', 'text'])` (per CLAUDE.md §Conventions: enum-like Zod strings → `z.enum()`); `body: z.string().min(1).max(10_000)`; `name: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_\- ]+$/)` (matches `{{snippet:name}}` token charset per RESEARCH Open Q5).

**Barrel:** add `export * from './schemas/snippets.js';` to `packages/shared/src/index.ts` (alongside line 18 `posts.js` export).

---

### `packages/shared/src/schemas/calendar.ts` (Zod schema, query/response)

**Analog:** `packages/shared/src/schemas/posts.ts` lines 223-251 (`postQuerySchema`, `conflictCheckSchema`)

**Query schema pattern**:
```typescript
export const postQuerySchema = z.object({
  status: z.enum([…]).optional(),
  profileId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
```

**Copy:** `z.coerce.number()` for query-string ints; `z.enum().optional()` for filter discriminants; `z.string().max(200).optional()` for `search` text.

**Divergence:** `from`/`to` are `z.string().datetime()`; cap window at 100 days via `.refine()` (RESEARCH Open Q4); `scope: z.enum(['scheduled', 'queued', 'both']).default('both')`; `platforms: z.array(z.enum(['twitter','linkedin','facebook'])).optional()`; `profileIds: z.array(z.string().uuid()).optional()`; `tagIds: z.array(z.string().uuid()).optional()`. Calendar response schema returns `{ events: Array<event-shape with hasConflict: boolean> }`.

---

### `packages/shared/src/lib/snippet-tokens.ts` (Shared util, transform)

**Analog:** `packages/shared/src/lib/normalize-text.ts` (8 lines) + `packages/shared/src/lib/spinnable-text.ts` lines 1-13 (regex-driven replacer)

**Regex-replace pattern** (`spinnable-text.ts` lines 1-13):
```typescript
const SPIN_GROUP_REGEX = /\{([^{}]+)\}/g;
const MAX_SPINNABLE_TEXT_LENGTH = 50_000;

export function resolveSpinnableText(text: string): string {
  if (text.length > MAX_SPINNABLE_TEXT_LENGTH) {
    return text;
  }
  return text.replace(SPIN_GROUP_REGEX, (_match, group: string) => {
    const options = group.split('|');
    return options[Math.floor(Math.random() * options.length)];
  });
}
```

**Copy:** module-scoped `const TOKEN_RE = /…/g`, single exported function, replacer takes a resolver callback for substitution lookup, length-guard on the input.

**Implementation guide:** RESEARCH §Pattern 3 lines 280-296 supplies the exact body. The function returns `{ result: string; missing: string[] }` so the worker can populate the bulk-op error report. Add `lib/snippet-tokens.js` to `packages/shared/src/lib/index.ts` line 11 (the lib aggregate barrel).

---

### `packages/api/src/services/snippet.service.ts` (Express service, CRUD)

**Analog:** `packages/api/src/services/tag.service.ts` (full file, 110 lines)

**Imports + factory style** (lines 1-16):
```typescript
import { eq, and, asc } from 'drizzle-orm';
import type { Db } from '@sms/db';
import { tags } from '@sms/db';
import { AppError } from '@sms/shared';
import { createLogger } from '@sms/shared/logger';

const logger = createLogger('tag-service');

export class TagServiceError extends AppError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
  }
}

interface CreateTagInput { name: string; color?: string; }
interface UpdateTagInput { name?: string; color?: string; }
```

**CRUD function pattern** (lines 27-45 — `createTag`):
```typescript
export async function createTag(db: Db, userId: string, input: CreateTagInput) {
  try {
    const [tag] = await db.insert(tags).values({ userId, name: input.name, color: input.color ?? '#6b7280' }).returning();
    logger.info({ tagId: tag.id, userId }, 'Tag created');
    return tag;
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      throw new TagServiceError('A tag with this name already exists.', 409);
    }
    logger.error({ err, userId }, 'Failed to create tag');
    throw err;
  }
}
```

**Update pattern with ownership** (lines 47-78):
```typescript
const updatedRows = await db.update(tags)
  .set(updateFields)
  .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
  .returning();

if (updatedRows.length === 0) {
  throw new TagServiceError('Tag not found', 404);
}
```

**Unique violation detection** (lines 104-109):
```typescript
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code === '23505') return true;
  const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
  return causeCode === '23505';
}
```

**Copy verbatim:** the named `XServiceError extends AppError` subclass; `(db: Db, userId: string, input: …)` parameter order; ownership filter `and(eq(snippets.id, id), eq(snippets.userId, userId))`; `returning()` + length-zero → 404 pattern; `isUniqueViolation` helper for 23505 → 409 mapping; logger named `'snippet-service'`.

---

### `packages/api/src/routes/snippets.ts` (Express router factory, request-response)

**Analog:** `packages/api/src/routes/tags.ts` (full file, 78 lines)

**Factory + dependency injection** (lines 1-21):
```typescript
import { Router } from 'express';
import { createTagSchema, updateTagSchema } from '@sms/shared';
import type { Db } from '@sms/db';
import { createTag, updateTag, deleteTag, getTags, TagServiceError } from '../services/tag.service.js';
import { requireAuth } from '../middleware/auth-guard.js';
import { validateUuidParam } from '../middleware/validation.js';

interface TagsDependencies { db: Db; }

export function createTagsRouter({ db }: TagsDependencies) {
  const router = Router();
  // ...
  return router;
}
```

**Route handler pattern** (lines 22-39 — POST):
```typescript
router.post('/api/tags', requireAuth, async (req, res) => {
  const parsed = createTagSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }
  try {
    const tag = await createTag(db, req.session.userId!, parsed.data);
    res.status(201).json(tag);
  } catch (err: unknown) {
    if (err instanceof TagServiceError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    throw err;
  }
});
```

**Copy verbatim:** factory function name `createSnippetsRouter`, dependency interface, `Router()` instance, `requireAuth` on every route, `safeParse` + 400 + `details: parsed.error.issues`, `validateUuidParam(req.params.id as string)` for `:id` routes, `req.session.userId!` non-null assertion (existing convention).

**Wiring (modify `app.ts` line 99):** add `app.use(createSnippetsRouter({ db }));` next to `app.use(createTagsRouter({ db }));`.

---

### `packages/api/src/routes/calendar.ts` (Express router factory, request-response)

**Analog:** `packages/api/src/routes/tags.ts` (factory shape) + `packages/api/src/services/post.service.ts` `getPosts` lines 424-507 (windowed query shape)

**Query construction pattern** (`post.service.ts` lines 424-465):
```typescript
const conditions = [eq(posts.userId, userId)];

if (query.status) conditions.push(eq(posts.status, query.status));
if (query.profileId) conditions.push(eq(posts.profileId, query.profileId));
…

const postRows = await db
  .select({
    post: posts,
    profile: { displayName: socialProfiles.displayName, handle: socialProfiles.handle, avatarUrl: socialProfiles.avatarUrl },
  })
  .from(posts)
  .leftJoin(socialProfiles, eq(posts.profileId, socialProfiles.id))
  .where(and(...conditions))
  .orderBy(sql`${posts.scheduledAt} DESC NULLS LAST`, sql`${posts.createdAt} DESC`);
```

**Copy:** the `conditions: SQL[] = [eq(posts.userId, userId)]` accumulator pattern, conditional `.push()` per filter, `leftJoin(socialProfiles, …)`, `and(...conditions)` spread.

**Implementation guide:** RESEARCH §Code Examples lines 545-571 supply the full handler shape including the per-row `checkConflicts` annotation. Reuse `checkConflicts` from `post.service.ts` lines 509-548 unchanged — D-13 forbids divergence. Wire under a new path prefix `app.use('/api/calendar', createCalendarRouter({ db }));`.

---

### `packages/api/src/services/post.service.ts` (modify — getPosts FTS rewrite)

**Self-analog:** `getPosts` lines 424-507. Current implementation uses `ilike(posts.text, …)` (line 438).

**Current `ilike` predicate to replace** (line 437-439):
```typescript
if (query.search) {
  conditions.push(ilike(posts.text, `%${escapeLikePattern(query.search)}%`));
}
```

**FTS replacement (RESEARCH §Code Examples lines 530-537):**
```typescript
if (query.search) {
  const tsq = sql`plainto_tsquery('english', ${query.search})`;
  conditions.push(sql`(${posts.searchVector} || ${posts.tagSearchVector}) @@ ${tsq}`);
  // selectFields gain: headline = ts_headline(...), rank = ts_rank(... || ..., tsq)
  // orderBy = sql`rank DESC` only when query.search is set
}
```

**Copy:** the existing `conditions.push(...)` shape; the existing `db.select({...}).from(posts).leftJoin(...).where(and(...conditions)).orderBy(...).limit(limit).offset(offset)` chain.

**Divergence:** when `query.search` is set, swap `orderBy` from `sql\`${posts.scheduledAt} DESC NULLS LAST\`` to `sql\`rank DESC\``; conditionally include `headline` in the `select` map. **Scope-by-view** (SPEC SEARCH-02): planner exposes a new optional query field `searchScope` so the calendar/queue routes can reuse `getPosts` without each scope hard-coding status filters in service code.

**Drop:** the local `escapeLikePattern` import on line 4 once the only consumer is gone.

---

### `packages/shared/src/logger.ts` (modify — extend DEFAULT_REDACT)

**Self-analog:** lines 3-6 (`DEFAULT_REDACT`).

**Current pattern:**
```typescript
const DEFAULT_REDACT = {
  paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["set-cookie"]'],
  censor: '[REDACTED]',
};
```

**Extension (RESEARCH §Pattern 5 lines 347-361):** append SEC-07 paths per D-14:
```typescript
paths: [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.body.openai_api_key',
  'req.body.openaiApiKey',
  'req.body.OPENAI_API_KEY',
  '*.openai_api_key',
  '*.openaiApiKey',
  '*.OPENAI_API_KEY',
],
```

**Copy:** identical object shape, comma-trailing array entries, `[REDACTED]` censor string. Worker inherits via `createLogger` factory (per CLAUDE.md §shared "minimal public API").

---

### `packages/api/src/__tests__/logger.test.ts` (modify — add SEC-07 redact assertions)

**Self-analog:** lines 17-26 (test logger setup) + lines 47-87 (Authorization redaction test)

**Test logger setup pattern** (lines 8-29):
```typescript
function createTestLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const logger = pino({ level: 'info', redact: { paths: [...], censor: '[REDACTED]' } }, stream);
  return { logger, lines, stream };
}
```

**Header-redaction assertion shape** (lines 70-87):
```typescript
const allOutput = lines.join('');
expect(allOutput).not.toContain('secret-token-value');
const requestLog = lines.find((l) => { try { return JSON.parse(l).req?.headers?.authorization !== undefined; } catch { return false; } });
if (requestLog) {
  expect(JSON.parse(requestLog).req.headers.authorization).toBe('[REDACTED]');
}
```

**Copy:** the `Writable` stream → array harness; `lines.join('')` + `.not.toContain('plain-secret')` invariant; `JSON.parse(l).req.body.openai_api_key === '[REDACTED]'` for the new SEC-07 cases. Update the inline `redact.paths` in `createTestLogger()` to match the production `DEFAULT_REDACT` after extension. Add three new `it(...)` blocks: `req.body.openai_api_key`, `req.body.openaiApiKey`, and a wildcard nested-object case.

---

### `packages/api/src/__tests__/sec-07-job-schema.test.ts` (new contract test)

**Analog:** `packages/shared/src/__tests__/posts-discriminated-union.test.ts` (Zod reflection test style — closest available; no prior schema-shape contract test exists)

**Implementation guide:** RESEARCH §Pattern 5 lines 366-393 provides the complete file body. Key requirements:
- Import every BullMQ job-data Zod schema (today: `bulkJobPayloadSchema` from `bulk-jobs.ts`, `csvImportScheduledJobDataSchema` + `csvImportQueueJobDataSchema` from `bulk-import.ts`, schemas from `bulk-notifications.ts`).
- `it.each(allSchemas)` runs the same field-name regex check per schema.
- `FORBIDDEN_KEY_RE = /openai|api[_-]?key/i` enumerated against `(schema as any)._def.shape?.()`.

**Watch-out (RESEARCH Assumption A4):** `_def.shape()` only works on `ZodObject`. For schemas wrapped in `.refine()` / `ZodEffects`, the test must drill into `_def.schema._def.shape()` first. Add a small helper `getShape(schema)` that handles both wrappings.

---

### `packages/worker/src/bulk/csv-import-scheduled.handler.ts` (modify — wire snippet substitution)

**Self-analog:** full file (46 lines).

**Current insert path** (lines 26-38):
```typescript
await ctx.db.transaction(async (tx) => {
  await tx.insert(posts).values(rows.map((row) => ({
    userId: job.data.userId,
    profileId,
    platform: profile.platform,
    text: String(row.text),
    status: 'scheduled' as const,
    scheduledAt: new Date(String(row.scheduled_at)),
    hasSpinnableText: row.spinnable === true,
    autoDestructAfter: typeof row.auto_destruct_after === 'string' ? row.auto_destruct_after : null,
    notes: typeof row.notes === 'string' ? row.notes : null,
  })));
});
```

**Copy:** the `ctx.db.transaction` wrapper (CLAUDE.md §Validation: multi-step DB mutations → transactions); `as const` literal on `status`; `String(...)` defensive coercion; the existing `errors` accumulator pattern (line 14, 42).

**Divergence (SNIP-03):** before the `tx.insert`, load all snippets for `job.data.userId` into a `Map<lowercaseName, body>` once; iterate `rows`, call `substituteSnippetsInText(row.text, (name) => map.get(name))`; for any row with `missing.length > 0`, push `{ rowNumber, message: \`Unknown snippet "\${name}"\` }` into `errors` and exclude that row from the insert batch. Stored `posts.text` then never contains `{{` or `}}` (RESEARCH §Key Invariants SNIP-03).

---

### `packages/web/src/hooks/use-snippets.ts` (TanStack Query hook)

**Analog:** `packages/web/src/hooks/use-posts.ts` (full file, 139 lines)

**Query hook pattern** (lines 64-81):
```typescript
export function usePosts(filters: PostFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  …
  const queryString = params.toString();
  return useQuery({
    queryKey: ['posts', filters],
    queryFn: () => apiClient.get<PostsResponse>(`/api/posts${queryString ? `?${queryString}` : ''}`),
    staleTime: 15_000,
    refetchInterval: 10_000,
  });
}
```

**Mutation hook pattern** (lines 92-101):
```typescript
export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postInput: CreatePostInput) => apiClient.post<Post>('/api/posts', postInput),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}
```

**Copy verbatim:** the `useQuery({ queryKey: ['snippets', filters], queryFn: ..., staleTime: 15_000 })` shape; `useMutation` + `onSuccess` invalidation; types imported from `@sms/shared`. **Do not** copy `refetchInterval` for snippets — list polling is unnecessary (snippets change only on user action).

---

### `packages/web/src/hooks/use-calendar-posts.ts` (TanStack Query hook)

**Analog:** same as above (`use-posts.ts`).

**Copy:** identical query-hook pattern. Query key: `['calendar', { from, to, ...filters }]`. The hook accepts `from`/`to` as ISO strings and serializes them into the URL — the API consumes `calendarQuerySchema`. Disable polling (`refetchInterval` omitted); `staleTime` 30 seconds is reasonable for a calendar.

---

### `packages/web/src/components/snippets/SnippetPicker.tsx` (React feature, event-driven)

**Analog:** `packages/web/src/components/posts/TagSelector.tsx` (multi-select pattern with manage link) + shadcn `<Command>` primitive (already installed per UI-SPEC).

**Reference for cursor-position handling:** RESEARCH §Pitfall 4 lines 442-446. Critical pattern: capture `selectionStart`/`selectionEnd` in `onPointerDown` BEFORE the popover steals focus. Store in a ref; consume on insert.

**Mount point:** `packages/web/src/components/posts/SharedPostFields.tsx` — D-01 places the trigger button next to the post text textarea. The textarea itself is owned by the per-platform fields component (Twitter/LinkedIn/Facebook); pass a `textareaRef` and `onInsert(body)` callback up from those components into `SharedPostFields`, so the picker has a stable ref to manipulate.

**Composition guide (UI-SPEC §Component Inventory rows 1-3):** `<Popover>` + `<Command>` + `<CommandInput>` + `<CommandList>` + `<CommandEmpty>` + `<CommandGroup>` + `<CommandItem>` + footer `<Link to="/settings/snippets">`. Width 320px (`w-80`), `sideOffset={8}`. Keyboard: Arrow / Enter / Escape per UI-SPEC §Interaction.

---

### `packages/web/src/components/snippets/SnippetFormDialog.tsx` (React dialog)

**Analog:** `packages/web/src/components/profiles/EditProfileDialog.tsx` (RHF + Zod resolver + shadcn Dialog pattern; test analog at `__tests__/EditProfileDialog.test.tsx` lines 1-60)

**Test render harness pattern** (`EditProfileDialog.test.tsx` lines 33-52):
```typescript
function renderDialog(profile: SocialProfile = buildProfile()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  queryClient.setQueryData(['profiles'], [profile]);
  const onOpenChange = vi.fn();
  return {
    onOpenChange,
    ...render(
      <QueryClientProvider client={queryClient}>
        <EditProfileDialog profileId={PROFILE_ID} open onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    ),
  };
}
```

**Copy verbatim:** the `QueryClient` per-test factory with `retry: false, staleTime: 0`; `queryClient.setQueryData(...)` to seed without HTTP; `<QueryClientProvider>` wrap; `vi.fn()` for the `onOpenChange` callback.

---

### `packages/web/src/pages/settings/SnippetsPage.tsx` (React page)

**Analog:** `packages/web/src/pages/settings/EmailLogsPage.tsx` (page shell pattern lines 67-80) + `packages/web/src/pages/posts/PostsPage.tsx` (table + empty-state — lines 498-520)

**Empty-state pattern** (`PostsPage.tsx` lines 498-520):
```typescript
{postsResponse?.posts.length === 0 ? (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    {hasActiveFilters ? (
      <>
        <h2 className="text-lg font-medium mb-1">No matching posts</h2>
        <p className="text-sm text-muted-foreground">Try adjusting your filters or search query.</p>
      </>
    ) : (
      <>
        <h2 className="text-lg font-medium mb-1">No posts yet</h2>
        <p className="text-sm text-muted-foreground mb-4">Create your first tweet to get started…</p>
        <Button asChild>
          <Link to="/posts/new"><Plus className="mr-2 h-4 w-4" />Create Post</Link>
        </Button>
      </>
    )}
  </div>
) : (…)}
```

**Copy verbatim** (UI-SPEC §Component Inventory + §Copywriting): the `flex flex-col items-center justify-center py-12 text-center` block with `text-lg font-medium mb-1` heading and `text-sm text-muted-foreground` body; the dual-state `hasActiveFilters` branch. Replace copy per UI-SPEC §Copywriting Contract (lines 188-191, 193-194 of UI-SPEC).

**Page shell:** wrap in `<main>` per `packages/web/CLAUDE.md` accessibility rule. Route mounts at `/settings/snippets` (UI-SPEC §Component Inventory row 4).

---

### `packages/web/src/pages/calendar/CalendarPage.tsx` (React page, event-driven)

**Analog:** `packages/web/src/pages/posts/PostsPage.tsx` for the filter bar + URL state (lines 124-167); RESEARCH §Pattern 4 lines 311-336 for the `<Calendar>` integration.

**Search input + URL debounce pattern** (`PostsPage.tsx` lines 124, 162-167, 466-475):
```typescript
const [searchInput, setSearchInput] = useState('');

useEffect(() => {
  const timer = setTimeout(() => {
    setFilters(prev => ({ ...prev, search: searchInput || undefined, page: 1 }));
  }, 300);
  return () => clearTimeout(timer);
}, [searchInput]);

…

<div className="relative flex-1 min-w-[200px]">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
  <Input
    placeholder="Search posts..."
    value={searchInput}
    onChange={(e) => setSearchInput(e.target.value)}
    className="pl-9"
    aria-label="Search posts"
  />
</div>
```

**Copy verbatim across all three views (PostsPage, QueuePostsPage modify, CalendarPage)** per UI-SPEC line 51 ("1:1 visual parity required"). Adjust debounce to 250ms per CONTEXT Claude's-Discretion (PostsPage currently 300ms — leave that alone OR align all three to 250ms; planner picks).

**rbc integration (RESEARCH §Pattern 4 lines 311-336):** copy the `<Calendar>` props verbatim including `localizer={calendarLocalizer}`, `views={['month', 'week', 'day']}`, `components={{ toolbar: CalendarToolbar }}`, `eventPropGetter`, `onRangeChange`, `onSelectEvent`, `onSelectSlot`, `selectable`. The `eventPropGetter` returns the per-platform border + tint classes per UI-SPEC §Color "Platform-brand colors" lines 116-122.

**Net-new (no analog):** this is the first page to import react-big-calendar CSS. Per RESEARCH Pitfall 3, import `react-big-calendar/lib/css/react-big-calendar.css` only inside this module — not in `index.css` or `App.tsx`.

---

### `packages/web/src/components/posts/SharedPostFields.tsx` (modify)

**Self-analog:** full file (160 lines).

**Mount point** (lines 93-94, top of returned JSX):
```typescript
return (
  <div className="space-y-6">
    {/* POST-CMN-01 + POST-CMN-02: schedule datetime + timezone (hidden in queue mode) */}
    {mode !== 'queue' && (
      <div className="space-y-2">
        <Label htmlFor="schedule-datetime">Schedule</Label>
        ...
```

**Insertion pattern (D-01):** add an `<Insert snippet>` button + `<SnippetPicker>` popover at the top of the `<div className="space-y-6">`, ABOVE the schedule block. Wire via new props `textareaRef: RefObject<HTMLTextAreaElement>` and `onInsertSnippet?: (body: string) => void`. The per-platform fields (`TwitterPostFields`, `LinkedInPostFields`, `FacebookPostFields`) already own their textareas; pass the ref upward.

**Copy:** the existing `space-y-6` outer `<div>`, the `space-y-2` per-section block, the `<Label htmlFor="…">` + control structure, the `mode !== 'queue'` guard pattern when applicable.

---

### `packages/web/src/components/layout/Sidebar.tsx` (modify)

**Self-analog:** `navItems` array lines 22-31:
```typescript
const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/posts', icon: FileText, label: 'Posts' },
  { to: '/queues', icon: ListOrdered, label: 'Queues' },
  { to: '/posts/new', icon: PenSquare, label: 'New Post', isAction: true },
  …
] as const;
```

**Insertion pattern (D-10):** insert `{ to: '/calendar', icon: Calendar, label: 'Calendar' }` between `Queues` and `New Post`. Add `Calendar` to the `lucide-react` import block at top of file. The `as const` tail is required — keep it.

---

### `packages/web/src/lib/headline-to-mark.ts` (Pure util)

**Analog:** `packages/shared/src/lib/spinnable-text.ts` (regex-driven parser, ~50 lines).

**Implementation guide:** RESEARCH §Pattern 2 lines 256-273 supplies the complete function body — `headline.split(/(<b>|<\/b>)/g)`, walk parts, decode the five HTML entities `ts_headline` emits, push `<mark>` or string to output array. Returns `React.ReactNode[]`. Pure function, unit-testable, no `dangerouslySetInnerHTML`.

---

### `packages/web/src/lib/calendar-localizer.ts` (Adapter)

**Analog:** `packages/web/src/lib/timezone.ts` (small adapter helper module pattern).

**Implementation:** RESEARCH §Pattern 4 lines 304-308 — three-line module that exports `calendarLocalizer = luxonLocalizer(DateTime)`. Luxon already a dep (`packages/web/package.json`); rbc must already be installed (Wave 0 dep add).

---

## Shared Patterns

### Authentication (applies to all new API routes)
**Source:** `packages/api/src/middleware/auth-guard.ts` → `requireAuth` (existing)
**Apply to:** `routes/snippets.ts`, `routes/calendar.ts` (every `router.METHOD(...)` call)
```typescript
router.post('/api/snippets', requireAuth, async (req, res) => { /* req.session.userId! */ });
```

### Validation (applies to every body / query / param parse)
**Source:** `packages/api/src/routes/tags.ts` lines 23-28
**Apply to:** every snippet + calendar route handler. Pattern is `safeParse` → 400 with `details: parsed.error.issues`. UUID path params: `validateUuidParam(req.params.id as string)` (`packages/api/src/middleware/validation.ts` lines 13-18).
```typescript
const parsed = createSnippetSchema.safeParse(req.body);
if (!parsed.success) {
  res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
  return;
}
```

### Service-error mapping (applies to all new services and handlers)
**Source:** `packages/api/src/services/tag.service.ts` lines 11-16, 38-44 + routes/tags.ts lines 32-38
**Apply to:** `SnippetServiceError` + handler-side `instanceof X.ServiceError ? res.status(err.statusCode).json({ error: err.message }) : throw err`. CLAUDE.md §Error Handling: "wrap low-level errors with application context before rethrowing."

### Logging (applies to all services)
**Source:** `packages/shared/src/logger.ts` `createLogger` factory + `tag.service.ts` line 7 `const logger = createLogger('tag-service');`
**Apply to:** every new service module. CLAUDE.md §Module Structure: "Services expose factory functions; no top-level side effects" — note the logger is a factory output, not a module side-effect.

### Drizzle migration generator (applies to schema changes)
**Source:** `packages/db/CLAUDE.md` "drizzle-kit generate + migrate() for production. push only during prototyping."
**Apply to:** `0009_*.sql` migration. Run `drizzle-kit generate` for the snippets table; APPEND the hand-written tsvector + trigger SQL afterward (it cannot be inferred from schema). Use `--> statement-breakpoint` between every DDL statement.

### Factory pattern (applies to all new modules)
**Source:** `packages/api/src/app.ts` lines 51-123 + every existing route factory
**Apply to:** every new service / route / worker module. Match the `createXRouter({ db, …deps })` signature; no top-level side effects; env vars read inside functions per `CLAUDE.md` §Conventions.

### Test render harness (applies to all React component tests)
**Source:** `packages/web/src/components/profiles/__tests__/EditProfileDialog.test.tsx` lines 33-52
**Apply to:** SnippetPicker test, SnippetFormDialog test, CalendarPage test. Per-test `QueryClient` with `retry: false, staleTime: 0`; `queryClient.setQueryData(...)` to seed without HTTP; `vi.fn()` for callback props.

### Integration test mocking (applies to all `__tests__/integration/*-api.test.ts`)
**Source:** `packages/api/src/__tests__/integration/posts-api.test.ts` lines 1-30
```typescript
vi.mock('../../services/post.service.js', async () => {
  const { PostServiceError } = await vi.importActual<typeof import('../../services/post.service.js')>('../../services/post.service.js');
  return { /* mock factories */ };
});
```
**Apply to:** `integration/snippets-api.test.ts`, `integration/calendar-api.test.ts`. Note: SEARCH-02 wants a REAL Postgres test (RESEARCH line 643) for the GIN/EXPLAIN check — that's a different file (`integration/posts-search.test.ts`) that does NOT mock the service.

---

## Net-New Patterns (no codebase analog)

| File | Why net-new | Reference |
|------|-------------|-----------|
| `packages/db/drizzle/0009_*.sql` (tsvector portion) | Codebase has no prior generated `tsvector` column, plpgsql trigger function, or GIN index. First of its kind. | RESEARCH §Pattern 1 (cited to Postgres 17 docs §12.4.3) |
| `packages/web/src/pages/calendar/CalendarPage.tsx` (rbc portion) | `react-big-calendar` is a brand-new dep — no calendar code exists today. Must scope rbc CSS to this route only (RESEARCH Pitfall 3). | RESEARCH §Pattern 4 + react-big-calendar README |
| Tag-rename → `tag_search_vector` refresh | Documented gap in RESEARCH Pitfall 2 + Open Q1; Phase 11 ships the gap (SPEC §Boundaries excludes tag CRUD changes). | n/a |

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `SECURITY.md` (root) | Documentation | — | Repo has no security policy doc today. Standard GitHub-recognized location is repo root (RESEARCH Open Q3 recommendation). |

---

## Metadata

**Analog search scope:**
- `packages/db/src/schema/`, `packages/db/drizzle/`
- `packages/shared/src/schemas/`, `packages/shared/src/lib/`
- `packages/api/src/routes/`, `packages/api/src/services/`, `packages/api/src/__tests__/{,integration/,helpers/}`, `packages/api/src/middleware/`, `packages/api/src/app.ts`
- `packages/worker/src/bulk/`
- `packages/web/src/{pages,components,hooks,lib}/`, `packages/web/src/components/{layout,posts,profiles,bulk}/`
- Project conventions: `CLAUDE.md` (root, db/, api/, shared/, worker/, web/)

**Files scanned:** ~85 (Read), 12 directories listed (Bash/ls), 6 ripgrep searches.
**Pattern extraction date:** 2026-05-01

---

## PATTERN MAPPING COMPLETE
