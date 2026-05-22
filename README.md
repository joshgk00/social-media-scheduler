# Social Media Scheduler

Self-hosted scheduler for composing, queueing, and publishing social posts.

## Development

```bash
pnpm install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
pnpm --filter @sms/web typecheck
pnpm --filter @sms/web build
```

The local app is available through the Vite dev server at `http://localhost:5173` and through the nginx dev proxy at `http://localhost:8080`.

## Design System

The current UI follows the redesign handoff in [design_handoff_sms_redesign/README.md](design_handoff_sms_redesign/README.md). The implementation order and definitions of done live in [design_handoff_sms_redesign/IMPLEMENTATION_PLAN.md](design_handoff_sms_redesign/IMPLEMENTATION_PLAN.md).

Screenshot references are indexed in [design_handoff_sms_redesign/screenshots/INDEX.md](design_handoff_sms_redesign/screenshots/INDEX.md), with screen captures grouped by product area under `design_handoff_sms_redesign/screenshots/`.
