# Phase 1: Infrastructure & Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 01-Infrastructure & Foundation
**Areas discussed:** HTTPS / TLS strategy, Dev compose experience, Phase 1 schema scope, First-run bootstrap

---

## HTTPS / TLS Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Cloudflare Tunnel | TLS handled outside containers; nginx is plain HTTP internally; no cert management | ✓ |
| nginx + Let's Encrypt | certbot + ACME; requires public domain, port 80/443, renewal automation | |

**User's choice:** Cloudflare Tunnel — all traffic (app + OAuth callbacks) routes through the tunnel.
**Notes:** Simplifies Proxmox setup significantly. Cloudflare's TLS satisfies Facebook/LinkedIn HTTPS callback requirements. User confirmed all traffic goes through the tunnel, not split routing.

---

## Dev Compose Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Separate docker-compose.dev.yml | Override with bind mounts, hot reload, debug ports; prod compose stays clean | ✓ |
| Single compose with env-flag switching | One file, NODE_ENV controls behavior | |
| Production compose only | Build-and-run only; no hot reload for Phase 1 | |

**Worker topology:**

| Option | Description | Selected |
|--------|-------------|----------|
| Separate worker service from day one | Matches production; catches integration issues early | ✓ |
| Inline with API in dev | Simpler startup; split later | |

**User's choice:** Separate dev override file + worker as separate service from day one.
**Notes:** Hot reload for all packages; worker isolation prevents topology surprises in later phases.

---

## Phase 1 Schema Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Migration infra + encryption foundation | drizzle-kit setup + baseline migration; no app tables | ✓ |
| Full Phase 1 + stub tables for Phase 2 | Also create users, sessions, social_profiles stubs | |
| Migration infra only, no app tables | Empty baseline only | |

**Migration execution:**

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-run on container start | drizzle-kit migrate in API entrypoint | ✓ |
| Manual via npm script | Explicit pnpm db:migrate required | |

**User's choice:** Migration infra + encryption foundation; auto-run on start.
**Notes:** Encryption module in shared package needs no DB tables in Phase 1. App tables land in the phases that own them.

---

## First-Run Bootstrap

| Option | Description | Selected |
|--------|-------------|----------|
| Skip it — Phase 2 owns auth | No seed data; Phase 1 validated via /health only | ✓ |
| Seed a dev user via SQL migration | Hashed admin password in seed migration | |
| Env-var bootstrap user | API reads BOOTSTRAP_EMAIL + BOOTSTRAP_PASSWORD on first start | |

**User's choice:** Skip — Phase 2 owns auth.
**Notes:** Phase 1 can be fully validated without a user. /health endpoint is the smoke test.

---
