# GitHub Issues to Clawpatch

This repo can mirror backlog-ordered GitHub issues into local Clawpatch findings so the Clawpatch fix loop can work through them one at a time.

## Import Issues

Import the next pending backlog issue:

```bash
pnpm clawpatch:import-gh -- --limit 1
```

Import a larger overnight queue:

```bash
pnpm clawpatch:import-gh -- --limit 10
```

Import specific issues:

```bash
pnpm clawpatch:import-gh -- --issue 85 --issue 78
```

The importer reads `BACKLOG.md`, fetches issue bodies with `gh issue view`, extracts existing file paths as Clawpatch owned files, and writes local `.clawpatch/features/*.json` plus `.clawpatch/findings/*.json`.

Durable Clawpatch queue state is tracked under `.clawpatch/features` and `.clawpatch/findings`. Volatile execution artifacts (`locks`, `patches`, `reports`, `runs`) stay ignored, alongside local agent skills/worktrees and Vite cache paths.

## Inspect Queue

```bash
pnpm clawpatch:queue-gh -- list
pnpm clawpatch:queue-gh -- next
pnpm clawpatch:queue-gh -- next --plain
```

The queue uses the `backlog-order:*` tag written by the importer, so it follows `BACKLOG.md` rather than Clawpatch severity ranking.

## Run Fixes

Start from a clean source worktree. Then run:

```bash
pnpm clawpatch:fix-gh -- --max 3
```

For manual review without commits:

```bash
pnpm clawpatch:fix-gh -- --max 3 --no-commit
```

The runner performs:

1. Select next imported GitHub finding in backlog order.
2. `clawpatch revalidate --finding`.
3. `clawpatch fix --finding`.
4. `clawpatch revalidate --finding`.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`.
6. Commit the source changes unless `--no-commit` is set.

Clawpatch's own `format` validation command is disabled in `.clawpatch/config.json`. Do not point it at `pnpm format`: that command writes across the whole repository and can create huge unrelated diffs during automated fixes. Use targeted formatting during implementation and rely on the runner's non-mutating validation gates for the batch.

The runner stages durable Clawpatch status updates with each successful fix. It still excludes local agent state, `skills-lock.json`, and Vite cache paths from auto-staging.
