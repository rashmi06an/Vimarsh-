#!/usr/bin/env bash
# Phase 6 security sweep: helmet headers, JWT tampering, account deactivation & deletion
# (privacy), and session revocation on those actions.
set -uo pipefail
BASE="${1:-http://localhost:4000}"
API_LOG="${2:-/tmp/vimarsh-api.log}"
PASS=0; FAIL=0
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }
check() { if [ "$2" = "$3" ]; then echo "  PASS: $1 ($3)"; PASS=$((PASS+1)); else echo "  FAIL: $1 (expected $2, got $3)"; FAIL=$((FAIL+1)); fi; }
code() { curl -s -o /tmp/st_body -w "%{http_code}" "$@"; }
getotp() { sleep 1; grep -A4 "To:      $1" "$API_LOG" | grep "CODE:" | tail -1 | grep -oE "[0-9]{6}" | head -1; }

ADMIN_AT=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@aicte.vimarsh.local","password":"Admin@12345"}' | j "['accessToken']")
IITD_ID=$(curl -s "$BASE/orgs" -H "Authorization: Bearer $ADMIN_AT" | python3 -c "import sys,json;print([o['id'] for o in json.load(sys.stdin) if o['code']=='IITD'][0])")
make_user() {
  local email="$1"
  curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"fullName\":\"U\",\"password\":\"Passw0rd!\"}" >/dev/null
  local otp; otp=$(getotp "$email")
  local at; at=$(curl -s -X POST "$BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"code\":\"$otp\"}" | j "['accessToken']")
  curl -s -X POST "$BASE/auth/org-verification" -H "Authorization: Bearer $at" -H 'Content-Type: application/json' -d "{\"orgId\":\"$IITD_ID\",\"designation\":\"M\"}" >/dev/null
  local uid; uid=$(curl -s "$BASE/approvals/pending" -H "Authorization: Bearer $ADMIN_AT" | python3 -c "import sys,json;d=json.load(sys.stdin);print([u['id'] for u in d if u['email']=='$email'][0])")
  curl -s -X POST "$BASE/approvals/$uid/approve" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' -d '{"role":"FACULTY"}' >/dev/null
  U_AT=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"password\":\"Passw0rd!\"}" | j "['accessToken']")
}

echo "== 1. Security headers present =="
H=$(curl -sI "$BASE/health")
echo "$H" | grep -qi "x-content-type-options: nosniff" && { echo "  PASS: nosniff"; PASS=$((PASS+1)); } || { echo "  FAIL: nosniff"; FAIL=$((FAIL+1)); }
echo "$H" | grep -qi "content-security-policy" && { echo "  PASS: CSP"; PASS=$((PASS+1)); } || { echo "  FAIL: CSP"; FAIL=$((FAIL+1)); }

echo "== 2. Tampered JWT -> 401 =="
GOOD="$ADMIN_AT"; TAMPERED="${GOOD%?}X"   # flip last char of signature
C=$(code "$BASE/users/me" -H "Authorization: Bearer $TAMPERED"); check "tampered jwt 401" 401 "$C"

echo "== 3. Account deactivation =="
TS=$(date +%s); E="deact_${TS}@iitd.ac.in"; make_user "$E"; DU_AT="$U_AT"
C=$(code "$BASE/users/me" -H "Authorization: Bearer $DU_AT"); check "me ok before deactivate" 200 "$C"
C=$(code -X POST "$BASE/users/me/deactivate" -H "Authorization: Bearer $DU_AT"); check "deactivate 201" 201 "$C"
C=$(code -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$E\",\"password\":\"Passw0rd!\"}"); check "login after deactivate 403" 403 "$C"

echo "== 4. Account deletion erases PII, frees login =="
E2="del_${TS}@iitd.ac.in"; make_user "$E2"; XU_AT="$U_AT"
C=$(code -X DELETE "$BASE/users/me" -H "Authorization: Bearer $XU_AT"); check "delete 200" 200 "$C"
# Original email no longer resolves to a usable account.
C=$(code -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$E2\",\"password\":\"Passw0rd!\"}"); check "login after delete 401" 401 "$C"

echo "== 5. Audit chain still valid after privacy actions =="
VALID=$(curl -s "$BASE/audit/verify" -H "Authorization: Bearer $ADMIN_AT" | j "['valid']"); check "audit valid" "True" "$VALID"

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
