#!/usr/bin/env bash
set -euo pipefail

MAX=1
NO_COMMIT=0
ALLOW_DIRTY=0
STATUS="open"

usage() {
  cat <<'EOF'
Usage: scripts/clawpatch-fix-imported-github-issues.sh [flags]

Fixes Clawpatch findings imported from GitHub issues in BACKLOG.md order.

Flags:
  --max <n>        Maximum findings to attempt. Default: 1
  --no-commit      Leave successful fixes in the worktree
  --allow-dirty    Allow pre-existing source changes, only with --no-commit
  --status <s>     Queue status to process. Default: open
  -h, --help       Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --max)
      MAX="${2:-}"
      shift 2
      ;;
    --max=*)
      MAX="${1#--max=}"
      shift
      ;;
    --no-commit)
      NO_COMMIT=1
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    --status)
      STATUS="${2:-}"
      shift 2
      ;;
    --status=*)
      STATUS="${1#--status=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! [[ "$MAX" =~ ^[0-9]+$ ]] || [[ "$MAX" -lt 1 ]]; then
  echo "--max must be a positive integer" >&2
  exit 2
fi

if [[ "$ALLOW_DIRTY" -eq 1 && "$NO_COMMIT" -eq 0 ]]; then
  echo "--allow-dirty is only supported with --no-commit; start from a clean worktree for auto-commits" >&2
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 127
  fi
}

source_status() {
  git status --porcelain -- \
    ':!/.agent' \
    ':!/.agents' \
    ':!/.claude' \
    ':!/skills-lock.json' \
    ':!packages/web/.vite'
}

require_command clawpatch
require_command node
require_command pnpm

if [[ "$ALLOW_DIRTY" -eq 0 && -n "$(source_status)" ]]; then
  echo "source worktree is dirty; commit/stash first or rerun with --allow-dirty --no-commit" >&2
  source_status >&2
  exit 3
fi

completed=0

while [[ "$completed" -lt "$MAX" ]]; do
  if ! finding_id="$(node scripts/clawpatch-imported-queue.mjs next --plain --status "$STATUS")"; then
    echo "no imported GitHub issue findings with status '$STATUS'"
    break
  fi

  echo "[$((completed + 1))/$MAX] selected $finding_id"

  pre_result="$(clawpatch revalidate --finding "$finding_id" --json)"
  pre_outcome="$(printf '%s\n' "$pre_result" | node -e "let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => console.log(JSON.parse(s).outcome ?? 'unknown'));")"
  echo "pre-fix revalidate: $pre_outcome"

  if [[ "$pre_outcome" == "fixed" || "$pre_outcome" == "false-positive" || "$pre_outcome" == "wont-fix" ]]; then
    completed=$((completed + 1))
    continue
  fi

  if [[ "$pre_outcome" != "open" ]]; then
    echo "stopping because revalidation returned '$pre_outcome' for $finding_id" >&2
    exit 6
  fi

  clawpatch fix --finding "$finding_id" --json

  post_result="$(clawpatch revalidate --finding "$finding_id" --json)"
  post_outcome="$(printf '%s\n' "$post_result" | node -e "let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => console.log(JSON.parse(s).outcome ?? 'unknown'));")"
  echo "post-fix revalidate: $post_outcome"

  if [[ "$post_outcome" != "fixed" ]]; then
    echo "stopping because finding did not revalidate as fixed: $finding_id => $post_outcome" >&2
    exit 6
  fi

  pnpm typecheck
  pnpm lint
  pnpm test

  if [[ "$NO_COMMIT" -eq 0 ]]; then
    title="$(clawpatch show --finding "$finding_id" --json | node -e "let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => { const parsed = JSON.parse(s); console.log(parsed.finding?.title ?? parsed.title ?? '$finding_id'); });")"
    issue="$(printf '%s\n' "$title" | sed -nE 's/^(gh#[0-9]+):.*/\1/p')"
    if [[ -z "$issue" ]]; then
      issue="$finding_id"
    fi

    git add -A -- \
      ':!/.agent' \
      ':!/.agents' \
      ':!/.claude' \
      ':!/skills-lock.json' \
      ':!packages/web/.vite'

    if git diff --cached --quiet; then
      echo "no source changes staged after fixing $finding_id"
    else
      git commit -m "Fix ${issue}: ${title#gh#[0-9]*: }" -m "Clawpatch finding: $finding_id"
    fi
  fi

  completed=$((completed + 1))
done

echo "finished: attempted $completed finding(s)"
