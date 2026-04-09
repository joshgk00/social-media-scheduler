# Database Package Standards

## Connections

- Explicit `max` pool size — never rely on driver defaults. Migrations: `max: 1`, app: `max: 10`
- Cleanup in `finally` blocks — if `migrate()` throws, client still calls `.end()`

## Migrations

- Paths resolve relative to module via `import.meta.url` + `dirname()`, never `process.cwd()`
- `drizzle/` directory copied into Docker prod image
- Migration failures logged distinctly from other startup errors
- `drizzle-kit generate` + `migrate()` for production. `push` only during prototyping.

## Types & Exports

- Import/export `Sql` type from `postgres` for consumers
- Client exported as `pgClient` or `db`, not `sql`
- Schema files re-export from `src/schema/index.ts`
