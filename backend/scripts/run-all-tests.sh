#!/usr/bin/env bash
# Runs every backend test suite in sequence, with a cooldown between suites so the
# login/registration rate limiter (which the suites deliberately exercise) resets.
# Usage: ./scripts/run-all-tests.sh   (API must be running on :4000)
set -uo pipefail
BASE="${1:-http://localhost:4000}"
LOG="${2:-/tmp/vimarsh-api.log}"
DIR="$(cd "$(dirname "$0")" && pwd)"
COOLDOWN=65
TOTAL_PASS=0; TOTAL_FAIL=0

run() {
  local name="$1"; shift
  echo; echo "══════════════════════════════════════════════════════"
  echo "▶ $name"
  echo "══════════════════════════════════════════════════════"
  local out; out="$("$@" 2>&1)"
  echo "$out" | tail -40
  local line; line="$(echo "$out" | grep -E '^RESULT:' | tail -1)"
  local p f
  p="$(echo "$line" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+')"
  f="$(echo "$line" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+')"
  TOTAL_PASS=$((TOTAL_PASS + ${p:-0}))
  TOTAL_FAIL=$((TOTAL_FAIL + ${f:-0}))
}

cool() { echo; echo "… cooling down ${COOLDOWN}s (rate-limit reset) …"; node -e "setTimeout(()=>process.exit(0),${COOLDOWN}000)"; }

run "Auth / RBAC / audit (smoke)"   bash "$DIR/smoke-test.sh" "$BASE" "$LOG"; cool
run "Meetings"                      bash "$DIR/meetings-test.sh" "$BASE" "$LOG"; cool
run "Live conferencing (LiveKit)"   bash "$DIR/livekit-test.sh" "$BASE" "$LOG"; cool
run "Realtime (Socket.IO)"          node "$DIR/realtime-test.mjs"; cool
run "Documents + recording"         bash "$DIR/documents-test.sh" "$BASE" "$LOG"; cool
run "Encryption at rest (documents)" node "$DIR/encryption-test.mjs"; cool
run "Security sweep"                bash "$DIR/security-test.sh" "$BASE" "$LOG"

echo; echo "══════════════════════════════════════════════════════"
echo "GRAND TOTAL: $TOTAL_PASS passed, $TOTAL_FAIL failed"
echo "══════════════════════════════════════════════════════"
[ "$TOTAL_FAIL" -eq 0 ]
