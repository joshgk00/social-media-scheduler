---
name: clawpatch-overnight
description: Starts and monitors the repo's overnight Clawpatch GitHub issue batch loop. Use when the user asks to kick off, run, monitor, stop, or inspect overnight/autonomous Clawpatch fixes for this repo.
---

# Clawpatch Overnight

## Purpose

Run imported GitHub-backed Clawpatch findings in small timed batches. Default policy: one finding every 30 minutes, with one commit per fixed finding.

## Before Starting

1. Confirm the repo root:
   ```bash
   pwd
   ```
2. Confirm the source worktree is clean:
   ```bash
   git status --short
   ```
3. Confirm the next finding:
   ```bash
   pnpm clawpatch:queue-gh -- next --plain
   clawpatch show --finding "$(pnpm clawpatch:queue-gh -- next --plain | tail -1)"
   ```

If the worktree is dirty, do not start the loop. Report the dirty files and ask whether to commit, stash, or stop.

## Start

Start a bounded overnight run in the background:

```bash
scripts/clawpatch-overnight-loop.sh --runs 12 --background
```

This runs for about six hours: one finding per 30-minute interval.

For a shorter smoke run:

```bash
scripts/clawpatch-overnight-loop.sh --runs 2 --background
```

Equivalent package-script form:

```bash
pnpm clawpatch:overnight -- --runs 2 --background
```

For foreground execution:

```bash
scripts/clawpatch-overnight-loop.sh --runs 12
```

## Monitor

```bash
tail -n 120 logs/clawpatch-overnight.log
git status --short
git log --oneline -8
```

The loop stops on failed validation, failed revalidation, or a dirty worktree. That is expected safety behavior.

## Stop

Find and stop the loop:

```bash
pgrep -fl clawpatch-overnight-loop
pkill -f clawpatch-overnight-loop
```

Then remove a stale lock only if no loop process remains:

```bash
rmdir .clawpatch-nightly.lock
```

## Morning Review

1. Inspect commits:
   ```bash
   git log --oneline --decorate --stat origin/develop..HEAD
   ```
2. Verify queue state:
   ```bash
   pnpm clawpatch:queue-gh -- list --plain | head -20
   ```
3. Run gates if the last loop stopped before validation:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```
4. Prepare one PR per coherent batch, not one PR per finding unless the change is risky.
