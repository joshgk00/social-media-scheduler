---
name: next-from-backlog
description: Pick the next pending item from BACKLOG.md, verify its dependencies, and set up a git branch + worktree. Assistive-only — no autopilot, every side effect gated behind explicit user confirmation.
argument-hint: "[gh#NN | R-id | --section <name> | (no args for top-down walk)]"
---

# next-from-backlog

Your job is to pick the next actionable unit of work from `BACKLOG.md`, confirm its dependencies are satisfied, and set up the workspace (branch + worktree) so the user can begin implementation. You do not write code, run tests, or implement the issue — the user (or a follow-up agent) does that. Your value is correct identification of "what's next" plus zero-risk setup.

Operate in **assistive mode only**: every side effect (creating the branch, creating the worktree, editing `BACKLOG.md`) must wait for explicit user confirmation. If the user declines, the repository stays unchanged.

## Where things live

- `BACKLOG.md` at the repo root is the single index of pending work. It is walked top-down.
- The project's standards file is `CLAUDE.md` (Claude Code) or `AGENTS.md` (Codex) at the repo root — they cover the same content. References to "Definition of Done" point at whichever exists.
- Git worktrees go under `.claude/worktrees/<branch-name>/`. (This path is gitignored implicitly via existing tooling; verify with `git check-ignore` before creating if you're unsure.)

## How BACKLOG.md is structured

Section order, top to bottom:

1. `## Next up` (with `P0` / `P1` sub-sections)
2. `## Architectural Deepening` (Candidate 1 → 2 → 3 → …, with R-rows inside each)
3. `## Open issues — by category` (Bugs → Performance → Refactoring → Tests → Enhancements)

Row format examples — both shapes are valid:

- Pure GitHub-issue row: `- [ ] **gh#54** — Profile edit returns 500 ...`
- Refactor row: `- [ ] **R1.1** (gh#56) — Add Publisher interface + PublishFailure ...`

Status legend on the row prefix:

- `[ ]` pending — selectable
- `[~]` in progress — skip
- `[x]` done — skip
- `[-]` deferred / blocked — skip

Dependencies are not in `BACKLOG.md` — they live in the linked GitHub issue body, in a `## References` section, as one or more lines:

- `Depends on: #56` (single)
- `Depends on: #67, #68, #69, #70` (multiple)
- `Depends on: nothing (first in series)` — treat as no dependencies

## Arguments

Parse the user's arguments:

- **Empty** — walk top-down, pick the first selectable row.
- **`gh#NN`** or **`#NN`** — jump directly to that issue; skip the queue walk. Still run the dependency check.
- **`R1.1` / `R2.3` / etc.** — find the row in `BACKLOG.md` matching that R-id, extract its `gh#NN`, treat as above.
- **`--section refactor`** — restrict the walk to `## Architectural Deepening`.
- **`--section bugs`** — restrict the walk to `## Open issues — by category` → `### Bugs`.

Combinations are allowed: `--section refactor` with no specific R-id walks just the refactor section in order.

## Procedure

### 1. Read BACKLOG.md

Read the full file. Identify the section the user filtered to (or all sections, in order).

### 2. Pick a candidate row

Walking the relevant sections top-down, find the first `[ ]` row. Extract:

- **Issue number** — the `gh#NN` reference (always present on refactor rows; sometimes the row's title link on issue rows)
- **R-id** if present (e.g., `R1.1`)
- **Title text** — everything after the `—` separator

If no `[ ]` row exists in scope, report back: *"No pending items found in {section}."* and stop.

### 3. Fetch the issue

Run `gh issue view {NN} --json number,title,body,state,labels`. Parse:

- `state` must be `OPEN`. If it's `CLOSED` but the BACKLOG row is still `[ ]`, that's drift — flag it to the user and stop. Don't proceed; let the user decide whether to flip the row or pick another item.
- `body` — find the `## References` section and parse all `Depends on:` lines.

### 4. Dependency check

For every `#NN` in every `Depends on:` line:

- Run `gh issue view {NN} --json state` for each
- Collect a list of `{ dep_num, state }`

Treat as satisfied:

- `Depends on: nothing` / `Depends on: first in series` / `Depends on:` (empty) — no checks needed.
- All listed deps are `CLOSED`.

Treat as blocked:

- Any listed dep is `OPEN`. Either:
  - If the user passed no specific row (top-down walk): skip this row, continue walking, find the next selectable row. Note what was skipped and why so you can mention it in the final report.
  - If the user explicitly named this row (`gh#NN` or `R-id`): stop, list the open deps, do nothing else.

If a `Depends on:` line references an R-id rather than `#NN`: look up the matching `gh#NN` in `BACKLOG.md` (rows have both) and check that. If no mapping is found, treat as a hard error and report.

### 5. Build the branch name

Derive a slug from the issue title:

- Drop any leading `Rn.n — ` prefix (split on the first `—` or `-` and take the right side)
- Lowercase
- Replace any non-alphanumeric character with `-`
- Collapse runs of `-`
- Trim trailing `-`
- Truncate to 50 characters max, then trim trailing `-` again

Final branch name: `{gh-num}-{slug}`. Examples:

- gh#54 "Profile edit returns 500 ..." → `54-profile-edit-returns-500`
- gh#56 "R1.1 — Add Publisher interface + PublishFailure to @sms/shared" → `56-add-publisher-interface-publishfailure-to-sms-shared`

This pattern uses the GitHub issue number in place of the ADO work-item number from the user's global git-conventions rule.

### 6. Show the plan and ask for confirmation

Stop the agent loop here and ask the user, in clear prose, to confirm before any side effects happen. The exact mechanism depends on the agent:

- If your agent supports a structured confirmation tool (e.g., Claude Code's `AskUserQuestion`), use it. Present two options: *"Proceed — create the branch + worktree, flip the BACKLOG row to `[~]`"* and *"Cancel — do nothing"*.
- Otherwise, write the confirmation prompt as a question that ends the turn. Codex CLI and most other agents will naturally wait for the user's response. The user replies with "yes" / "proceed" / "go" or "no" / "cancel" / "stop" — interpret accordingly.

The confirmation prompt MUST include:

- The issue: `gh#{NN} — {title}` plus the first ~10 lines of the body for context
- The target branch: `{branch-name}`
- The target worktree: `.claude/worktrees/{branch-name}/`
- The dependency-check results: each dep with its state, or *"none / satisfied"*
- The suggested next step after setup (see Step 8)

If the user declines or signals cancel in any form, stop. Report what would have happened. Do not edit or create anything.

### 7. Execute (only after the user has confirmed)

In order:

a. **Verify clean working tree.** Run `git status --porcelain`. The output must be empty (or only contain untracked items that won't conflict with the worktree). If there are uncommitted modifications, abort and tell the user to commit or stash first; do not proceed. This is non-negotiable.

b. **Fetch latest.** Run `git fetch origin develop`. If `origin/develop` does not exist (some repos use `main`), stop and ask the user which base branch to use.

c. **Create the worktree and branch.** Run `git worktree add .claude/worktrees/{branch-name} -b {branch-name} origin/develop`. The new branch starts from `origin/develop`, never from the current branch — this avoids accidentally branching off a feature branch.

d. **Flip the BACKLOG.md row** to `[~]` and append a worktree note. For example:

   ```
   - [~] **gh#NN** — {original title} *(in worktree `.claude/worktrees/{branch-name}/`)*
   ```

   For refactor rows, preserve the `R-id` prefix.

e. **Verify the worktree.** Run `cd .claude/worktrees/{branch-name} && git log -1 --oneline` to confirm it points at the expected commit.

### 8. Final report

Tell the user, in prose:

- What was set up: branch name + worktree path + base commit hash
- The suggested next step. Pick based on the issue's first label and complexity:
  - `enhancement` + R-id (refactor work) → suggest `/gsd-execute-phase` or `/gsd-quick`
  - `bug` → suggest `/gsd-debug` or `/gsd-quick`
  - Anything else → suggest `/gsd-quick`
  Give a one-line invocation: `cd .claude/worktrees/{branch-name} && /gsd-quick "Issue gh#{NN}: {title}"`
- The BACKLOG row that was flipped (so the user can verify if they want)
- A **Definition of Done reminder**: the row can only flip to `[x]` after `pnpm test`, `pnpm typecheck`, and `pnpm lint` all pass from the repo root, every new file is committed, and the linked issue's acceptance criteria are met. The full version lives in `CLAUDE.md` (or `AGENTS.md`) — direct the user there if they want details.

Do NOT change directory in the parent shell yourself. Show the user the `cd` command they should run.

## Edge cases

- **`BACKLOG.md` is missing** — report and stop. Do not create it or assume defaults.
- **No `## References` section in the issue body** — treat as no dependencies. Most non-refactor issues will be in this state.
- **`Depends on:` references an R-id** — look up the matching `gh#NN` in `BACKLOG.md`. If no mapping is found, treat as a hard error and report.
- **The selected row's worktree path already exists** — likely a previous run was cancelled mid-flight. Ask the user: (a) reuse the existing worktree, (b) delete and recreate, or (c) pick a different row.
- **The picked branch name already exists** (locally or on the remote) — ask: reuse, delete and recreate, or pick a different row. Never force-delete without explicit confirmation.
- **`origin/develop` does not exist** — stop and ask. Fall back to `main` only if the user explicitly says so.

## Safety

- This skill MAY create branches and git worktrees. Both are local-only operations — no push, no remote-state change.
- This skill MAY edit `BACKLOG.md` to flip the picked row to `[~]`. This is a tracked file change; the confirmation gate prevents accidental edits.
- This skill MUST NOT push, commit, run tests, install dependencies, or invoke other slash commands. Its job ends at "branch and worktree ready; here is the next step the user should run."
- This skill MUST NOT operate on a dirty working tree. If `git status` shows uncommitted modifications, abort before creating the worktree — do not assume the user wants those carried along.
- This skill MUST honour the project's Definition of Done. Do not declare an item "done" or recommend flipping a row to `[x]`; that decision belongs to the user after the tests and checks have passed.
