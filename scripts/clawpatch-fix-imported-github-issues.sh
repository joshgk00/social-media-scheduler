#!/usr/bin/env bash
set -euo pipefail

MAX=1
NO_COMMIT=0
ALLOW_DIRTY=0
STATUS="open"
REPAIR_ATTEMPTS=3
PARK_FAILED=0

usage() {
  cat <<'EOF'
Usage: scripts/clawpatch-fix-imported-github-issues.sh [flags]

Fixes Clawpatch findings imported from GitHub issues in BACKLOG.md order.

Flags:
  --max <n>        Maximum findings to attempt. Default: 1
  --no-commit      Leave successful fixes in the worktree
  --allow-dirty    Allow pre-existing source changes, only with --no-commit
  --status <s>     Queue status to process. Default: open
  --repair-attempts <n>
                   Repair retries after the initial fix attempt. Default: 3
  --park-failed    After retries are exhausted, save artifacts, mark the
                   finding uncertain, restore a clean worktree, commit the
                   status update, and continue. Requires auto-commit mode.
  -h, --help       Show this help
EOF
}

require_flag_value() {
  local flag="$1"
  local value="${2:-}"

  if [[ -z "$value" ]]; then
    echo "$flag requires a value" >&2
    usage >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --max)
      require_flag_value "$1" "${2:-}"
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
      require_flag_value "$1" "${2:-}"
      STATUS="${2:-}"
      shift 2
      ;;
    --status=*)
      STATUS="${1#--status=}"
      shift
      ;;
    --repair-attempts)
      require_flag_value "$1" "${2:-}"
      REPAIR_ATTEMPTS="${2:-}"
      shift 2
      ;;
    --repair-attempts=*)
      REPAIR_ATTEMPTS="${1#--repair-attempts=}"
      shift
      ;;
    --park-failed)
      PARK_FAILED=1
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

if ! [[ "$REPAIR_ATTEMPTS" =~ ^[0-9]+$ ]]; then
  echo "--repair-attempts must be a non-negative integer" >&2
  exit 2
fi

if [[ "$PARK_FAILED" -eq 1 && "$NO_COMMIT" -eq 1 ]]; then
  echo "--park-failed requires auto-commit mode so the worktree can stay clean before continuing" >&2
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
BASE_SHA=""

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

finding_title() {
  local finding_id="$1"
  clawpatch show --finding "$finding_id" --json | node -e "let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => { const parsed = JSON.parse(s); console.log(parsed.finding?.title ?? parsed.title ?? '$finding_id'); });"
}

issue_from_title() {
  local title="$1"
  local fallback="${2:-$title}"
  local issue
  issue="$(printf '%s\n' "$title" | sed -nE 's/^(gh#[0-9]+):.*/\1/p')"
  if [[ -n "$issue" ]]; then
    printf '%s\n' "$issue"
  else
    printf '%s\n' "$fallback"
  fi
}

attempt_fix_once() {
  local finding_id="$1"
  local post_result
  local post_outcome

  clawpatch fix --finding "$finding_id" --json || return $?

  post_result="$(clawpatch revalidate --finding "$finding_id" --json)" || return $?
  post_outcome="$(printf '%s\n' "$post_result" | node -e "let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => console.log(JSON.parse(s).outcome ?? 'unknown'));")"
  echo "post-fix revalidate: $post_outcome"

  if [[ "$post_outcome" != "fixed" ]]; then
    echo "finding did not revalidate as fixed: $finding_id => $post_outcome" >&2
    return 6
  fi

  pnpm typecheck || return $?
  pnpm lint || return $?
  pnpm test || return $?
}

save_failure_artifacts() {
  local finding_id="$1"
  local title="$2"
  local last_status="$3"
  local exhausted_attempts="$4"
  local stamp
  local safe_id
  local report_dir
  local untracked_file

  stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
  safe_id="$(printf '%s\n' "$finding_id" | sed -E 's/[^A-Za-z0-9_.-]+/-/g')"
  report_dir=".clawpatch/reports/overnight-failures/${stamp}-${safe_id}"
  mkdir -p "$report_dir"

  {
    echo "finding: $finding_id"
    echo "title: $title"
    echo "attempts: $exhausted_attempts"
    echo "last_exit: $last_status"
    echo "created_at: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  } >"$report_dir/summary.txt"

  git status --short >"$report_dir/status.txt"

  untracked_file="$report_dir/untracked-files.txt"
  git ls-files --others --exclude-standard >"$untracked_file"
  if [[ -s "$untracked_file" ]]; then
    while IFS= read -r path; do
      [[ -n "$path" ]] || continue
      git add -N -- "$path" >/dev/null 2>&1 || true
    done <"$untracked_file"
  fi

  git diff HEAD --binary >"$report_dir/diff.patch" || true
  git diff --cached --binary >"$report_dir/staged.diff.patch" || true
  printf '%s\n' "$report_dir"
}

restore_clean_worktree() {
  git reset --hard "$BASE_SHA" >/dev/null
  git clean -fd -e .clawpatch-nightly.lock >/dev/null
}

park_failed_finding() {
  local finding_id="$1"
  local title="$2"
  local last_status="$3"
  local exhausted_attempts="$4"
  local report_dir
  local issue
  local note

  report_dir="$(save_failure_artifacts "$finding_id" "$title" "$last_status" "$exhausted_attempts")"
  echo "parking failed finding after $exhausted_attempts attempt(s): $finding_id"
  echo "failure artifacts: $report_dir"

  restore_clean_worktree

  note="Parked by overnight runner after $exhausted_attempts failed fix attempt(s), last exit $last_status. Local artifacts: $report_dir"
  clawpatch triage --finding "$finding_id" --status uncertain --note "$note"

  git add .clawpatch/findings
  if git diff --cached --quiet; then
    echo "no Clawpatch status changes staged after parking $finding_id"
  else
    issue="$(issue_from_title "$title" "$finding_id")"
    git commit -m "Park ${issue}: failed Clawpatch repair" -m "Clawpatch finding: $finding_id" -m "$note"
  fi

  if [[ -n "$(source_status)" ]]; then
    echo "worktree is still dirty after parking $finding_id; stopping" >&2
    source_status >&2
    exit 8
  fi
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
  BASE_SHA="$(git rev-parse HEAD)"

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

  title="$(finding_title "$finding_id")"
  total_attempts=$((REPAIR_ATTEMPTS + 1))
  fix_status=1

  for fix_attempt in $(seq 1 "$total_attempts"); do
    if [[ "$fix_attempt" -eq 1 ]]; then
      echo "fix attempt $fix_attempt/$total_attempts for $finding_id"
    else
      echo "repair attempt $((fix_attempt - 1))/$REPAIR_ATTEMPTS for $finding_id"
    fi

    set +e
    attempt_fix_once "$finding_id"
    fix_status=$?
    set -e

    if [[ "$fix_status" -eq 0 ]]; then
      break
    fi

    echo "attempt $fix_attempt/$total_attempts failed for $finding_id with exit $fix_status" >&2
  done

  if [[ "$fix_status" -ne 0 ]]; then
    if [[ "$PARK_FAILED" -eq 1 ]]; then
      park_failed_finding "$finding_id" "$title" "$fix_status" "$total_attempts"
      completed=$((completed + 1))
      continue
    fi

    echo "stopping because all $total_attempts fix attempt(s) failed for $finding_id" >&2
    exit "$fix_status"
  fi

  if [[ "$NO_COMMIT" -eq 0 ]]; then
    issue="$(issue_from_title "$title" "$finding_id")"

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
