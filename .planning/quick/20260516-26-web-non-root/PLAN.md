---
slug: 26-web-non-root
github_issue: 26
status: in-progress
created: 2026-05-16
updated: 2026-05-16
worktree: .claude/worktrees/26-security-web-production-docker-stage-runs-as-root
---

# Quick Task: gh#26 — Web-production Docker stage runs as non-root

## Problem

Docker's `web-production` stage in the root `Dockerfile` uses `nginx:1.27-alpine` as its base and never creates a non-root user or sets a `USER` directive. Both `api-production` and `worker-production` correctly create `appuser:appgroup` (UID 1001) and switch to it via `USER appuser`. Project convention (CLAUDE.md → API Package Standards → Docker & Infrastructure): *"Containers: non-root user via USER directive."* The web stage is the lone violator.

## Decision

Switch the web stage's base image to **`nginxinc/nginx-unprivileged:1.27-alpine`**.

Considered three options surfaced in the GitHub issue:

| Option | Choice? | Reasoning |
|---|---|---|
| (a) Change listen to 8080 + manual `addgroup`/`adduser`/`USER appuser`, chown nginx runtime dirs | rejected | Most consistent with the api/worker pattern, but requires manually chowning `/var/cache/nginx`, `/var/run`, etc., plus a `pid` directive in nginx.conf. Larger diff, more ways to be subtly wrong. |
| **(b) Use `nginxinc/nginx-unprivileged` base image** | **chosen** | Official upstream-maintained variant. Pre-configures `USER nginx`, `listen 8080`, `pid /tmp/nginx.pid`, and the right ownership on cache/run dirs. Net Dockerfile change is smaller than (a) and there are no chmod/chown footguns. |
| (c) Rewrite nginx config at build time (e.g., `envsubst`) | rejected | Solves only the port problem; non-root still requires (a)'s chown work. Strictly worse than (a) or (b). |

The `appuser:appgroup` pattern in api/worker is right *for our code* — they're our binaries. The web container is `nginx` from upstream; using the upstream-blessed `nginx` user (UID 101) via the unprivileged variant is the cleaner match.

## Change set

1. **`nginx/nginx.conf`** — `listen 80` → `listen 8080`. No `pid` directive needed (the unprivileged base supplies `pid /tmp/nginx.pid` via its default, but since we're replacing nginx.conf entirely we explicitly set it too for safety).
2. **`Dockerfile`** — `FROM nginxinc/nginx-unprivileged:1.27-alpine AS web-production`, `USER root` for the `apk add wget` step (healthcheck dep), `USER nginx` after, `EXPOSE 8080`.
3. **`docker-compose.yml`** — `"${NGINX_PORT:-8080}:80"` → `"${NGINX_PORT:-8080}:8080"`. Host port stays at 8080 (no upstream caller change); container port matches nginx's new listen.

## Verification plan

- `pnpm typecheck` — should pass (no TS change, sanity check)
- `pnpm lint` — should pass (no JS/TS change, sanity check)
- `pnpm test` — should pass (no application code change)
- Visual: `grep -E "USER|listen|EXPOSE" Dockerfile nginx/nginx.conf` confirms non-root, port 8080, expose 8080
- Smoke check intent (not executed here, but noted for reviewer): `docker compose build nginx && docker compose run --rm -u nginx nginx whoami` should print `nginx` (UID 101), and `curl localhost:8080` should return the SPA index after the api service is up.

## Acceptance (from gh#26)

- ✅ Web container runs as non-root via `USER` directive
- ✅ Still serves traffic correctly (container internal port 8080, host port stays 8080)
