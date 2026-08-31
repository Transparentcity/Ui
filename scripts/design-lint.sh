#!/usr/bin/env bash
# Design-system drift lint. Counts violations of the CLAUDE.md design rules and
# compares them against the committed baseline (scripts/design-lint.baseline).
# Fails (exit 1) only if a count EXCEEDS the baseline — existing debt is
# grandfathered; new debt is not. Refresh the baseline deliberately with:
#   scripts/design-lint.sh --update-baseline
set -euo pipefail
cd "$(dirname "$0")/.."

BASELINE_FILE="scripts/design-lint.baseline"

count_hex_tsx() {
  grep -rhoE --include="*.tsx" '#[0-9a-fA-F]{6}\b' src | wc -l | tr -d ' '
}
count_hex_css() {
  find src -name "*.css" -exec cat {} + | grep -oE '#[0-9a-fA-F]{6}\b' | wc -l | tr -d ' '
}
count_bracket_px() {
  grep -rhoE --include="*.tsx" 'text-\[[0-9]+px\]' src | wc -l | tr -d ' '
}
count_border_left() {
  { find src -name "*.css" -exec cat {} + | grep -cE 'border-left:\s*[0-9]+px\s+solid' || true; } | tr -d ' '
}

HEX_TSX=$(count_hex_tsx); HEX_CSS=$(count_hex_css)
BRACKET=$(count_bracket_px); BLEFT=$(count_border_left)

if [[ "${1:-}" == "--update-baseline" ]]; then
  printf "hex_tsx=%s\nhex_css=%s\nbracket_px=%s\nborder_left=%s\n" \
    "$HEX_TSX" "$HEX_CSS" "$BRACKET" "$BLEFT" > "$BASELINE_FILE"
  echo "baseline updated: $(cat "$BASELINE_FILE" | tr '\n' ' ')"
  exit 0
fi

if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "No baseline file; run scripts/design-lint.sh --update-baseline first." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$BASELINE_FILE"

fail=0
check() { # name current baseline
  if (( $2 > $3 )); then
    echo "FAIL $1: $2 (baseline $3) — new violations introduced"
    fail=1
  else
    echo "ok   $1: $2 (baseline $3)"
  fi
}
check "raw hex in tsx"        "$HEX_TSX" "$hex_tsx"
check "raw hex in css"        "$HEX_CSS" "$hex_css"
check "text-[Npx] sizes"      "$BRACKET" "$bracket_px"
check "border-left accents"   "$BLEFT"   "$border_left"
exit $fail
