#!/usr/bin/env bash
set -euo pipefail

INTERVAL_SECONDS=1800
RUNS=0
MAX_PER_RUN=1
LOG_FILE="logs/clawpatch-overnight.log"
BACKGROUND=0

usage() {
  cat <<'EOF'
Usage: scripts/clawpatch-overnight-loop.sh [flags]

Runs imported GitHub-backed Clawpatch findings on an interval.

Flags:
  --interval-seconds <n>  Seconds between attempts. Default: 1800
  --runs <n>              Number of attempts before stopping. Default: 0 (unlimited)
  --max-per-run <n>       Findings per attempt. Default: 1
  --log <path>            Log file. Default: logs/clawpatch-overnight.log
  --background            Start with nohup in the background and print the PID
  -h, --help              Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
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
    --runs)
      RUNS="${2:-}"
      shift 2
      ;;
    --runs=*)
      RUNS="${1#--runs=}"
      shift
      ;;
    --max-per-run)
      MAX_PER_RUN="${2:-}"
      shift 2
      ;;
    --max-per-run=*)
      MAX_PER_RUN="${1#--max-per-run=}"
      shift
      ;;
    --log)
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

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
mkdir -p "$(dirname "$LOG_FILE")"

if [[ "$BACKGROUND" -eq 1 ]]; then
  nohup "$0" \
    --interval-seconds "$INTERVAL_SECONDS" \
    --runs "$RUNS" \
    --max-per-run "$MAX_PER_RUN" \
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
  {
    echo "=== $(date -u '+%Y-%m-%dT%H:%M:%SZ') attempt=$attempt ==="
    pnpm clawpatch:queue-gh -- next --plain || true
    pnpm clawpatch:fix-gh -- --max "$MAX_PER_RUN"
    echo "=== attempt=$attempt complete ==="
  } >>"$LOG_FILE" 2>&1 || {
    status=$?
    {
      echo "=== attempt=$attempt failed exit=$status ==="
      git status --short
    } >>"$LOG_FILE" 2>&1
    exit "$status"
  }

  if [[ "$RUNS" -ne 0 && "$attempt" -ge "$RUNS" ]]; then
    break
  fi
  sleep "$INTERVAL_SECONDS"
done
