#!/usr/bin/env bash
set -euo pipefail

INTERVAL_SECONDS=1800
RUNS=0
MAX_PER_RUN=1
LOG_FILE="logs/clawpatch-overnight.log"
BACKGROUND=0
REPAIR_ATTEMPTS=3

usage() {
  cat <<'EOF'
Usage: scripts/clawpatch-overnight-loop.sh [flags]

Runs imported GitHub-backed Clawpatch findings on an interval.

Flags:
  --interval-seconds <n>  Seconds between attempts. Default: 1800
  --runs <n>              Number of attempts before stopping. Default: 0 (unlimited)
  --max-per-run <n>       Findings per attempt. Default: 1
  --repair-attempts <n>   Repair retries after the initial fix attempt.
                          Default: 3
  --log <path>            Log file. Default: logs/clawpatch-overnight.log
  --background            Start with nohup in the background and print the PID
  -h, --help              Show this help
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
    --interval-seconds)
      require_flag_value "$1" "${2:-}"
      INTERVAL_SECONDS="${2:-}"
      shift 2
      ;;
    --interval-seconds=*)
      INTERVAL_SECONDS="${1#--interval-seconds=}"
      shift
      ;;
    --runs)
      require_flag_value "$1" "${2:-}"
      RUNS="${2:-}"
      shift 2
      ;;
    --runs=*)
      RUNS="${1#--runs=}"
      shift
      ;;
    --max-per-run)
      require_flag_value "$1" "${2:-}"
      MAX_PER_RUN="${2:-}"
      shift 2
      ;;
    --max-per-run=*)
      MAX_PER_RUN="${1#--max-per-run=}"
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
    --log)
      require_flag_value "$1" "${2:-}"
      LOG_FILE="${2:-}"
      shift 2
      ;;
    --log=*)
      LOG_FILE="${1#--log=}"
      shift
      ;;
    --background)
      BACKGROUND=1
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

if ! [[ "$INTERVAL_SECONDS" =~ ^[0-9]+$ ]] || [[ "$INTERVAL_SECONDS" -lt 60 ]]; then
  echo "--interval-seconds must be an integer >= 60" >&2
  exit 2
fi

if ! [[ "$RUNS" =~ ^[0-9]+$ ]]; then
  echo "--runs must be a non-negative integer" >&2
  exit 2
fi

if ! [[ "$MAX_PER_RUN" =~ ^[0-9]+$ ]] || [[ "$MAX_PER_RUN" -lt 1 ]]; then
  echo "--max-per-run must be a positive integer" >&2
  exit 2
fi

if ! [[ "$REPAIR_ATTEMPTS" =~ ^[0-9]+$ ]]; then
  echo "--repair-attempts must be a non-negative integer" >&2
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
mkdir -p "$(dirname "$LOG_FILE")"

if [[ "$BACKGROUND" -eq 1 ]]; then
  nohup "$0" \
    --interval-seconds "$INTERVAL_SECONDS" \
    --runs "$RUNS" \
    --max-per-run "$MAX_PER_RUN" \
    --repair-attempts "$REPAIR_ATTEMPTS" \
    --log "$LOG_FILE" \
    >>"$LOG_FILE" 2>&1 &
  echo "$!"
  exit 0
fi

LOCK_DIR=".clawpatch-nightly.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "another clawpatch overnight loop is already running: $LOCK_DIR" >&2
  exit 7
fi
trap 'rmdir "$LOCK_DIR"' EXIT

attempt=0
while [[ "$RUNS" -eq 0 || "$attempt" -lt "$RUNS" ]]; do
  attempt=$((attempt + 1))
  set +e
  {
    echo "=== $(date -u '+%Y-%m-%dT%H:%M:%SZ') attempt=$attempt ==="
    pnpm clawpatch:queue-gh -- next --plain || true
    pnpm clawpatch:fix-gh -- --max "$MAX_PER_RUN" --repair-attempts "$REPAIR_ATTEMPTS" --park-failed
  } >>"$LOG_FILE" 2>&1
  status=$?
  set -e

  if [[ "$status" -ne 0 ]]; then
    {
      echo "=== attempt=$attempt failed exit=$status ==="
      git status --short
    } >>"$LOG_FILE" 2>&1
    exit "$status"
  fi

  echo "=== attempt=$attempt complete ===" >>"$LOG_FILE" 2>&1

  if [[ "$RUNS" -ne 0 && "$attempt" -ge "$RUNS" ]]; then
    break
  fi
  sleep "$INTERVAL_SECONDS"
done
