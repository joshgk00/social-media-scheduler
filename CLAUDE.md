<!-- GSD:project-start source:PROJECT.md -->
## Project

**Social Media Scheduler**

A self-hosted social media scheduling tool for personal business use, running as a Docker Compose stack on Proxmox. It enables composing, scheduling, queuing, and publishing posts to Twitter/X, LinkedIn, and Facebook — without relying on third-party services or recurring subscription costs. Built as a SocialOomph replacement with full ownership of credentials and data.

**Core Value:** Own the stack, own the data, own the credentials — persistent queue automation that publishes without hand-holding, backed by your own Twitter Developer App, on hardware you control.

### Constraints

- **Tech Stack**: Node.js + Express (API), Vite + React (frontend), PostgreSQL (primary DB), Redis + BullMQ (job queue), nginx (reverse proxy) — matches PRD specification
- **Infrastructure**: Docker Compose on Proxmox; no Kubernetes, no cloud-managed services
- **Twitter API**: User must supply their own Developer App credentials (OAuth 1.1). Free tier write limit is 500 tweets/month
- **Credentials**: OAuth tokens must be encrypted at rest (AES-256-GCM); encryption key is env-var only, never in DB or source control
- **Video transcoding**: ffmpeg included in Docker image; transcoding is async with 5-minute timeout; posts with pending media cannot publish
- **Media storage**: Local filesystem via Docker volume as default; S3-compatible optional via env var
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js | 22 LTS (Jod) | Runtime | Active LTS until April 2027. Express 5 requires Node 18+; Node 22 avoids another upgrade cycle. Node 20 EOL is April 2026 -- too close for a new project. |
| Express | 5.2.x | HTTP server / API | Stable since March 2025. Native async error handling (rejected promises auto-forward to error middleware), no more try/catch boilerplate. Express 4 is maintenance-only. |
| Vite | 8.x | Frontend build | Current stable. Uses Rolldown internally for faster builds. Requires Node 20.19+ or 22.12+. `npm create vite@latest -- --template react-ts` scaffolds the project. |
| React | 19.x | UI framework | Current stable. Pairs with Vite 8 via `@vitejs/plugin-react` v6 (uses Oxc for React Refresh, Babel no longer required). |
| PostgreSQL | 17 | Primary database | Proven stable. Postgres 18 released Sept 2025 but 17 has wider ecosystem testing and runs until Nov 2029. Use `postgres:17-alpine` Docker image for smaller footprint. |
| Redis | 7.4-alpine | Queue broker / sessions | BullMQ requires Redis >= 6.2. Redis 7.4 is mature and well-tested. Redis 8 exists but is brand new (2026) with licensing changes -- stick with 7.x for stability. Use `redis:7.4-alpine`. |
| BullMQ | 5.73.x | Job queue / scheduler | The PRD's choice is correct. Built-in stalled job detection, dead letter queues, cron scheduling with timezone support, retry with backoff -- all requirements from the PRD are natively supported. Actively maintained with frequent releases. |
| nginx | 1.27-alpine | Reverse proxy / TLS | Standard Docker reverse proxy. Handles TLS termination for OAuth callbacks. Use `nginx:1.27-alpine`. |
| Docker Compose | v2 | Orchestration | PRD specifies Docker Compose on Proxmox. No Kubernetes needed for a single-user app. |
### ORM / Database Access
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Drizzle ORM | 0.45.x | Database ORM | Use Drizzle over Prisma. Rationale: zero binary dependencies (Prisma ships a ~1.6MB query engine binary), SQL-like API gives direct control over complex queries (tsvector, GIN indexes, advisory locks), instant type updates without a generate step, tiny runtime (~7KB). Single-developer project -- Drizzle's SQL-proximity is a strength, not a team-friction risk. |
| drizzle-kit | 0.30.x | Schema migrations | Supports `generate` (SQL migration files) and `push` (direct schema sync). Use `generate` + `migrate` for production (versioned, idempotent migrations per PRD requirement). Use `push` only during rapid prototyping. |
| postgres (pg driver) | 3.4.x | PostgreSQL client | `drizzle-orm/postgres-js` adapter. The `postgres` package (not `pg`) is the modern PostgreSQL driver -- zero dependencies, TypeScript native, pipeline support. |
### Social Platform SDKs
| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| twitter-api-v2 | 1.29.x | Twitter/X API client | Official X Developer Platform listing. Zero dependencies, 23KB, full TypeScript types. Supports OAuth 1.0a (required per PRD), v1.1 and v2 endpoints, chunked media uploads, and tweet thread posting. Last updated Jan 2026. |
| facebook-nodejs-business-sdk | 24.0.x | Facebook Graph API | Meta's official SDK. Supports Page posting, media uploads, token exchange (short-lived to long-lived). Includes PagePost class. Install `@types/facebook-nodejs-business-sdk` for TypeScript. |
| Direct HTTP (axios/fetch) | - | LinkedIn API | No maintained official LinkedIn Node.js SDK exists. Use direct HTTP calls to LinkedIn's REST API (`/rest/posts` endpoint). Requires headers: `Authorization`, `LinkedIn-Version` (YYYYMM format), `X-Restli-Protocol-Version: 2.0.0`. The Posts API replaces the legacy ugcPosts API. This is the standard approach for LinkedIn integration. |
### Authentication & Security
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| argon2 | 0.41.x | Password hashing | Winner of Password Hashing Competition. Use `argon2id` variant. Better GPU/ASIC resistance than bcrypt. New project -- no legacy bcrypt to maintain. |
| express-session | 1.18.x | Session management | HTTP-only Secure cookies per PRD. Sliding window expiry. |
| connect-redis | 9.0.x | Session store | Stores sessions in Redis. Types included. Respects cookie `expires` for TTL. |
| helmet | 8.x | Security headers | CSP, HSTS, X-Content-Type-Options per PRD. Does NOT handle CSRF -- need separate library. |
| csrf-csrf | 3.x | CSRF protection | Double Submit Cookie pattern. Replacement for deprecated `csurf`. Actively maintained. |
| otpauth | 9.5.x | TOTP 2FA | Modern, maintained TOTP library. Supports Google Authenticator otpauth:// URIs. Speakeasy is unmaintained -- do not use. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| twitter-text | 3.1.x | Tweet character counting | PRD requires accurate Twitter character counting (weighted length, t.co URL handling, emoji counting). This is Twitter's official reference implementation. |
| ioredis | 5.10.x | Redis client | BullMQ's recommended Redis client. TypeScript native, supports Cluster/Sentinel. Use alongside BullMQ (BullMQ internally uses ioredis). |
| nodemailer | 8.0.x | SMTP email | Zero runtime dependencies. Supports SMTP transport, DKIM signing. Ethereal.email for dev testing. Handles all notification emails per PRD. |
| sharp | 0.34.x | Image processing | Thumbnail generation (300px wide per PRD), format validation, resize before upload. Uses libvips -- fastest Node.js image processor. |
| multer | 2.x | File upload handling | Express middleware for multipart/form-data. Disk and memory storage. Built on busboy (streaming, memory-efficient for large video files up to 100MB per PRD). |
| zod | 3.24.x | Request validation | Runtime schema validation for API endpoints. Define schemas once, infer TypeScript types. Use as Express middleware with a thin custom wrapper (no need for express-zod-api -- it's opinionated and heavyweight for an Express 5 project). |
| luxon | 3.5.x | Date/timezone handling | Built-in IANA timezone support -- critical for PRD requirement of DST-safe scheduling. `DateTime.fromISO(iso, { zone: 'America/New_York' })` handles DST transitions correctly. date-fns requires a separate `date-fns-tz` package and is weaker for timezone manipulation. |
| pino | 9.x | Structured logging | 5x faster than Winston. JSON output by default. Supports correlation IDs via child loggers (`logger.child({ correlationId })`). Pair with `pino-http` for Express request logging. |
| pino-http | 10.x | HTTP request logging | Express middleware that auto-logs requests with status, duration, correlation ID. Integrates with pino. |
| uuid | 11.x | Correlation IDs | Generate UUIDs for request correlation IDs per PRD structured logging requirement. |
| csv-parse / csv-stringify | 5.x | CSV import/export | Part of the `csv` package family. Streaming parser handles large CSV files without memory pressure. PRD requires CSV bulk upload/download. |
| @bull-board/express | 6.20.x | Queue dashboard | Visual admin panel for BullMQ queues. Mount at `/admin/queues` behind auth. See job states, retry failed jobs, inspect dead letter queue. Essential for debugging the scheduling engine. |
### Frontend Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React Router | 7.14.x | Client-side routing | Stable, production-ready. Supports data loaders, nested layouts, Suspense boundaries. Non-breaking upgrade path from v6. No need for TanStack Router -- React Router v7 covers all needs for this SPA. |
| TanStack Query | 5.x | Server state / data fetching | Automatic caching, background refetching, optimistic updates. Handles all API data fetching. Eliminates manual loading/error state management. |
| Zustand | 5.x | Client state management | Lightweight (~1KB). Handles UI state (sidebar open, selected filters, theme). TanStack Query handles server state -- Zustand only for truly client-local state. |
| React Hook Form | 7.x | Form handling | Post creation forms are complex (many fields, conditional rendering, real-time validation). RHF provides uncontrolled component performance with `register`, validation via Zod resolver. |
| @hookform/resolvers | 5.x | Zod + RHF bridge | Connects Zod schemas to React Hook Form for consistent validation between frontend and API. |
| date-fns | 4.x | Date formatting (frontend) | Tree-shakable date formatting for the UI. Luxon is used server-side for timezone logic; date-fns is lighter for display-only formatting on the client. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript | 5.7.x | Type safety across frontend and backend | Use strict mode. Shared types between API and client via a `packages/shared` directory in a monorepo structure. |
| Vitest | 3.x | Unit/integration testing | 10-20x faster than Jest. Native Vite integration. Jest-compatible API for easy adoption. Use for both frontend component tests and backend unit tests. |
| @testing-library/react | 16.x | Component testing | User-centric testing (find by role/label, not implementation). Pair with Vitest. |
| supertest | 7.x | API endpoint testing | Test Express routes without starting a server. Assert status codes, response bodies, headers. |
| MSW (Mock Service Worker) | 2.x | API mocking in tests | Mock social platform APIs in tests without hitting real endpoints. Works with both Vitest and browser tests. |
| ESLint | 9.x | Linting | Flat config format. Use `@eslint/js` + `typescript-eslint` + `eslint-plugin-react-hooks`. |
| Prettier | 3.x | Code formatting | Consistent formatting. Integrate with ESLint via `eslint-config-prettier`. |
| tsx | 4.x | TypeScript execution | Run TypeScript files directly during development (scripts, seeds, one-off tasks). Replacement for ts-node with better ESM support. |
## Installation
# Core backend
# Core frontend
# Dev dependencies
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Drizzle ORM | Prisma | If the team is large (5+) and wants schema-first workflow with auto-generated types. Prisma's generate step and binary engine add cold-start latency and deployment complexity that isn't worth it for a single-developer Docker project. |
| Drizzle ORM | Knex.js | If you want a query builder without ORM features. Knex is lighter but lacks Drizzle's type inference from schema definitions. Drizzle gives you query-builder flexibility WITH type safety. |
| Drizzle ORM | TypeORM | Never for new projects. Decorator-based, poor TypeScript inference, known performance issues. Legacy tool. |
| Express 5 | Fastify | If you need maximum HTTP throughput. Fastify is faster but Express 5 has a much larger middleware ecosystem (session, passport strategies, multer, helmet). This project needs that ecosystem. |
| Express 5 | Hono | If deploying to edge/serverless. Not relevant for Docker Compose self-hosted. |
| BullMQ | pg-boss | If you want to eliminate Redis entirely. pg-boss uses PostgreSQL for job queuing. Trade-off: no built-in stalled job detection, weaker retry semantics, and you lose Redis for session storage anyway. BullMQ is purpose-built for this use case. |
| Pino | Winston | If you need complex log routing (multiple transports, custom formats). Winston is more flexible but 5x slower. For structured JSON to stdout in Docker -- pino is the right tool. |
| Luxon | date-fns + date-fns-tz | If minimizing bundle size is critical. date-fns is tree-shakable but timezone handling requires a separate package with a less ergonomic API. For a backend service doing heavy timezone work, Luxon's built-in IANA support is worth the ~70KB. |
| Argon2 | bcrypt | If deploying to environments where native module compilation is difficult. bcrypt is more widely deployed but argon2 has better resistance to modern attacks. Both compile native addons -- argon2 just produces better hashes. |
| React Router v7 | TanStack Router | If you want file-based routing and tighter TanStack Query integration. React Router v7 is simpler and sufficient for this app's routing needs. TanStack Router is overkill here. |
| Zustand | Redux Toolkit | If the app had complex client-side state with many interacting slices. This is a single-user tool -- Zustand's simplicity wins. |
| Direct HTTP for LinkedIn | node-linkedin / node-linkedin-v2 | Never. These packages are abandoned (last update 5-6 years ago). LinkedIn's API evolves frequently. Direct HTTP with the Posts API is the only reliable approach. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| csurf | Deprecated Sept 2022, security vulnerabilities in token validation | csrf-csrf (Double Submit Cookie pattern) |
| speakeasy | Repository marked "NOT MAINTAINED" by its own maintainers | otpauth (actively maintained, modern API) |
| moment.js | Deprecated by its own maintainers, massive bundle size (330KB), mutable API | Luxon (server) + date-fns (client) |
| node-linkedin / node-linkedin-v2 | Abandoned packages (5-6 years stale), use deprecated v2/shares endpoint | Direct HTTP calls to LinkedIn REST API (`/rest/posts`) |
| twitter-api-sdk | Twitter's official SDK but poorly maintained, limited v2 coverage | twitter-api-v2 (community maintained, full v1.1+v2 support) |
| TypeORM | Decorator-heavy, poor type inference, known performance and query issues | Drizzle ORM |
| Prisma | Binary engine adds ~1.6MB, requires generate step, cold-start penalty | Drizzle ORM (for this single-dev Docker project) |
| pg (node-postgres) | Older driver, callback-based legacy API, larger surface area | postgres (porsager/postgres -- modern, zero-dep, TypeScript native, pipeline support) |
| Jest | Slower than Vitest, ESM support still experimental, heavier config | Vitest (native Vite integration, Jest-compatible API) |
| Redis 8.x | Brand new (2026), licensing changes (SSPL), less ecosystem testing | Redis 7.4 (mature, well-tested, BullMQ fully compatible) |
| Next.js | SSR/SSG not needed for self-hosted SPA. Adds complexity (server components, hydration) with zero benefit for this use case | Vite + React (lighter, faster DX) |
| Passport.js | Heavyweight for single-user app. 500+ strategies when you need exactly one (local). Adds session serialization boilerplate | Custom auth middleware with argon2 + express-session (simpler for single-user) |
## Stack Patterns by Use Case
- Use repeatable jobs with cron expressions for queue schedules
- Use `timezone` option on cron jobs for DST-safe scheduling (BullMQ supports IANA timezones natively)
- Use separate queues: `publish`, `media-transcode`, `token-refresh`, `auto-destruct`, `notifications`
- Use `@bull-board/express` mounted behind auth for operational visibility
- Use Node.js built-in `crypto.createCipheriv('aes-256-gcm', key, iv)` -- no external library needed
- Store IV and auth tag alongside ciphertext in the database
- PRD's key rotation via `token_encryption_version` column works naturally with this approach
- Use `multer` with disk storage for uploads
- Use `sharp` for thumbnail generation (resize to 300px width)
- Use `fluent-ffmpeg` (wrapper around system ffmpeg) for video transcoding in BullMQ jobs
- File path pattern: `{storage_root}/media/{profile_id}/{year}/{month}/{uuid}.{ext}`
- Use npm workspaces with three packages: `packages/api`, `packages/web`, `packages/shared`
- `shared` contains Zod schemas, TypeScript types, and constants used by both API and frontend
- This avoids a separate shared package publish step while maintaining clear boundaries
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| BullMQ 5.x | Redis >= 6.2 | Tested with Redis 7.x. Redis 8 should work but is less battle-tested. |
| BullMQ 5.x | ioredis 5.x | BullMQ uses ioredis internally. Must match major version. |
| Drizzle ORM 0.45.x | postgres 3.x | Use `drizzle-orm/postgres-js` adapter. |
| drizzle-kit 0.30.x | drizzle-orm 0.45.x | Kit and ORM versions are released in sync. Keep both updated together. |
| Express 5.2.x | Node.js >= 18 | Express 5 dropped Node < 18. Use Node 22 LTS. |
| Vite 8.x | Node.js >= 20.19 or >= 22.12 | Vite 8 bumped minimum Node version. Node 22 LTS satisfies this. |
| @vitejs/plugin-react 6.x | Vite 8.x | Plugin v6 requires Vite 8. Uses Oxc instead of Babel. |
| React Router 7.14.x | React 18.x or 19.x | Supports both. Use React 19 for new project. |
| TanStack Query 5.x | React 18.x or 19.x | Supports both. |
| sharp 0.34.x | Node.js >= 18.17 | Includes pre-built libvips binaries for most platforms. May need manual install in Alpine Docker. |
| argon2 0.41.x | Node.js >= 16 | Compiles native addon. Include build tools in Docker image or use multi-stage build. |
| connect-redis 9.x | express-session 1.x | Types included in connect-redis 9. No separate @types package needed. |
## Docker Image Strategy
# Build stage
# Production stage
- Multi-stage build keeps production image small
- `ffmpeg` installed in production image for video transcoding (PRD requirement)
- Alpine base for minimal image size
- Native addons (argon2, sharp) need build tools in builder stage only
- `sharp` in Alpine requires `--platform` flag or pre-built binaries check
## Sources
- [Express 5.1.0 stable release announcement](https://expressjs.com/2025/03/31/v5-1-latest-release.html) -- confirmed Express 5 is production-ready (HIGH confidence)
- [BullMQ Redis Compatibility docs](https://docs.bullmq.io/guide/redis-tm-compatibility) -- Redis >= 6.2 required (HIGH confidence)
- [BullMQ npm](https://www.npmjs.com/package/bullmq) -- v5.73.0 latest (HIGH confidence)
- [Drizzle ORM npm](https://www.npmjs.com/package/drizzle-orm) -- v0.45.2 latest, v1.0 beta in progress (HIGH confidence)
- [Drizzle vs Prisma comparison (Bytebase, 2026)](https://www.bytebase.com/blog/drizzle-vs-prisma/) -- Drizzle wins for single-dev, Docker, SQL-proximity (MEDIUM confidence)
- [twitter-api-v2 npm](https://www.npmjs.com/package/twitter-api-v2) -- v1.29.0, listed on X Developer Platform (HIGH confidence)
- [facebook-nodejs-business-sdk npm](https://www.npmjs.com/package/facebook-nodejs-business-sdk) -- v24.0.1, Meta's official SDK (HIGH confidence)
- [LinkedIn Posts API docs (Microsoft Learn)](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api) -- REST API, no official Node SDK (HIGH confidence)
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases) -- Node 22 LTS until April 2027 (HIGH confidence)
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8) -- Requires Node >= 20.19 or 22.12 (HIGH confidence)
- [Vitest vs Jest comparison (PkgPulse, 2026)](https://www.pkgpulse.com/blog/node-test-vs-vitest-vs-jest-native-test-runner-2026) -- Vitest recommended for Vite projects (MEDIUM confidence)
- [Pino logger guide (SigNoz, 2026)](https://signoz.io/guides/pino-logger/) -- 5x faster than Winston (MEDIUM confidence)
- [nodemailer npm](https://www.npmjs.com/package/nodemailer) -- v8.0.4 latest (HIGH confidence)
- [sharp npm](https://www.npmjs.com/package/sharp) -- v0.34.5 latest (HIGH confidence)
- [csrf-csrf npm](https://www.npmjs.com/package/csrf-csrf) -- csurf replacement (MEDIUM confidence)
- [otpauth npm](https://www.npmjs.com/package/otpauth) -- v9.5.0, modern TOTP (HIGH confidence)
- [Argon2 password hashing guide (2025)](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/) -- Argon2id recommended for new projects (HIGH confidence)
- [React Router changelog](https://reactrouter.com/changelog) -- v7.14.0 with Vite 8 support (HIGH confidence)
- [TanStack Query docs](https://tanstack.com/query/latest) -- v5.x stable (HIGH confidence)
- [@bull-board/express npm](https://www.npmjs.com/package/@bull-board/ui) -- v6.20.6 latest (HIGH confidence)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

### Module Structure

- Services expose factory functions (`createApp`, `createWorker`) — no top-level side effects
- Dependencies injected via factory params, not imported globals
- Env vars read inside functions at runtime, never at module scope
- Paths resolve relative to module via `import.meta.url` + `dirname()`, never `process.cwd()`

### Error Handling

- Every async op needs explicit error handling — no fire-and-forget promises
- Unawaited promises: `.catch()` with logging
- Shutdown: individual try-catch per resource; one failure must not skip the rest
- Resource cleanup in `finally` blocks, not sequential `await`
- No empty catch blocks — at minimum log the error
- Wrap low-level errors (crypto, drivers) with application context before rethrowing

### Naming

- Booleans: `is`/`are`/`has`/`should` prefix — `isPasswordValid` not `valid`
- No generic names (`data`, `result`, `count`) — use domain terms: `userInput`, `sessionCount`
- No ad-hoc abbreviations (`qc`, `sq`) — spell out. Standard abbrevs (`id`, `url`, `db`) OK
- Single-letter vars only in trivial arrows (`x => x.id`) — never for time, counts, domain values
- Translate library jargon to domain terms: `validationOffset` not `delta`
- Names reflect domain semantics, not implementation: `resetToEmailStep` not `resetToStep1`
- Collapse single-use intermediates when inline expression is clear
- Descriptive loop indices when multiple are in scope

### Validation

- Enum-like Zod strings (dateFormat, timezone) → `z.enum()` or validate against allowlist
- Remove schema fields no handler reads — schemas document actual contract
- Multi-step DB mutations (delete + re-insert) → `db.transaction()`

### Type Safety

- Import actual types from libraries — never `any` for external deps
- All function params and returns explicitly typed
- No `any`/`unknown` in interfaces without narrowing

### Testing

- Security-critical code (middleware, auth, encryption): 100% branch coverage
- Test both success AND failure paths for middleware and async ops
- No conditional assertions (`if (x) expect(...)`) — assert precondition first
- Shared test setup → `__tests__/helpers/`
- `vi.useFakeTimers()` for interval/timeout code

### Dependencies

- Production deps: tilde `~` (patch-only). Dev deps: tilde preferred, caret OK
- CLAUDE.md version specs must match installed versions
- Shared patterns across packages → extract to `@sms/shared`

### Docker & Infrastructure

- Containers: non-root user via `USER` directive
- Dev ports: `127.0.0.1` only, never `0.0.0.0`
- All services (Redis, PostgreSQL) require authentication
- Separate prod/dev config files, not conditionals
- Production nginx: gzip + static asset cache headers
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| ui-ux-pro-max | "UI/UX design intelligence. 67 styles, 96 palettes, 57 font pairings, 25 charts, 13 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, mobile app, .html, .tsx, .vue, .svelte. Elements: button, modal, navbar, sidebar, card, table, form, chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, flat design. Topics: color palette, accessibility, animation, layout, typography, font pairing, spacing, hover, shadow, gradient. Integrations: shadcn/ui MCP for component search and examples." | `.claude/skills/ui-ux-pro-max/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
