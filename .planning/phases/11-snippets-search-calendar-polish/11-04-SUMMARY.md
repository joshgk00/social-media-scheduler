# 11-04 Summary

## Status

Completed.

## Migration

- Brought up the local `postgres` compose service.
- Applied `0009_phase-11-snippets-fts-calendar` through the repo’s hardened migration runner by invoking `runMigrations()` directly with the local dev `DATABASE_URL`.
- Migration result: `{"level":"info","msg":"Migration applied","migration":"0009_phase-11-snippets-fts-calendar","statements":13,"skipped":0}`

## Verification

### `\d snippets`

```text
Table "public.snippets"
id uuid not null default gen_random_uuid()
user_id uuid not null
name character varying(100) not null
category snippet_category not null default 'text'::snippet_category
body text not null
created_at timestamp with time zone not null default now()
updated_at timestamp with time zone not null default now()
Indexes:
  snippets_user_idx
  snippets_user_lower_name_unq UNIQUE (user_id, lower(name::text))
Foreign-key constraints:
  snippets_user_id_users_id_fk ... ON DELETE CASCADE
```

### `\d posts`

```text
search_vector     | tsvector | | | generated always as (to_tsvector('english'::regconfig, (text || ' '::text) || COALESCE(notes, ''::text))) stored
tag_search_vector | tsvector | | |
Indexes:
  posts_fts_idx gin ((search_vector || tag_search_vector))
```

### Trigger

```text
post_tags_after_change | O
```

### EXPLAIN

```text
Bitmap Heap Scan on posts
  Recheck Cond: ((search_vector || tag_search_vector) @@ '''sampl'''::tsquery)
  ->  Bitmap Index Scan on posts_fts_idx
        Index Cond: ((search_vector || tag_search_vector) @@ '''sampl'''::tsquery)
```

### Null checks

```text
search_vector null rows: 0
tag_search_vector null rows: 0
```
