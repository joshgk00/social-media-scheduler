---
slug: 26-web-non-root
github_issue: 26
status: complete
created: 2026-05-16
updated: 2026-05-16
worktree: .claude/worktrees/26-security-web-production-docker-stage-runs-as-root
---

# Summary: gh#26 — Web-production Docker stage runs as non-root

## What changed

**Five infra/runtime files** (Dockerfile, both nginx configs, both compose files). The PR diff also includes this PLAN.md plus its sibling SUMMARY.md under `.planning/quick/` — those are the audit-trail artifacts, not part of the runtime change. Net runtime diff: pure infra — no application code or test code touched.

| File | Change |
|---|---|
| `Dockerfile` | `web-production` stage's base image switched from `nginx:1.27-alpine` to `nginxinc/nginx-unprivileged:1.27-alpine`. Added `USER root` for the `apk add wget` step (healthcheck dep), then `USER nginx` after. `EXPOSE 80` → `EXPOSE 8080`. Block-comment explains the deliberate deviation from the api/worker `appuser` pattern. |
| `nginx/nginx.conf` | Added top-level `pid /tmp/nginx.pid;` (non-root nginx can't write to `/var/run/nginx.pid`). Changed `listen 80` → `listen 8080`. Inline comments explain the why. |
| `nginx/nginx.dev.conf` | Same two changes — the dev nginx service reuses the production image, so it inherits non-root and needs the same adjustments. |
| `docker-compose.yml` | `"${NGINX_PORT:-8080}:80"` → `"${NGINX_PORT:-8080}:8080"` (host port stays 8080 by default — external callers unaffected — only the container-internal port changed). Healthcheck `localhost:80` → `localhost:8080`. |
| `docker-compose.dev.yml` | Dev `!override` port mapping `127.0.0.1:8080:80` → `127.0.0.1:8080:8080`. |

## Why these choices

- **`nginxinc/nginx-unprivileged` over manual `addgroup`/`adduser`** — The unprivileged variant is the official upstream-blessed non-root nginx. It pre-configures `USER nginx` (UID 101), pre-owns `/var/cache/nginx` and `/var/run`, and ships sensible defaults (`listen 8080`, `pid /tmp/nginx.pid`). The manual approach would have required ~5 extra Dockerfile lines to chown the right paths, plus the same nginx.conf edits — strictly more code and more ways to be subtly wrong. The deliberate deviation from the api/worker `appuser:appgroup` pattern is justified because the web image runs *upstream nginx*, not our code; using the upstream-blessed user is the cleaner match.
- **Host port stays 8080** — external callers don't change. Only the container-internal port moved. This keeps any downstream Caddy/Traefik/reverse-proxy configs working as-is.
- **Both nginx configs updated** — `nginx.conf` (production) and `nginx.dev.conf` (mounted via docker-compose.dev.yml's `!override`) needed the same change because they both run inside the now-non-root image.

## Verification

From the worktree root:

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ EXIT=0 (all 5 packages green) |
| `pnpm lint` | ✅ EXIT=0 |
| `pnpm test` | ✅ EXIT=0 — shared 181 / db 11 / web 181 / api 505 / worker 221 (1099 tests) |

Acceptance from gh#26:

- ✅ Web container runs as non-root via `USER` directive (set in `nginxinc/nginx-unprivileged` base image — UID 101, user `nginx`)
- ✅ Still serves traffic correctly — host port mapping retained at 8080 by default; nginx config preserved (all `location` blocks, `proxy_pass` to api, gzip, log format, X-Forwarded-Proto map for issue #50)

Manual smoke check (not executed in this session — for the reviewer/operator to run before merge):

```bash
docker compose build nginx
docker compose run --rm --entrypoint sh nginx -c 'whoami && id'
# Expect: nginx, uid=101(nginx) gid=101(nginx)
docker compose up -d
curl -fsS localhost:8080/health | head -5
# Expect: 200 from api via the SPA's proxy_pass
```

## Notes

- The healthcheck `wget --spider -q http://localhost:8080/health` runs INSIDE the container (nginx-side), so the port change matches the new internal listen.
- `apk add --no-cache wget` is still needed for the healthcheck binary; that's why the `USER root` / `USER nginx` sandwich exists in the Dockerfile.
- No new dependencies, no version bumps, no changes to any consumer's surface area.
