# Phase 1: Infrastructure & Foundation - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Delivers the complete operational foundation: monorepo scaffold (pnpm workspaces), Docker Compose stack with all five services, PostgreSQL with migration runner, Redis with correct BullMQ configuration, HTTPS termination via Cloudflare Tunnel, encryption module, health endpoint, and structured logging. No application features. No auth. No UI. Every subsequent phase builds on this.

</domain>

<decisions>
## Implementation Decisions

### HTTPS / TLS Strategy
- **D-01:** Use Cloudflare Tunnel for all traffic — app and OAuth callbacks both route through the tunnel. No Let's Encrypt, no certbot, no cert renewal automation.
- **D-02:** nginx is a plain HTTP reverse proxy internally (no TLS termination at the container layer). Cloudflare handles TLS outside the stack.
- **D-03:** OAuth callback URLs are HTTPS because Cloudflare provides the TLS — this satisfies Facebook and LinkedIn's HTTPS callback requirements without any cert infrastructure.

### Docker Compose Structure
- **D-04:** Two compose files: `docker-compose.yml` (production, clean) and `docker-compose.dev.yml` (override with bind mounts, hot reload, debug ports).
- **D-05:** `docker-compose.dev.yml` uses bind mounts for `api/`, `worker/`, and `web/` packages so changes reload without rebuild (nodemon for API/worker, Vite dev server for web).
- **D-06:** Worker runs as a separate `worker` service from day one in both dev and prod. Matches production topology, catches BullMQ/Redis integration issues early.

### Database & Migrations
- **D-07:** Phase 1 defines migration infrastructure only — drizzle-kit setup, migration runner, and a baseline empty migration. No application tables (users, social_profiles, posts, etc.) — those land in the phases that own them.
- **D-08:** Migrations run automatically on container start via the API container entrypoint (`drizzle-kit migrate` before the server starts). No manual migration step required.
- **D-09:** PostgreSQL 17. Drizzle ORM with `drizzle-kit generate` workflow for schema changes.

### Redis Configuration
- **D-10:** Redis 7.4 with `maxmemory-policy noeviction` — required for BullMQ correctness. Persists data across restarts via Docker volume mount.

### Encryption Module
- **D-11:** AES-256-GCM encryption module lives in the `shared` package. Reads `ENCRYPTION_KEY` from env var only. Each encrypted record stores IV and auth tag alongside ciphertext (SEC-02). Includes `token_encryption_version` support for future key rotation without re-auth (SEC-03) — but the SocialProfile table itself comes in Phase 3.
- **D-12:** Encryption module is a pure utility — no DB interaction in Phase 1. Exposed as `encrypt(plaintext, key)` and `decrypt(ciphertext, iv, authTag, key)`.

### First-Run Bootstrap
- **D-13:** No seed data, no bootstrap user. Phase 1 delivers working infrastructure only. Phase 2 owns the users table and the login flow. Phase 1 can be validated end-to-end via the `/health` endpoint alone.

### Monorepo Structure
- **D-14:** pnpm workspaces with packages: `shared` (encryption, utilities, types), `db` (Drizzle schema, migrations, DB client), `api` (Express server), `worker` (BullMQ workers), `web` (Vite + React frontend). This is fixed by INFRA-01.

### Logging & Security Headers
- **D-15:** Structured JSON logging via `pino` (fast, low-overhead, supports correlation IDs natively). Every HTTP request assigned a UUID correlation ID via Express middleware.
- **D-16:** Security headers via `helmet` in Phase 1 — CSP, X-Content-Type-Options, X-Frame-Options, HSTS. Applied at the Express layer.
- **D-17:** CSRF protection via `csrf-csrf` (not deprecated `csurf`). Cookies use `SameSite=Strict`.

### Claude's Discretion
- Port assignments for dev (internal container ports vs exposed host ports) — Claude decides standard conventions (API:3000, web:5173, postgres:5432, redis:6379).
- `pino-pretty` for dev log formatting — production stays raw JSON, dev gets readable output.
- Multi-stage Dockerfile structure — Claude decides layer order to maximize cache hits during development.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §INFRA — INFRA-01 through INFRA-10: full infrastructure requirements
- `.planning/REQUIREMENTS.md` §SEC — SEC-01 through SEC-06: security requirements for Phase 1
- `.planning/ROADMAP.md` §Phase 1 — Success criteria (5 items that must be TRUE for phase completion)

### Project Context
- `.planning/PROJECT.md` §Constraints — Tech stack constraints (Node.js + Express, Vite + React, PostgreSQL, Redis + BullMQ, nginx)
- `.planning/PROJECT.md` §Context — Deployment target (Proxmox, Docker Compose), HTTPS notes, single-user scope

### No external ADRs or specs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — blank slate. No existing code to reuse.

### Established Patterns
- None yet — Phase 1 establishes the patterns all other phases will follow.

### Integration Points
- Phase 2 will add the `users` table and session middleware to the `api` package established here.
- Phase 3 will add `social_profiles` table with `token_encryption_version` column — the encryption module built in Phase 1 must be ready for this.
- All subsequent phases depend on the Docker Compose service names, ports, and environment variable conventions established here.

</code_context>

<specifics>
## Specific Ideas

- Cloudflare Tunnel connector runs as a separate process on the Proxmox host (not as a Docker service) — the tunnel points to nginx's exposed port.
- The health endpoint (`GET /health`) must verify actual connectivity for each dependency: ping Redis, run a simple Postgres query, check worker heartbeat key in Redis. Not a no-op 200.
- Worker heartbeat: worker writes a timestamp key to Redis every 30s; `/health` reads it and flags `worker_alive: false` if stale by >60s (INFRA-07).
- `ffmpeg` included in the production Docker image (multi-stage build per INFRA-10) even though it's not used until Phase 6 — avoids rebuilding a large image later.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-infrastructure-foundation*
*Context gathered: 2026-04-07*
