#!/usr/bin/env bash
set -euo pipefail

MAX=1
STATUS="open"
TEST_RETRIES=1
ROBOREV_REPAIR_ATTEMPTS=1
ROBOREV_FIX_AGENT="codex"
INTERVAL_SECONDS=0
REVIEW_TIMEOUT_SECONDS=1800
STOP_ON_FAILURE=0

usage() {
  cat <<'EOF'
Usage: scripts/clawpatch-roborev-loop.sh [flags]

Fixes imported GitHub-backed Clawpatch findings one at a time, commits each
fixed finding, and gates progress on a local RoboRev review.

Flags:
  --max <n>                       Maximum findings to attempt. Default: 1
  --status <s>                    Queue status to process. Default: open
  --test-retries <n>              Retries for pnpm test after a failure. Default: 1
  --roborev-repair-attempts <n>   RoboRev fix attempts per finding. Default: 1
  --no-roborev-repair             Alias for --roborev-repair-attempts 0
  --roborev-fix-agent <agent>     Agent used to address RoboRev findings. Default: codex
  --interval-seconds <n>          Sleep between findings. Default: 0
  --review-timeout-seconds <n>    Max seconds to wait for each RoboRev review. Default: 1800
  --stop-on-failure               Stop instead of stashing failed work and moving on
  -h, --help                      Show this help

The loop requires a clean source worktree at the start of every finding. It
ignores local agent/runtime artifacts such as .agent, .agents, .claude, and
packages/web/.vite when checking and staging changes.
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
    --status)
      STATUS="${2:-}"
      shift 2
      ;;
    --status=*)
      STATUS="${1#--status=}"
      shift
      ;;
    --test-retries)
      TEST_RETRIES="${2:-}"
      shift 2
      ;;
    --test-retries=*)
      TEST_RETRIES="${1#--test-retries=}"
      shift
      ;;
    --roborev-repair-attempts)
      ROBOREV_REPAIR_ATTEMPTS="${2:-}"
      shift 2
      ;;
    --roborev-repair-attempts=*)
      ROBOREV_REPAIR_ATTEMPTS="${1#--roborev-repair-attempts=}"
      shift
      ;;
    --no-roborev-repair)
      ROBOREV_REPAIR_ATTEMPTS=0
      shift
      ;;
    --roborev-fix-agent)
      ROBOREV_FIX_AGENT="${2:-}"
      shift 2
      ;;
    --roborev-fix-agent=*)
      ROBOREV_FIX_AGENT="${1#--roborev-fix-agent=}"
      shift
      ;;
    --interval-seconds)
      INTERVAL_SECONDS="${2:-}"
      shift 2
      ;;
    --interval-seconds=*)
      INTERVAL_SECONDS="${1#--interval-seconds=}"
      shift
      ;;
    --review-timeout-seconds)
      REVIEW_TIMEOUT_SECONDS="${2:-}"
      shift 2
      ;;
    --review-timeout-seconds=*)
      REVIEW_TIMEOUT_SECONDS="${1#--review-timeout-seconds=}"
      shift
      ;;
    --stop-on-failure)
      STOP_ON_FAILURE=1
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

if ! [[ "$TEST_RETRIES" =~ ^[0-9]+$ ]]; then
  echo "--test-retries must be a non-negative integer" >&2
  exit 2
fi

if ! [[ "$ROBOREV_REPAIR_ATTEMPTS" =~ ^[0-9]+$ ]]; then
  echo "--roborev-repair-attempts must be a non-negative integer" >&2
  exit 2
fi

if ! [[ "$INTERVAL_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "--interval-seconds must be a non-negative integer" >&2
  exit 2
fi

if ! [[ "$REVIEW_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "--review-timeout-seconds must be a non-negative integer" >&2
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

require_clean_source_tree() {
  if [[ -n "$(source_status)" ]]; then
    echo "source worktree is dirty; commit or stash first" >&2
    source_status >&2
    exit 3
  fi
}

json_field() {
  local expr="$1"
  node -e "
let s = '';
process.stdin.on('data', d => s += d);
process.stdin.on('end', () => {
  const parsed = JSON.parse(s);
  const value = (${expr});
  if (value !== undefined && value !== null) console.log(value);
});
"
}

finding_title() {
  local finding_id="$1"
  local title
  title="$(clawpatch show --finding "$finding_id" --json \
    | json_field "parsed.finding?.title ?? parsed.title")"
  if [[ -z "$title" ]]; then
    title="$finding_id"
  fi
  printf '%s\n' "$title"
}

review_job_id() {
  local sha="$1"
  roborev show --json "$sha" \
    | json_field "parsed.job_id ?? parsed.id ?? parsed.job?.id"
}

run_with_retries() {
  local retries="$1"
  shift

  local attempt=1
  local max_attempts=$((retries + 1))

  while true; do
    if "$@"; then
      return 0
    fi

    if [[ "$attempt" -ge "$max_attempts" ]]; then
      return 1
    fi

    attempt=$((attempt + 1))
    echo "command failed; retrying ($attempt/$max_attempts): $*"
  done
}

run_with_timeout() {
  local timeout_seconds="$1"
  shift

  if [[ "$timeout_seconds" -eq 0 ]]; then
    "$@"
    return $?
  fi

  local marker
  marker="$(mktemp)"

  "$@" &
  local command_pid=$!

  (
    sleep "$timeout_seconds"
    if kill -0 "$command_pid" 2>/dev/null; then
      printf 'timeout\n' >"$marker"
      kill "$command_pid" 2>/dev/null || true
    fi
  ) &
  local timer_pid=$!

  set +e
  wait "$command_pid"
  local command_status=$?
  set -e

  kill "$timer_pid" 2>/dev/null || true
  wait "$timer_pid" 2>/dev/null || true

  if [[ -s "$marker" ]]; then
    rm -f "$marker"
    return 124
  fi

  rm -f "$marker"
  return "$command_status"
}

validate_repo() {
  pnpm typecheck
  pnpm lint
  run_with_retries "$TEST_RETRIES" pnpm test
}

include_stage_path() {
  case "$1" in
    .agent|.agent/*|.agents|.agents/*|.claude|.claude/*|skills-lock.json|packages/web/.vite|packages/web/.vite/*)
      return 1
      ;;
    *)
      return 0
      ;;
  esac
}

stage_changed_files() {
  local paths=()
  local path

  while IFS= read -r -d '' path; do
    if include_stage_path "$path"; then
      paths+=("$path")
    fi
  done < <(git diff --name-only -z)

  while IFS= read -r -d '' path; do
    if include_stage_path "$path"; then
      paths+=("$path")
    fi
  done < <(git ls-files --others --exclude-standard -z)

  if [[ "${#paths[@]}" -eq 0 ]]; then
    return 0
  fi

  git add -- "${paths[@]}"
}

commit_current_changes() {
  local subject="$1"
  local body="$2"

  stage_changed_files

  if git diff --cached --quiet; then
    echo "no source changes staged"
    return 1
  fi

  git commit -m "$subject" -m "$body"
}

stash_failed_work() {
  local finding_id="$1"

  if [[ -z "$(source_status)" ]]; then
    return 0
  fi

  git stash push -u -m "clawpatch-roborev failed ${finding_id}" -- \
    . \
    ':!/.agent' \
    ':!/.agents' \
    ':!/.claude' \
    ':!/skills-lock.json' \
    ':!packages/web/.vite'
}

handle_finding_failure() {
  local finding_id="$1"
  local reason="$2"

  echo "finding failed: $finding_id: $reason" >&2

  if [[ "$STOP_ON_FAILURE" -eq 1 ]]; then
    exit 6
  fi

  if ! stash_failed_work "$finding_id"; then
    echo "failed to stash failed work for $finding_id; stopping to avoid a contaminated worktree" >&2
    exit 6
  fi

  return 0
}

wait_for_review_or_repair() {
  local finding_id="$1"
  local issue="$2"
  local review_sha
  review_sha="$(git rev-parse HEAD)"

  local repair_attempt=0
  while true; do
    echo "waiting for RoboRev review of $review_sha"

    set +e
    run_with_timeout "$REVIEW_TIMEOUT_SECONDS" roborev wait "$review_sha"
    local review_status=$?
    set -e

    if [[ "$review_status" -eq 0 ]]; then
      roborev show "$review_sha"
      return 0
    fi

    if [[ "$review_status" -eq 124 ]]; then
      echo "RoboRev review timed out for $review_sha after ${REVIEW_TIMEOUT_SECONDS}s" >&2
      return 8
    fi

    echo "RoboRev found issues for $review_sha" >&2
    roborev show "$review_sha" >&2 || true

    if [[ "$repair_attempt" -ge "$ROBOREV_REPAIR_ATTEMPTS" ]]; then
      echo "stopping after RoboRev failure; repair attempts exhausted" >&2
      return 8
    fi

    repair_attempt=$((repair_attempt + 1))
    local job_id
    job_id="$(review_job_id "$review_sha")"
    if [[ -z "$job_id" ]]; then
      echo "could not determine RoboRev job id for $review_sha" >&2
      return 8
    fi

    echo "attempting RoboRev repair $repair_attempt/$ROBOREV_REPAIR_ATTEMPTS with $ROBOREV_FIX_AGENT for job $job_id"
    roborev fix --agent "$ROBOREV_FIX_AGENT" "$job_id"

    validate_repo

    if [[ -n "$(source_status)" ]]; then
      commit_current_changes \
        "Address RoboRev feedback for ${issue}" \
        "RoboRev review for: ${review_sha}" \
        || true
    fi

    local new_sha
    new_sha="$(git rev-parse HEAD)"
    if [[ "$new_sha" == "$review_sha" ]]; then
      echo "RoboRev repair did not create a new commit" >&2
      return 8
    fi
    review_sha="$new_sha"

    clawpatch revalidate --finding "$finding_id" --json >/dev/null
  done
}

require_command clawpatch
require_command git
require_command node
require_command pnpm
require_command roborev

require_clean_source_tree

completed=0

while [[ "$completed" -lt "$MAX" ]]; do
  require_clean_source_tree

  if ! finding_id="$(node scripts/clawpatch-imported-queue.mjs next --plain --status "$STATUS")"; then
    echo "no imported GitHub issue findings with status '$STATUS'"
    break
  fi

  title="$(finding_title "$finding_id")"
  issue="$(printf '%s\n' "$title" | sed -nE 's/^(gh#[0-9]+):.*/\1/p')"
  if [[ -z "$issue" ]]; then
    issue="$finding_id"
  fi
  subject_title="$(printf '%s\n' "$title" | sed -E 's/^gh#[0-9]+:[[:space:]]*//')"

  echo "[$((completed + 1))/$MAX] selected $finding_id"
  echo "$title"

  pre_result="$(clawpatch revalidate --finding "$finding_id" --json)"
  pre_outcome="$(printf '%s\n' "$pre_result" | json_field "parsed.outcome ?? 'unknown'")"
  echo "pre-fix revalidate: $pre_outcome"

  if [[ "$pre_outcome" == "fixed" || "$pre_outcome" == "false-positive" || "$pre_outcome" == "wont-fix" ]]; then
    completed=$((completed + 1))
    continue
  fi

  if [[ "$pre_outcome" != "open" ]]; then
    handle_finding_failure "$finding_id" "pre-fix revalidation returned '$pre_outcome'"
    completed=$((completed + 1))
    continue
  fi

  set +e
  clawpatch fix --finding "$finding_id" --json
  fix_status=$?
  set -e
  if [[ "$fix_status" -ne 0 ]]; then
    echo "clawpatch fix exited $fix_status; continuing only if revalidation and local checks pass"
  fi

  post_result="$(clawpatch revalidate --finding "$finding_id" --json)"
  post_outcome="$(printf '%s\n' "$post_result" | json_field "parsed.outcome ?? 'unknown'")"
  echo "post-fix revalidate: $post_outcome"

  if [[ "$post_outcome" != "fixed" ]]; then
    handle_finding_failure "$finding_id" "post-fix revalidation returned '$post_outcome'"
    completed=$((completed + 1))
    continue
  fi

  if ! validate_repo; then
    handle_finding_failure "$finding_id" "validation failed"
    completed=$((completed + 1))
    continue
  fi

  if ! commit_current_changes \
    "Fix ${issue}: ${subject_title}" \
    "Clawpatch finding: ${finding_id}"; then
    completed=$((completed + 1))
    continue
  fi

  if ! wait_for_review_or_repair "$finding_id" "$issue"; then
    echo "RoboRev gate failed for $finding_id" >&2
    exit 8
  fi

  completed=$((completed + 1))
  echo "completed $finding_id"

  if [[ "$completed" -lt "$MAX" && "$INTERVAL_SECONDS" -gt 0 ]]; then
    sleep "$INTERVAL_SECONDS"
  fi
done

echo "finished: completed $completed finding(s)"
