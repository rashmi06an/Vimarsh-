#!/usr/bin/env bash
# End-to-end smoke test against a running Vimarsh API (default http://localhost:4000).
# Exercises: health, registration, duplicate guard, OTP verify, status gating,
# approval workflow, role-based 403s, cross-org denial, and audit chain verification.
# OTP is read from the API log (dev fallback) passed as $2.
set -uo pipefail
BASE="${1:-http://localhost:4000}"
API_LOG="${2:-/tmp/vimarsh-api.log}"
PASS=0; FAIL=0
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }
check() { # desc expected actual
  if [ "$2" = "$3" ]; then echo "  PASS: $1 ($3)"; PASS=$((PASS+1)); else echo "  FAIL: $1 (expected $2, got $3)"; FAIL=$((FAIL+1)); fi
}
code() { curl -s -o /tmp/vt_body -w "%{http_code}" "$@"; }

EMAIL="faculty_$(date +%s)@iitd.ac.in"
echo "== 1. Health =="
C=$(code "$BASE/health"); check "health 200" 200 "$C"
EMAILCFG=$(cat /tmp/vt_body | j "['providers']['email']"); check "email provider honestly 'not-configured'" "not-configured" "$EMAILCFG"

echo "== 2. Register =="
C=$(code -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"fullName\":\"Test Faculty\",\"password\":\"Passw0rd!\"}"); check "register 201" 201 "$C"

echo "== 3. Duplicate register rejected =="
C=$(code -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"fullName\":\"Test Faculty\",\"password\":\"Passw0rd!\"}"); check "duplicate 409" 409 "$C"

echo "== 4. Mass-assignment / unknown field rejected =="
C=$(code -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"x_$EMAIL\",\"fullName\":\"X\",\"password\":\"Passw0rd!\",\"role\":\"SUPER_ADMIN\"}"); check "unknown field 'role' -> 400" 400 "$C"

echo "== 5. Login before verify -> 403 =="
C=$(code -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Passw0rd!\"}"); check "login pre-verify 403" 403 "$C"

echo "== 6. Read OTP from dev log and verify (now issues a session) =="
sleep 1
OTP=$(grep -A4 "To:      $EMAIL" "$API_LOG" | grep "CODE:" | tail -1 | grep -oE "[0-9]{6}" | head -1)
echo "  (captured OTP: ${OTP:-NONE})"
C=$(code -X POST "$BASE/auth/verify-otp" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"code\":\"$OTP\"}"); check "verify-otp 201" 201 "$C"
USER_AT=$(cat /tmp/vt_body | j "['accessToken']")
VSTATUS=$(cat /tmp/vt_body | j "['status']"); check "status now PENDING_APPROVAL" "PENDING_APPROVAL" "$VSTATUS"

echo "== 7. Verified-but-unapproved user CAN sign in (to see status) =="
C=$(code -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Passw0rd!\"}"); check "login pending-approval 201" 201 "$C"
LSTATUS=$(cat /tmp/vt_body | j "['user']['status']"); check "login status PENDING_APPROVAL" "PENDING_APPROVAL" "$LSTATUS"

echo "== 7b. ...but a pending GUEST still gets 403 on real features =="
C=$(code "$BASE/approvals/pending" -H "Authorization: Bearer $USER_AT"); check "pending user /approvals 403" 403 "$C"

echo "== 8. Super Admin login =="
C=$(code -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@aicte.vimarsh.local","password":"Admin@12345"}'); check "admin login 201" 201 "$C"
ADMIN_AT=$(cat /tmp/vt_body | j "['accessToken']")
ADMIN_RT=$(cat /tmp/vt_body | j "['refreshToken']")

echo "== 9. Org verification submitted by the user with their own token =="
IITD_ID=$(curl -s "$BASE/orgs" -H "Authorization: Bearer $USER_AT" | python3 -c "import sys,json;print([o['id'] for o in json.load(sys.stdin) if o['code']=='IITD'][0])")
echo "  IITD org id: $IITD_ID"
C=$(code -X POST "$BASE/auth/org-verification" -H "Authorization: Bearer $USER_AT" \
  -H 'Content-Type: application/json' -d "{\"orgId\":\"$IITD_ID\",\"designation\":\"Assistant Professor\"}"); check "org-verification 201" 201 "$C"

echo "== 10. Pending list (Super Admin) contains our user =="
PENDING_ID=$(curl -s "$BASE/approvals/pending" -H "Authorization: Bearer $ADMIN_AT" | python3 -c "import sys,json;d=json.load(sys.stdin);print([u['id'] for u in d if u['email']=='$EMAIL'][0])" 2>/dev/null)
if [ -n "${PENDING_ID:-}" ]; then echo "  PASS: user in pending list ($PENDING_ID)"; PASS=$((PASS+1)); else echo "  FAIL: user not in pending list"; FAIL=$((FAIL+1)); fi

echo "== 11. Approve as FACULTY =="
C=$(code -X POST "$BASE/approvals/$PENDING_ID/approve" -H "Authorization: Bearer $ADMIN_AT" \
  -H 'Content-Type: application/json' -d '{"role":"FACULTY"}'); check "approve 201" 201 "$C"

echo "== 12. User can now login =="
C=$(code -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Passw0rd!\"}"); check "faculty login 201" 201 "$C"
FAC_AT=$(cat /tmp/vt_body | j "['accessToken']")
FAC_ROLE=$(cat /tmp/vt_body | j "['user']['role']"); check "role is FACULTY" "FACULTY" "$FAC_ROLE"

echo "== 13. AUTHORIZATION: Faculty hitting admin APIs -> 403 =="
C=$(code "$BASE/approvals/pending" -H "Authorization: Bearer $FAC_AT"); check "faculty /approvals/pending 403" 403 "$C"
C=$(code -X POST "$BASE/orgs" -H "Authorization: Bearer $FAC_AT" -H 'Content-Type: application/json' \
  -d '{"name":"Hack","type":"INSTITUTE","code":"HACK1"}'); check "faculty create org 403" 403 "$C"
C=$(code "$BASE/audit/verify" -H "Authorization: Bearer $FAC_AT"); check "faculty /audit/verify 403" 403 "$C"

echo "== 14. No token -> 401 =="
C=$(code "$BASE/users/me"); check "no token 401" 401 "$C"
C=$(code "$BASE/users/me" -H "Authorization: Bearer not.a.jwt"); check "garbage token 401" 401 "$C"

echo "== 15. Refresh rotation + reuse detection =="
C=$(code -X POST "$BASE/auth/refresh" -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$ADMIN_RT\"}"); check "refresh 201" 201 "$C"
NEW_RT=$(cat /tmp/vt_body | j "['refreshToken']")
# Reuse the OLD refresh token -> must fail (401) and revoke family.
C=$(code -X POST "$BASE/auth/refresh" -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$ADMIN_RT\"}"); check "reused old refresh 401" 401 "$C"
# The NEW token should now also be revoked (family killed).
C=$(code -X POST "$BASE/auth/refresh" -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$NEW_RT\"}"); check "family revoked -> new token 401" 401 "$C"

echo "== 16. Audit chain verifies =="
VALID=$(curl -s "$BASE/audit/verify" -H "Authorization: Bearer $ADMIN_AT" | j "['valid']"); check "audit chain valid" "True" "$VALID"

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
