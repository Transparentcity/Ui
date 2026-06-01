#!/usr/bin/env bash
# UI-side QA orchestrator.
#
# Runs the frontend-facing automated QA checks that live in this repo:
#   1. Multi-engine onboarding (Chromium + Firefox + WebKit)
#   2. Slow-3G banner contract (needs QA_AUTH0_EMAIL / PASSWORD)
#   3. Edge user states (D1 needs auth, D2 always runs, D6 stub)
#
# This is separate from the platform repo's full sweep (scripts/qa/run_qa.sh
# at the TransparentCITY root), which covers story content, data truth,
# WCAG, etc. The UI sweep focuses on the signup surface and post-signup
# user states because those are the parts that change with frontend
# deploys.
#
# Usage:
#   bash scripts/qa/run-qa.sh                       # all 3 engines, default site
#   bash scripts/qa/run-qa.sh --site https://staging.example
#   bash scripts/qa/run-qa.sh --skip-firefox        # drop Firefox pass
#   bash scripts/qa/run-qa.sh --skip-webkit         # drop WebKit pass
#   bash scripts/qa/run-qa.sh --only onboarding     # one check
#
# One-time setup:
#   npx playwright install chromium firefox webkit
#
# Exit codes:
#   0  every check ran clean
#   1  at least one check reported real findings
#   2  one or more checks crashed (Playwright missing, etc.)

set -u

SITE="${SITE:-https://transparent.city}"
ONLY=""
ENGINES="chromium,firefox,webkit"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --site) SITE="$2"; shift 2 ;;
    --skip-firefox) ENGINES="$(echo "$ENGINES" | sed 's/,firefox//; s/firefox,//; s/^firefox$//')"; shift ;;
    --skip-webkit) ENGINES="$(echo "$ENGINES" | sed 's/,webkit//; s/webkit,//; s/^webkit$//')"; shift ;;
    --only) ONLY="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

QA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$QA_DIR"

LOG_DIR="${LOG_DIR:-/tmp/ui_qa_logs}"
mkdir -p "$LOG_DIR"
rm -f "$LOG_DIR"/*.log 2>/dev/null || true

STEPS=()
RCS=()

run_step() {
  local name="$1"; shift
  if [[ -n "$ONLY" && "$ONLY" != "$name" ]]; then return 0; fi
  echo
  echo "==> $name"
  local logfile="$LOG_DIR/${name}.log"
  "$@" 2>&1 | tee "$logfile"
  local rc=${PIPESTATUS[0]}
  STEPS+=("$name")
  RCS+=("$rc")
  if [[ "$rc" != "0" ]]; then
    echo "  (step $name exited $rc, log: $logfile)" >&2
  fi
}

run_step "onboarding" \
  node onboarding-multi-engine.mjs --site "$SITE" --engines "$ENGINES"

run_step "user_states" \
  node user-states.mjs --site "$SITE"

run_step "slow_3g_banner" \
  node slow-3g-banner.mjs --site "$SITE"

# Summary
echo
echo "==> summary"
ANY_FAIL=0
ANY_ERROR=0
for i in "${!STEPS[@]}"; do
  name="${STEPS[$i]}"
  rc="${RCS[$i]}"
  if [[ "$rc" == "0" ]]; then
    echo "  OK     $name"
  elif [[ "$rc" == "1" ]]; then
    echo "  ISSUES $name (findings; see $LOG_DIR/${name}.log)"
    ANY_FAIL=1
  else
    echo "  ERROR  $name (rc=$rc)"
    ANY_ERROR=1
  fi
done

if [[ "$ANY_ERROR" == "1" ]]; then exit 2; fi
if [[ "$ANY_FAIL" == "1" ]]; then exit 1; fi
exit 0
