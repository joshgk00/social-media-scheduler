## Phase 11-06 Summary

Completed the PostgreSQL full-text search slice for posts and closed the remaining integration gap.

### Implemented

- Updated `packages/api/src/services/post.service.ts` to:
  - build `plainto_tsquery('english', :search)` predicates against `(search_vector || tag_search_vector)`
  - return `headline` via `ts_headline(...)`
  - return `rank` via `ts_rank(...)`
  - enforce `searchScope='posts'` and `searchScope='queue'`
  - preserve `eq(posts.userId, userId)` as the first filter condition
  - alias `headline` and `rank` so real Postgres can order by/search-select correctly
- Added `packages/api/src/__tests__/integration/posts-search.test.ts` with six real-Postgres cases:
  - ranked headline output
  - GIN index reachability via EXPLAIN JSON parse
  - scope-by-view filtering
  - cross-tenant isolation
  - no-search omission of `headline`/`rank`
  - SQL-injection payload safety

### Additional Hardening

The integration test exposed a real data-shape bug from the earlier migration work: new `posts` rows could still get `tag_search_vector = NULL`, which breaks the FTS concatenation path.

- Updated `packages/db/src/schema/posts.ts` so `tag_search_vector` is `NOT NULL DEFAULT ''::tsvector`
- Updated `packages/db/drizzle/0009_phase-11-snippets-fts-calendar.sql`
- Updated `packages/db/drizzle/meta/0009_snapshot.json`
- Applied the matching `ALTER TABLE` locally to the dev Postgres instance before re-running the integration test

### Verification

- `pnpm --filter @sms/db build`
- `pnpm --filter @sms/api exec tsc --noEmit`
- `pnpm --filter @sms/api exec vitest run src/__tests__/services/post.test.ts`
- `pnpm --filter @sms/api exec vitest run src/__tests__/integration/posts-search.test.ts`

### Notes

- On the small local dataset, the combined `user_id + FTS` EXPLAIN can legitimately prefer the existing `posts_user_status` btree index. The integration test therefore:
  - separately proves tenant isolation through `getPosts(...)`
  - proves `posts_fts_idx` is reachable by EXPLAINing the pure FTS predicate with `enable_seqscan = off`
