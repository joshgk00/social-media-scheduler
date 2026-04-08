# Phase 1: Infrastructure & Foundation - Research

**Researched:** 2026-04-07
**Domain:** Docker Compose infrastructure, pnpm monorepo, PostgreSQL + Redis + BullMQ foundation, Express 5, structured logging, encryption, CSRF/security headers
**Confidence:** HIGH

## Summary

Phase 1 is a greenfield infrastructure build: monorepo scaffold with pnpm workspaces, Docker Compose stack (api, worker, postgres, redis, nginx), Drizzle ORM migration infrastructure, AES-256-GCM encryption module, structured logging with correlation IDs, CSRF protection, security headers, and a health endpoint that verifies all dependencies. No application features, no auth, no UI beyond a dev server stub.

The stack is well-established and all locked decisions from the discussion phase are technically sound. The primary risk is getting the Docker multi-stage build right for native addons (argon2, sharp) on Alpine, and ensuring the pnpm workspace structure plays well with Docker's `pnpm deploy` command for production images. Several package versions in CLAUDE.md have moved forward since the stack research was done -- this document captures the current registry state.

**Primary recommendation:** Follow the locked decisions exactly. Use pnpm workspaces with 5 packages (`shared`, `db`, `api`, `worker`, `web`). Run Drizzle migrations programmatically on API container startup via `drizzle-orm/postgres-js/migrator`. Worker heartbeat is a simple Redis key write every 30 seconds, read by `/health`. Cloudflare Tunnel is external to the Docker stack -- nginx listens on plain HTTP internally.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use Cloudflare Tunnel for all traffic -- app and OAuth callbacks both route through the tunnel. No Let's Encrypt, no certbot, no cert renewal automation.
- **D-02:** nginx is a plain HTTP reverse proxy internally (no TLS termination at the container layer). Cloudflare handles TLS outside the stack.
- **D-03:** OAuth callback URLs are HTTPS because Cloudflare provides the TLS -- this satisfies Facebook and LinkedIn's HTTPS callback requirements without any cert infrastructure.
- **D-04:** Two compose files: `docker-compose.yml` (production, clean) and `docker-compose.dev.yml` (override with bind mounts, hot reload, debug ports).
- **D-05:** `docker-compose.dev.yml` uses bind mounts for `api/`, `worker/`, and `web/` packages so changes reload without rebuild (nodemon for API/worker, Vite dev server for web).
- **D-06:** Worker runs as a separate `worker` service from day one in both dev and prod. Matches production topology, catches BullMQ/Redis integration issues early.
- **D-07:** Phase 1 defines migration infrastructure only -- drizzle-kit setup, migration runner, and a baseline empty migration. No application tables.
- **D-08:** Migrations run automatically on container start via the API container entrypoint (`drizzle-kit migrate` before the server starts). No manual migration step required.
- **D-09:** PostgreSQL 17. Drizzle ORM with `drizzle-kit generate` workflow for schema changes.
- **D-10:** Redis 7.4 with `maxmemory-policy noeviction` -- required for BullMQ correctness. Persists data across restarts via Docker volume mount.
- **D-11:** AES-256-GCM encryption module lives in the `shared` package. Reads `ENCRYPTION_KEY` from env var only. Each encrypted record stores IV and auth tag alongside ciphertext. Includes `token_encryption_version` support.
- **D-12:** Encryption module is a pure utility -- no DB interaction in Phase 1. Exposed as `encrypt(plaintext, key)` and `decrypt(ciphertext, iv, authTag, key)`.
- **D-13:** No seed data, no bootstrap user. Phase 1 delivers working infrastructure only.
- **D-14:** pnpm workspaces with packages: `shared`, `db`, `api`, `worker`, `web`.
- **D-15:** Structured JSON logging via `pino`. Every HTTP request assigned a UUID correlation ID via Express middleware.
- **D-16:** Security headers via `helmet` -- CSP, X-Content-Type-Options, X-Frame-Options, HSTS.
- **D-17:** CSRF protection via `csrf-csrf` (not deprecated `csurf`). Cookies use `SameSite=Strict`.

### Claude's Discretion

- Port assignments for dev (internal container ports vs exposed host ports) -- standard conventions (API:3000, web:5173, postgres:5432, redis:6379).
- `pino-pretty` for dev log formatting -- production stays raw JSON, dev gets readable output.
- Multi-stage Dockerfile structure -- layer order to maximize cache hits during development.

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Monorepo with pnpm workspaces containing `shared`, `db`, `api`, `worker`, `web` packages | pnpm workspace-yaml config pattern, Docker `pnpm deploy` for production images |
| INFRA-02 | Docker Compose stack with `web`, `worker`, `postgres`, `redis`, `nginx` services, all wired and health-checked | Docker Compose v2 service definitions, healthcheck patterns for each service |
| INFRA-03 | nginx configured as reverse proxy with TLS termination (Cloudflare Tunnel) | nginx plain HTTP proxy config (D-02), Cloudflare Tunnel external to stack |
| INFRA-04 | PostgreSQL 17 with Drizzle ORM schema and versioned migrations | Drizzle programmatic migration via `drizzle-orm/postgres-js/migrator`, `drizzle-kit generate` workflow |
| INFRA-05 | Redis 7.4 with `maxmemory-policy noeviction` | Redis command-line config in Docker, AOF persistence, volume mount |
| INFRA-06 | `GET /health` endpoint returns JSON status for Redis, Postgres, worker heartbeat, pending jobs, last publish | Express 5 route, ioredis ping, Drizzle query, Redis key read for heartbeat |
| INFRA-07 | Worker reports heartbeat to Redis every 30s; `/health` flags stale >60s | Simple `setInterval` + `ioredis.set()` with TTL, health endpoint reads key |
| INFRA-08 | Structured JSON logging with `timestamp`, `level`, `message`, `correlation_id`; no sensitive data logged | Pino 10 + pino-http 11 configuration, redaction paths for sensitive fields |
| INFRA-09 | Every HTTP request assigned UUID correlation ID via middleware; ID passed through BullMQ job data | UUID v4 generation middleware, pino-http genReqId, BullMQ job data pattern |
| INFRA-10 | Multi-stage Docker build handles native addon compilation (argon2, sharp) and includes ffmpeg | Alpine multi-stage build, pnpm deploy for production, ffmpeg in final image |
| SEC-01 | OAuth tokens encrypted at rest using AES-256-GCM; key from env var only | Node.js crypto.createCipheriv pattern, ENCRYPTION_KEY env var |
| SEC-02 | Each encrypted record stores IV and authentication tag alongside ciphertext | 12-byte IV via crypto.randomBytes, getAuthTag() stored with ciphertext |
| SEC-03 | `token_encryption_version` support for key rotation | Encryption module accepts version parameter; table column comes in Phase 3 |
| SEC-04 | Decrypted tokens never cached in Redis | Architecture constraint enforced by code pattern -- decrypt in-memory, use, discard |
| SEC-05 | CSRF token validation via csrf-csrf; cookies use `SameSite=Strict` | csrf-csrf v4 doubleCsrf() config with SameSite cookie option |
| SEC-06 | Security headers via helmet: CSP, X-Content-Type-Options, X-Frame-Options, HSTS | helmet v8 middleware with explicit CSP directives |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech Stack**: Node.js + Express (API), Vite + React (frontend), PostgreSQL (primary DB), Redis + BullMQ (job queue), nginx (reverse proxy)
- **Infrastructure**: Docker Compose on Proxmox; no Kubernetes, no cloud-managed services
- **Credentials**: OAuth tokens encrypted at rest (AES-256-GCM); encryption key env-var only
- **Video transcoding**: ffmpeg included in Docker image (even though not used until Phase 6)
- **No co-author references**: Do not reference Claude in commit messages or as co-author
- **File discipline**: Only change files directly in scope for the task
- **No unnecessary dependencies**: State reason before installing any new dependency

## Standard Stack

### Core (Phase 1 Scope)

| Library | Version | Purpose | Verified |
|---------|---------|---------|----------|
| express | 5.2.1 | HTTP server / API | [VERIFIED: npm registry 2026-04-07] |
| drizzle-orm | 0.45.2 | Database ORM | [VERIFIED: npm registry 2026-04-07] |
| drizzle-kit | 0.31.10 | Schema migrations CLI | [VERIFIED: npm registry 2026-04-07] |
| postgres | 3.4.9 | PostgreSQL driver (porsager/postgres) | [VERIFIED: npm registry 2026-04-07] |
| bullmq | 5.73.0 | Job queue / scheduler | [VERIFIED: npm registry 2026-04-07] |
| ioredis | 5.10.1 | Redis client (BullMQ dependency) | [VERIFIED: npm registry 2026-04-07] |
| pino | 10.3.1 | Structured JSON logging | [VERIFIED: npm registry 2026-04-07] |
| pino-http | 11.0.0 | Express HTTP request logging | [VERIFIED: npm registry 2026-04-07] -- requires pino ^10 |
| helmet | 8.1.0 | Security headers middleware | [VERIFIED: npm registry 2026-04-07] |
| csrf-csrf | 4.0.3 | CSRF protection (Double Submit Cookie) | [VERIFIED: npm registry 2026-04-07] |
| zod | 3.25.76 | Request validation / schema definition | [VERIFIED: npm registry 2026-04-07] -- use 3.x for ecosystem compat (see note) |
| uuid | 13.0.0 | Correlation ID generation | [VERIFIED: npm registry 2026-04-07] |
| cookie-parser | latest | Required by csrf-csrf before doubleCsrfProtection middleware | [ASSUMED] |

### Dev Dependencies (Phase 1 Scope)

| Library | Version | Purpose | Verified |
|---------|---------|---------|----------|
| typescript | 5.9.3 | Type safety | [VERIFIED: npm registry 2026-04-07] -- use 5.x not 6.x (see note) |
| vitest | 4.1.3 | Unit/integration testing | [VERIFIED: npm registry 2026-04-07] -- requires Node ^20/^22/>=24 |
| supertest | 7.2.2 | API endpoint testing | [VERIFIED: npm registry 2026-04-07] |
| eslint | 10.2.0 | Linting | [VERIFIED: npm registry 2026-04-07] -- requires Node ^20.19/^22.13/>=24 |
| prettier | 3.8.1 | Code formatting | [VERIFIED: npm registry 2026-04-07] |
| tsx | 4.21.0 | TypeScript execution (dev scripts) | [VERIFIED: npm registry 2026-04-07] |
| pino-pretty | 13.1.3 | Dev-only readable log output | [VERIFIED: npm registry 2026-04-07] |
| @types/express | latest | Express type definitions | [ASSUMED] |
| @types/cookie-parser | latest | cookie-parser type definitions | [ASSUMED] |
| @types/supertest | latest | supertest type definitions | [ASSUMED] |
| nodemon | latest | Dev file watching (API/worker hot reload) | [ASSUMED] |

### Version Notes

**Zod 3.x vs 4.x:** Zod 4.3.6 is the latest stable, but Zod 4 is a major rewrite with breaking API changes. drizzle-zod 0.8.3 supports both `^3.25.0 || ^4.0.0`, and `@hookform/resolvers` (needed in later phases) may not fully support Zod 4 yet. Recommendation: **Use Zod 3.25.76** (latest 3.x) for maximum ecosystem compatibility. Upgrading to Zod 4 can be done as a dedicated task later when all downstream packages have confirmed support. [VERIFIED: npm registry shows drizzle-zod peerDeps accept both]

**TypeScript 5.x vs 6.x:** TypeScript 6.0.2 was released very recently (April 2026). TS 6 is a major version bump. For a greenfield project just starting, **use TypeScript 5.9.3** (latest 5.x) which is well-tested with all ecosystem tooling. TS 6 can be evaluated after the first few phases when the codebase is established. [VERIFIED: npm registry]

**pino 10.x / pino-http 11.x:** These are major bumps from CLAUDE.md's 9.x/10.x. pino-http 11 requires pino ^10. The API is compatible. [VERIFIED: npm registry peerDeps]

**drizzle-kit 0.31.x:** Bumped from CLAUDE.md's 0.30.x. The `generate` and `migrate` commands remain the same. [VERIFIED: npm registry]

### Docker Images

| Image | Tag | Purpose |
|-------|-----|---------|
| node | 22-alpine | API/worker/web base image (build + production) |
| postgres | 17-alpine | PostgreSQL database |
| redis | 7.4-alpine | Queue broker |
| nginx | 1.27-alpine | Reverse proxy |

### Installation (Phase 1 packages only)

```bash
# Root (shared tooling)
pnpm add -Dw typescript@~5.9.3 eslint@~10.2.0 prettier@~3.8.1 tsx@~4.21.0

# packages/shared
pnpm --filter shared add zod@~3.25.76
pnpm --filter shared add -D typescript@~5.9.3 vitest@~4.1.3

# packages/db
pnpm --filter db add drizzle-orm@~0.45.2 postgres@~3.4.9
pnpm --filter db add -D drizzle-kit@~0.31.10 typescript@~5.9.3

# packages/api
pnpm --filter api add express@~5.2.1 pino@~10.3.1 pino-http@~11.0.0 helmet@~8.1.0 csrf-csrf@~4.0.3 cookie-parser uuid@~13.0.0 ioredis@~5.10.1
pnpm --filter api add -D typescript@~5.9.3 supertest@~7.2.2 vitest@~4.1.3 @types/express @types/cookie-parser @types/supertest pino-pretty@~13.1.3 nodemon

# packages/worker
pnpm --filter worker add bullmq@~5.73.0 ioredis@~5.10.1 pino@~10.3.1
pnpm --filter worker add -D typescript@~5.9.3 vitest@~4.1.3 pino-pretty@~13.1.3 nodemon

# packages/web (minimal stub for Phase 1)
# Scaffolded via: pnpm create vite@latest packages/web --template react-ts
```

## Architecture Patterns

### Recommended Project Structure

```
social-media-scheduler/
+-- package.json                    # Root: pnpm workspace config, shared scripts
+-- pnpm-workspace.yaml             # Workspace definition
+-- tsconfig.base.json              # Shared TypeScript config
+-- docker-compose.yml              # Production compose
+-- docker-compose.dev.yml          # Dev override (bind mounts, hot reload)
+-- Dockerfile                      # Multi-stage build
+-- nginx/
|   +-- nginx.conf                  # Reverse proxy config (plain HTTP)
+-- .env.example                    # Template for required env vars
+-- packages/
    +-- shared/
    |   +-- package.json
    |   +-- tsconfig.json
    |   +-- src/
    |       +-- encryption.ts       # AES-256-GCM encrypt/decrypt module
    |       +-- index.ts            # Package exports
    +-- db/
    |   +-- package.json
    |   +-- tsconfig.json
    |   +-- drizzle.config.ts       # Drizzle kit config
    |   +-- src/
    |   |   +-- client.ts           # Database client (postgres-js)
    |   |   +-- schema/
    |   |   |   +-- index.ts        # Schema barrel export (empty in Phase 1)
    |   |   +-- migrate.ts          # Programmatic migration runner
    |   +-- drizzle/                # Generated SQL migrations go here
    +-- api/
    |   +-- package.json
    |   +-- tsconfig.json
    |   +-- src/
    |       +-- index.ts            # Express app bootstrap + listen
    |       +-- app.ts              # Express app factory (testable)
    |       +-- middleware/
    |       |   +-- correlation-id.ts   # UUID correlation ID middleware
    |       |   +-- csrf.ts             # csrf-csrf setup
    |       |   +-- security-headers.ts # helmet config
    |       |   +-- error-handler.ts    # Global error handler
    |       |   +-- logger.ts           # pino-http middleware setup
    |       +-- routes/
    |           +-- health.ts       # GET /health endpoint
    +-- worker/
    |   +-- package.json
    |   +-- tsconfig.json
    |   +-- src/
    |       +-- index.ts            # Worker bootstrap
    |       +-- heartbeat.ts        # Redis heartbeat writer (setInterval)
    +-- web/
        +-- package.json            # Vite + React scaffold (stub)
        +-- tsconfig.json
        +-- vite.config.ts
        +-- src/
            +-- main.tsx            # Minimal React entry
            +-- App.tsx             # Placeholder component
```

### Pattern 1: Programmatic Drizzle Migration on Startup

**What:** Run database migrations automatically when the API container starts, before the Express server begins listening.
**When to use:** Every container startup (D-08).

```typescript
// packages/db/src/migrate.ts
// Source: https://orm.drizzle.team/docs/migrations (postgres-js migrator)
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export async function runMigrations(databaseUrl: string) {
  // max: 1 is required for migrations per drizzle docs
  const migrationClient = postgres(databaseUrl, { max: 1 });
  const db = drizzle(migrationClient);

  await migrate(db, { migrationsFolder: './drizzle' });
  await migrationClient.end();
}
```

```typescript
// packages/api/src/index.ts -- entrypoint
import { runMigrations } from '@social-media-scheduler/db/migrate';
import { createApp } from './app.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

await runMigrations(DATABASE_URL);
const app = createApp();
app.listen(3000, () => console.log('API listening on :3000'));
```

[VERIFIED: drizzle-orm/postgres-js/migrator import path confirmed via official docs and npm search results]

### Pattern 2: Worker Heartbeat via Redis Key

**What:** Worker writes a timestamp to a Redis key every 30 seconds. Health endpoint reads it.
**When to use:** INFRA-07 requirement.

```typescript
// packages/worker/src/heartbeat.ts
import type { Redis } from 'ioredis';

const HEARTBEAT_KEY = 'worker:heartbeat';
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TTL_SECONDS = 120; // Auto-expire if worker dies hard

export function startHeartbeat(redis: Redis): NodeJS.Timeout {
  const tick = () => {
    redis.set(HEARTBEAT_KEY, Date.now().toString(), 'EX', HEARTBEAT_TTL_SECONDS);
  };
  tick(); // Write immediately on start
  return setInterval(tick, HEARTBEAT_INTERVAL_MS);
}
```

```typescript
// packages/api/src/routes/health.ts -- reading heartbeat
const lastHeartbeat = await redis.get('worker:heartbeat');
const workerAlive = lastHeartbeat
  ? Date.now() - parseInt(lastHeartbeat, 10) < 60_000
  : false;
```

[ASSUMED -- standard Redis key pattern; no library-specific API needed]

### Pattern 3: AES-256-GCM Encryption Module

**What:** Encrypt/decrypt utility in the shared package using Node.js built-in `crypto`.
**When to use:** SEC-01, SEC-02, SEC-03 requirements.

```typescript
// packages/shared/src/encryption.ts
// Source: Node.js crypto docs + https://gist.github.com/rjz/15baffeab434b8125ca4d783f4116d81
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;  // 96-bit nonce (recommended for GCM)
const AUTH_TAG_LENGTH = 16;

export interface EncryptedPayload {
  ciphertext: string;  // hex-encoded
  iv: string;          // hex-encoded
  authTag: string;     // hex-encoded
  version: number;     // encryption key version for rotation
}

export function encrypt(
  plaintext: string,
  key: Buffer,
  version: number = 1,
): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
    version,
  };
}

export function decrypt(
  ciphertext: string,
  iv: string,
  authTag: string,
  key: Buffer,
): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'hex'),
    { authTagLength: AUTH_TAG_LENGTH },
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
```

[VERIFIED: Node.js crypto API for aes-256-gcm -- createCipheriv, getAuthTag, 12-byte IV per NIST recommendation]

### Pattern 4: Correlation ID Middleware + pino-http Integration

**What:** Assign UUID to every request, wire it into pino-http for automatic log correlation.
**When to use:** INFRA-08, INFRA-09 requirements.

```typescript
// packages/api/src/middleware/correlation-id.ts
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export function correlationId(req: Request, _res: Response, next: NextFunction) {
  // Accept incoming correlation ID or generate new one
  req.id = (req.headers['x-request-id'] as string) || randomUUID();
  next();
}
```

```typescript
// packages/api/src/middleware/logger.ts
import pino from 'pino';
import pinoHttp from 'pino-http';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty' },
  }),
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id as string,
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

export { logger };
```

[VERIFIED: pino-http genReqId option confirmed via GitHub README; pino redact option confirmed via official docs]

### Pattern 5: CSRF Protection with csrf-csrf v4

**What:** Double Submit Cookie CSRF protection.
**When to use:** SEC-05 requirement.

```typescript
// packages/api/src/middleware/csrf.ts
// Source: https://github.com/Psifi-Solutions/csrf-csrf
import { doubleCsrf } from 'csrf-csrf';

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET!,
  getSessionIdentifier: (req) => req.session?.id ?? '',
  cookieOptions: {
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    path: '/',
  },
});

export { doubleCsrfProtection, generateCsrfToken };
```

[VERIFIED: csrf-csrf v4 API -- doubleCsrf() returns doubleCsrfProtection middleware and generateCsrfToken utility]

### Pattern 6: Docker Compose Service Definitions

**What:** Production compose file with all five services.
**When to use:** INFRA-02, INFRA-05 requirements.

```yaml
# docker-compose.yml (production)
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-scheduler}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-scheduler}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-scheduler}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7.4-alpine
    command: redis-server --appendonly yes --maxmemory-policy noeviction
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      target: api-production
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-scheduler}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-scheduler}
      REDIS_URL: redis://redis:6379
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      CSRF_SECRET: ${CSRF_SECRET}
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/health"]
      interval: 15s
      timeout: 5s
      retries: 3

  worker:
    build:
      context: .
      target: worker-production
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-scheduler}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-scheduler}
      REDIS_URL: redis://redis:6379
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  nginx:
    image: nginx:1.27-alpine
    ports:
      - "${NGINX_PORT:-8080}:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:80/health"]
      interval: 15s
      timeout: 5s
      retries: 3

volumes:
  postgres_data:
  redis_data:
```

[VERIFIED: Redis maxmemory-policy noeviction command syntax per BullMQ production docs]

### Pattern 7: Multi-Stage Dockerfile with pnpm deploy

**What:** Single Dockerfile for both api and worker services, using pnpm deploy for minimal production images.
**When to use:** INFRA-10 requirement.

```dockerfile
# Dockerfile
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Install build tools for native addons (argon2, sharp)
FROM base AS build-deps
RUN apk add --no-cache python3 make g++ linux-headers

# Install all dependencies
FROM build-deps AS install
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/api/package.json packages/api/
COPY packages/worker/package.json packages/worker/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Build all packages
FROM install AS build
COPY . .
RUN pnpm -r build

# Deploy API (production deps only)
FROM build AS api-deploy
RUN pnpm deploy --filter=api --prod /prod/api

# Deploy Worker (production deps only)
FROM build AS worker-deploy
RUN pnpm deploy --filter=worker --prod /prod/worker

# API production image
FROM base AS api-production
RUN apk add --no-cache ffmpeg wget
COPY --from=api-deploy /prod/api /app
WORKDIR /app
EXPOSE 3000
CMD ["node", "dist/index.js"]

# Worker production image
FROM base AS worker-production
RUN apk add --no-cache ffmpeg
COPY --from=worker-deploy /prod/worker /app
WORKDIR /app
CMD ["node", "dist/index.js"]
```

[CITED: https://pnpm.io/docker -- pnpm deploy pattern for workspace monorepos]

### Anti-Patterns to Avoid

- **Running migrations in a separate init container:** Adds complexity with no benefit for a single-instance app. Run migrations in the API entrypoint before listening (D-08).
- **Sharing a single ioredis connection between BullMQ and application code:** BullMQ manages its own connections internally. Create separate ioredis instances for application use (health checks, heartbeat).
- **Using `drizzle-kit push` in production:** Push modifies the database directly without versioned migration files. Always use `generate` + `migrate` for production (D-09).
- **Putting TLS certs in Docker:** Cloudflare Tunnel handles TLS. nginx should be HTTP-only internally (D-02).
- **Using `maxmemory-policy allkeys-lru` with BullMQ:** BullMQ will silently lose job data if Redis evicts keys. Must use `noeviction` (D-10).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Encryption | Custom crypto wrapping | Node.js built-in `crypto` with AES-256-GCM | Crypto is already in the standard library; no external dependency needed. Key: 12-byte IV, separate auth tag storage, version column. |
| CSRF protection | Custom token middleware | csrf-csrf v4 `doubleCsrf()` | CSRF has subtle timing attacks, cookie scope issues, and SPA-specific challenges. csrf-csrf handles Double Submit Cookie correctly. |
| Security headers | Manual header setting | helmet v8 | Helmet tracks evolving browser security headers (CSP, HSTS, X-Frame-Options). Manual headers drift and miss new protections. |
| Structured logging | Custom log formatter | pino + pino-http | Log formatting, serialization, redaction, performance optimizations -- pino handles all of this with 5x less overhead than alternatives. |
| UUID generation | Math.random-based IDs | `crypto.randomUUID()` or uuid v13 | Node.js 19+ has built-in `crypto.randomUUID()`. Use it directly (no uuid package needed) or uuid v13 for compatibility. |
| Docker health checks | Custom health scripts | Built-in Docker HEALTHCHECK + wget/curl | Docker Compose native healthcheck with `depends_on: condition: service_healthy` handles startup ordering. |

## Common Pitfalls

### Pitfall 1: pnpm workspace package resolution in Docker

**What goes wrong:** Docker COPY doesn't understand pnpm workspace protocol references (`workspace:*`). Building a single package in Docker without copying the full monorepo structure fails.
**Why it happens:** pnpm workspaces use symlinks and a content-addressable store that doesn't exist inside the Docker build context.
**How to avoid:** Use `pnpm deploy --filter=<pkg> --prod /output` to create a self-contained directory with only the necessary production dependencies resolved. Copy this into the final Docker image stage.
**Warning signs:** Build fails with "ERR_PNPM_NO_MATCHING_VERSION" or missing workspace package errors.

### Pitfall 2: Drizzle migration client connection limit

**What goes wrong:** Migration hangs or deadlocks when using a connection pool for migrations.
**Why it happens:** Drizzle migrations use advisory locks and must run on a single connection. A pool with concurrent connections can deadlock.
**How to avoid:** Create a separate postgres client with `{ max: 1 }` specifically for migrations, then close it before starting the app. See Pattern 1 above.
**Warning signs:** API container hangs at startup, migration timeout.

### Pitfall 3: Redis persistence not actually persisting

**What goes wrong:** Redis data (BullMQ jobs, heartbeat) lost on container restart even though a volume is mounted.
**Why it happens:** Redis defaults to RDB snapshots which can lose recent data. Without `--appendonly yes`, writes between snapshots are lost.
**How to avoid:** Always use `--appendonly yes` in the Redis command. Mount `/data` to a Docker volume.
**Warning signs:** Jobs disappear after `docker compose restart redis`.

### Pitfall 4: Native addon compilation fails in Alpine

**What goes wrong:** `argon2` or `sharp` fail to compile during Docker build on Alpine.
**Why it happens:** Alpine uses musl instead of glibc. Native addons need `python3`, `make`, `g++`, and sometimes `linux-headers`.
**How to avoid:** Install build tools in the build stage only (`apk add --no-cache python3 make g++ linux-headers`). The production image stays clean via multi-stage build.
**Warning signs:** `gyp ERR!` or `node-pre-gyp` errors during `pnpm install`.

### Pitfall 5: CSRF middleware blocks health check endpoint

**What goes wrong:** `GET /health` returns 403 because CSRF middleware is applied globally.
**Why it happens:** csrf-csrf validates all requests by default unless `ignoredMethods` is configured.
**How to avoid:** csrf-csrf defaults to ignoring GET, HEAD, OPTIONS methods (correct for REST). Verify the `ignoredMethods` configuration includes GET. Register health check route before CSRF middleware, or rely on the default `ignoredMethods` which already excludes GET.
**Warning signs:** Health checks fail with 403/CSRF token missing.

### Pitfall 6: Encryption key format mismatch

**What goes wrong:** Encryption throws "Invalid key length" error.
**Why it happens:** AES-256 requires exactly 32 bytes of key material. If `ENCRYPTION_KEY` env var is provided as a hex string, it must be 64 characters (32 bytes when decoded). If provided as raw, it must be exactly 32 bytes.
**How to avoid:** Validate key length at startup. Document expected format in `.env.example`. Provide a key generation script: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
**Warning signs:** App crashes on first encrypt call with "Invalid key length".

### Pitfall 7: Express 5 async error handling assumptions

**What goes wrong:** Unhandled promise rejections crash the process instead of hitting error middleware.
**Why it happens:** Express 5 auto-forwards rejected promises from route handlers to error middleware, but only for `async` route handlers. Callbacks that throw synchronously still need try/catch.
**How to avoid:** Use `async` route handlers consistently. Express 5 handles `async (req, res) => { ... }` natively -- rejected promises go to error middleware automatically.
**Warning signs:** Process crashes with `UnhandledPromiseRejection` instead of returning 500.

## Code Examples

### Health Endpoint (INFRA-06, INFRA-07)

```typescript
// packages/api/src/routes/health.ts
import { Router, type Request, type Response } from 'express';
import type { Redis } from 'ioredis';
import type postgres from 'postgres';

export function createHealthRouter(redis: Redis, sql: postgres.Sql) {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    const checks: Record<string, unknown> = {};

    // Postgres check
    try {
      await sql`SELECT 1`;
      checks.postgres = { status: 'ok' };
    } catch (err) {
      checks.postgres = { status: 'error', message: (err as Error).message };
    }

    // Redis check
    try {
      const pong = await redis.ping();
      checks.redis = { status: pong === 'PONG' ? 'ok' : 'error' };
    } catch (err) {
      checks.redis = { status: 'error', message: (err as Error).message };
    }

    // Worker heartbeat (INFRA-07)
    const lastHeartbeat = await redis.get('worker:heartbeat');
    const workerAlive = lastHeartbeat
      ? Date.now() - parseInt(lastHeartbeat, 10) < 60_000
      : false;
    checks.worker = {
      alive: workerAlive,
      lastHeartbeat: lastHeartbeat ? new Date(parseInt(lastHeartbeat, 10)).toISOString() : null,
    };

    // Pending jobs (stub -- returns 0 until queues exist in later phases)
    checks.pendingJobs = 0;

    // Last publish timestamp (stub -- null until publishing exists)
    checks.lastPublish = null;

    const allOk = checks.postgres?.status === 'ok'
      && checks.redis?.status === 'ok'
      && workerAlive;

    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  return router;
}
```

[ASSUMED -- standard pattern based on Express + ioredis + postgres-js APIs]

### nginx Configuration (Plain HTTP Proxy)

```nginx
# nginx/nginx.conf
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    upstream api {
        server api:3000;
    }

    upstream web {
        server web:5173;
    }

    server {
        listen 80;

        # API routes
        location /api/ {
            proxy_pass http://api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Request-ID $request_id;
        }

        # Health check (direct to API)
        location /health {
            proxy_pass http://api/health;
        }

        # Frontend (all other routes)
        location / {
            proxy_pass http://web;
            proxy_set_header Host $host;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
```

[ASSUMED -- standard nginx reverse proxy config]

### pnpm Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```json
// package.json (root)
{
  "name": "social-media-scheduler",
  "private": true,
  "packageManager": "pnpm@10.x",
  "scripts": {
    "dev": "docker compose -f docker-compose.yml -f docker-compose.dev.yml up",
    "build": "pnpm -r build",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "pnpm -r test",
    "db:generate": "pnpm --filter db exec drizzle-kit generate",
    "db:migrate": "pnpm --filter db exec drizzle-kit migrate"
  }
}
```

[CITED: https://pnpm.io/docker -- workspace yaml format]

### TypeScript Base Configuration

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

[ASSUMED -- standard TypeScript config for Node.js 22 with ESM]

### Environment Variable Template

```bash
# .env.example
# Required
DATABASE_URL=postgres://scheduler:changeme@localhost:5432/scheduler
REDIS_URL=redis://localhost:6379
ENCRYPTION_KEY=  # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CSRF_SECRET=     # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# PostgreSQL
POSTGRES_USER=scheduler
POSTGRES_PASSWORD=changeme
POSTGRES_DB=scheduler

# Optional
NODE_ENV=development
LOG_LEVEL=info
NGINX_PORT=8080
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| npm workspaces | pnpm workspaces | 2024+ | pnpm is faster, uses content-addressable store, `pnpm deploy` solves Docker monorepo problem |
| Express 4 | Express 5 | March 2025 (stable) | Native async error handling, no wrapper functions needed |
| csurf (CSRF) | csrf-csrf v4 | Sept 2022 (csurf deprecated) | csurf had security vulnerabilities; csrf-csrf implements Double Submit Cookie correctly |
| pino 9 / pino-http 10 | pino 10 / pino-http 11 | 2026 | pino-http 11 requires pino ^10; API compatible, performance improvements |
| Zod 3 | Zod 4 available (use 3.x) | 2026 | Zod 4 is a rewrite with breaking changes; ecosystem (drizzle-zod, hookform resolvers) still catching up. Use 3.25.x for safety. |
| TypeScript 5.x | TypeScript 6.x available (use 5.9.x) | April 2026 | TS 6 just released; use 5.9.3 for ecosystem stability |
| drizzle-kit 0.30 | drizzle-kit 0.31 | 2026 | Same generate/migrate workflow; minor version bump |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | cookie-parser is required by csrf-csrf before doubleCsrfProtection middleware | Standard Stack | Low -- easily added if missing; csrf-csrf docs mention this dependency |
| A2 | pnpm deploy correctly resolves workspace protocol dependencies for Docker production images | Architecture Patterns | Medium -- if it doesn't, need to restructure Docker build; verified against official docs but not tested |
| A3 | nginx `$request_id` variable generates a unique ID per request (for X-Request-ID header passthrough) | Code Examples | Low -- standard nginx feature since 1.11.0 |
| A4 | nodemon works with pnpm workspace bind mounts in Docker dev mode | Architecture Patterns | Low -- standard pattern; tsx --watch is an alternative |
| A5 | Express 5.2.1 is fully compatible with helmet 8.1.0 and csrf-csrf 4.0.3 | Standard Stack | Low -- Express 5 middleware API is backward-compatible with Express 4 middleware |
| A6 | TypeScript 5.9.3 is safe to use with all Phase 1 dependencies | Standard Stack | Low -- TS 5.x is well-established; newer than the 5.7.x in CLAUDE.md |
| A7 | Drizzle programmatic migration with postgres-js driver uses `drizzle-orm/postgres-js/migrator` import | Architecture Patterns | Low -- confirmed via official docs search results, but exact API may vary with drizzle-orm 0.45 |

## Open Questions (RESOLVED)

1. **pnpm not installed on dev machine** -- RESOLVED: Install via `corepack enable && corepack prepare pnpm@latest --activate`. This is Node.js-native pnpm management. Plan 01 Task 1 sets the `packageManager` field in root package.json.

2. **Docker not available on dev machine** -- RESOLVED: Docker is required for the dev workflow per D-05. Plan 02 creates docker-compose.dev.yml with bind mounts. User installs Docker Desktop on macOS for local development; Proxmox uses Docker Engine for production. The compose files are validated without running containers.

3. **Web package in Phase 1 -- how much?** -- RESOLVED: Plan 01 Task 2 scaffolds a minimal Vite + React stub (App.tsx with placeholder, no routes or components). This validates the build pipeline without doing UI work, consistent with D-13 (no UI features in Phase 1).

4. **Cloudflare Tunnel setup -- in scope for Phase 1?** -- RESOLVED: Out of scope. Cloudflare Tunnel is external infrastructure running on the Proxmox host, not a Docker service. Phase 1 configures nginx as a plain HTTP proxy per D-01/D-02. The tunnel connector points to nginx's exposed port. No tunnel config in the Docker stack.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | 25.5.0 | Use 22 LTS in Docker; local dev works on 25 |
| pnpm | Package manager (D-14) | No | -- | Install via `corepack enable && corepack prepare pnpm@latest --activate` |
| Docker | Container orchestration | No | -- | Install Docker Desktop for local dev, or run services directly with Node.js |
| Docker Compose | Stack orchestration (INFRA-02) | No | -- | Comes with Docker Desktop |
| ffmpeg | Media transcoding (INFRA-10) | Yes | 8.0.1 | Only needed in Docker image; available on dev machine for testing |
| openssl | Key generation scripts | Yes | LibreSSL 3.3.6 | Node.js crypto module does not need system OpenSSL |
| PostgreSQL | Database (INFRA-04) | No (local) | -- | Use Docker container or install via Homebrew |
| Redis | Queue broker (INFRA-05) | No (local) | -- | Use Docker container or install via Homebrew |

**Missing dependencies with no fallback:**
- pnpm: Must be installed. Use `corepack enable` (1-line fix).

**Missing dependencies with fallback:**
- Docker/Docker Compose: Not available on dev machine. Fallback: run services directly with Node.js + Homebrew-installed Postgres/Redis for development. Docker is required on Proxmox for deployment.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.3 |
| Config file | `vitest.config.ts` per workspace package (Wave 0 creation) |
| Quick run command | `pnpm -r test` |
| Full suite command | `pnpm -r test -- --run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | pnpm workspaces with 5 packages resolve correctly | smoke | `pnpm -r ls` (verify all packages listed) | No -- Wave 0 |
| INFRA-02 | Docker Compose starts all services | integration | `docker compose up -d && docker compose ps` | No -- Wave 0 |
| INFRA-04 | Drizzle migrations run programmatically | unit | `pnpm --filter db test -- --run` | No -- Wave 0: `packages/db/src/__tests__/migrate.test.ts` |
| INFRA-05 | Redis maxmemory-policy is noeviction | smoke | `docker compose exec redis redis-cli CONFIG GET maxmemory-policy` | No -- manual |
| INFRA-06 | GET /health returns JSON with all status fields | unit | `pnpm --filter api test -- --run` | No -- Wave 0: `packages/api/src/__tests__/health.test.ts` |
| INFRA-07 | Worker heartbeat writes to Redis, health reads it | unit | `pnpm --filter worker test -- --run` | No -- Wave 0: `packages/worker/src/__tests__/heartbeat.test.ts` |
| INFRA-08 | Log output is structured JSON with required fields | unit | `pnpm --filter api test -- --run` | No -- Wave 0: `packages/api/src/__tests__/logger.test.ts` |
| INFRA-09 | Correlation ID assigned to every request | unit | `pnpm --filter api test -- --run` | No -- Wave 0: `packages/api/src/__tests__/correlation-id.test.ts` |
| INFRA-10 | Docker multi-stage build succeeds | integration | `docker build --target api-production .` | No -- manual |
| SEC-01/02 | Encrypt/decrypt roundtrip with AES-256-GCM | unit | `pnpm --filter shared test -- --run` | No -- Wave 0: `packages/shared/src/__tests__/encryption.test.ts` |
| SEC-03 | Encryption version parameter preserved in payload | unit | `pnpm --filter shared test -- --run` | No -- Wave 0 (same file) |
| SEC-05 | CSRF middleware rejects POST without token | unit | `pnpm --filter api test -- --run` | No -- Wave 0: `packages/api/src/__tests__/csrf.test.ts` |
| SEC-06 | Security headers present in response | unit | `pnpm --filter api test -- --run` | No -- Wave 0: `packages/api/src/__tests__/security-headers.test.ts` |

### Sampling Rate

- **Per task commit:** `pnpm --filter <changed-package> test -- --run`
- **Per wave merge:** `pnpm -r test -- --run`
- **Phase gate:** Full suite green + Docker Compose up with health checks passing

### Wave 0 Gaps

- [ ] `packages/shared/vitest.config.ts` -- test config for shared package
- [ ] `packages/shared/src/__tests__/encryption.test.ts` -- covers SEC-01, SEC-02, SEC-03
- [ ] `packages/db/vitest.config.ts` -- test config for db package
- [ ] `packages/db/src/__tests__/migrate.test.ts` -- covers INFRA-04
- [ ] `packages/api/vitest.config.ts` -- test config for api package
- [ ] `packages/api/src/__tests__/health.test.ts` -- covers INFRA-06, INFRA-07
- [ ] `packages/api/src/__tests__/correlation-id.test.ts` -- covers INFRA-09
- [ ] `packages/api/src/__tests__/logger.test.ts` -- covers INFRA-08
- [ ] `packages/api/src/__tests__/csrf.test.ts` -- covers SEC-05
- [ ] `packages/api/src/__tests__/security-headers.test.ts` -- covers SEC-06
- [ ] `packages/worker/vitest.config.ts` -- test config for worker package
- [ ] `packages/worker/src/__tests__/heartbeat.test.ts` -- covers INFRA-07
- [ ] Root `vitest.workspace.ts` -- optional workspace-level Vitest config for running all packages

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (Phase 2) | -- |
| V3 Session Management | No (Phase 2) | -- |
| V4 Access Control | No (Phase 2) | -- |
| V5 Input Validation | Yes (health endpoint, env var validation) | zod for schema validation |
| V6 Cryptography | Yes (SEC-01, SEC-02, SEC-03) | Node.js crypto with AES-256-GCM, 12-byte IV, separate auth tag |
| V7 Error Handling & Logging | Yes (INFRA-08) | pino structured logging, redaction of sensitive fields |
| V8 Data Protection | Yes (SEC-04) | Decrypted tokens never cached; in-memory only |
| V10 HTTP Security | Yes (SEC-05, SEC-06) | helmet for headers, csrf-csrf for CSRF protection |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSRF on state-changing endpoints | Spoofing | csrf-csrf Double Submit Cookie with SameSite=Strict |
| Sensitive data in logs | Information Disclosure | pino `redact` option for auth headers, cookies, tokens |
| Encryption key exposure | Information Disclosure | Key in env var only, never in code/DB/logs; validate at startup |
| IV reuse in AES-GCM | Tampering | crypto.randomBytes(12) for every encrypt call; never accept caller-provided IV |
| Missing security headers | Various | helmet defaults: CSP, HSTS, X-Content-Type-Options, X-Frame-Options |
| Redis data loss from eviction | Denial of Service | maxmemory-policy noeviction (BullMQ requirement) |

## Sources

### Primary (HIGH confidence)
- npm registry -- verified current versions for all 13 core packages (2026-04-07)
- [Drizzle ORM Migrations docs](https://orm.drizzle.team/docs/migrations) -- programmatic migration API with postgres-js driver
- [Drizzle Kit migrate docs](https://orm.drizzle.team/docs/drizzle-kit-migrate) -- CLI and config format
- [BullMQ Going to Production](https://docs.bullmq.io/guide/going-to-production) -- maxmemory-policy noeviction requirement
- [BullMQ Connections docs](https://docs.bullmq.io/guide/connections) -- Redis connection configuration
- [pnpm Docker docs](https://pnpm.io/docker) -- pnpm deploy pattern for workspace monorepos
- [csrf-csrf GitHub README](https://github.com/Psifi-Solutions/csrf-csrf) -- v4 API, doubleCsrf configuration

### Secondary (MEDIUM confidence)
- [Node.js AES-256-GCM gist](https://gist.github.com/rjz/15baffeab434b8125ca4d783f4116d81) -- encryption pattern reference
- [pinojs/pino-http GitHub](https://github.com/pinojs/pino-http) -- genReqId, serializers, correlation ID
- [BullMQ Worker Health Checks (oneuptime, 2026)](https://oneuptime.com/blog/post/2026-01-21-bullmq-worker-health-checks/view) -- health endpoint patterns
- [Pino Logger Guide (SigNoz, 2026)](https://signoz.io/guides/pino-logger/) -- structured logging best practices

### Tertiary (LOW confidence)
- None -- all findings verified against at least one authoritative source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified against npm registry on 2026-04-07
- Architecture: HIGH -- patterns confirmed from official docs (Drizzle, pnpm, BullMQ, csrf-csrf)
- Pitfalls: HIGH -- known issues documented in official docs and community reports
- Security: HIGH -- AES-256-GCM pattern is well-established; helmet and csrf-csrf are standard Express security middleware

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (30 days -- stable ecosystem, no fast-moving dependencies)
