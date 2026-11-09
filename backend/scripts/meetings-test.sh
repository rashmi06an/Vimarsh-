#!/usr/bin/env bash
# Phase 3 end-to-end test: scheduling, validation, invitations, access control,
# update/cancel, notifications, meeting-code format, cross-institution denial.
# Requires the API running and the dev OTP console log.
set -uo pipefail
BASE="${1:-http://localhost:4000}"
API_LOG="${2:-/tmp/vimarsh-api.log}"
PASS=0; FAIL=0
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }
check() { if [ "$2" = "$3" ]; then echo "  PASS: $1 ($3)"; PASS=$((PASS+1)); else echo "  FAIL: $1 (expected $2, got $3)"; FAIL=$((FAIL+1)); fi; }
code() { curl -s -o /tmp/mt_body -w "%{http_code}" "$@"; }
getotp() { sleep 1; grep -A4 "To:      $1" "$API_LOG" | grep "CODE:" | tail -1 | grep -oE "[0-9]{6}" | head -1; }

ADMIN_AT=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@aicte.vimarsh.local","password":"Admin@12345"}' | j "['accessToken']")
IITD_ID=$(curl -s "$BASE/orgs" -H "Authorization: Bearer $ADMIN_AT" | python3 -c "import sys,json;print([o['id'] for o in json.load(sys.stdin) if o['code']=='IITD'][0])")

# Helper: create an approved user with a given role in a given org; sets U_AT / U_ID.
make_user() {
  local email="$1" role="$2" org="$3"
  curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"fullName\":\"User $email\",\"password\":\"Passw0rd!\"}" >/dev/null
  local otp; otp=$(getotp "$email")
  local at; at=$(curl -s -X POST "$BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"code\":\"$otp\"}" | j "['accessToken']")
  curl -s -X POST "$BASE/auth/org-verification" -H "Authorization: Bearer $at" -H 'Content-Type: application/json' -d "{\"orgId\":\"$org\",\"designation\":\"Member\"}" >/dev/null
  local uid; uid=$(curl -s "$BASE/approvals/pending" -H "Authorization: Bearer $ADMIN_AT" | python3 -c "import sys,json;d=json.load(sys.stdin);print([u['id'] for u in d if u['email']=='$email'][0])")
  curl -s -X POST "$BASE/approvals/$uid/approve" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' -d "{\"role\":\"$role\"}" >/dev/null
  U_AT=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"password\":\"Passw0rd!\"}" | j "['accessToken']")
  U_ID="$uid"
}

TS=$(date +%s)
echo "== Setup: two faculty + one institute admin in IITD =="
make_user "fa_${TS}@iitd.ac.in" FACULTY "$IITD_ID"; FAC1_AT="$U_AT"; FAC1_ID="$U_ID"; echo "  faculty1=$FAC1_ID"
make_user "fb_${TS}@iitd.ac.in" FACULTY "$IITD_ID"; FAC2_AT="$U_AT"; FAC2_ID="$U_ID"; echo "  faculty2=$FAC2_ID"
make_user "ia_${TS}@iitd.ac.in" INSTITUTE_ADMIN "$IITD_ID"; IADMIN_AT="$U_AT"; IADMIN_ID="$U_ID"; echo "  instituteAdmin=$IADMIN_ID"

echo "== 1. Faculty cannot schedule -> 403 =="
C=$(code -X POST "$BASE/meetings" -H "Authorization: Bearer $FAC1_AT" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Nope\",\"startAt\":\"2027-01-01T10:00:00.000Z\",\"endAt\":\"2027-01-01T11:00:00.000Z\"}"); check "faculty schedule 403" 403 "$C"

echo "== 2. Validation: past start -> 400 =="
C=$(code -X POST "$BASE/meetings" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Past\",\"startAt\":\"2020-01-01T10:00:00.000Z\",\"endAt\":\"2020-01-01T11:00:00.000Z\"}"); check "past start 400" 400 "$C"

echo "== 3. Validation: end before start -> 400 =="
C=$(code -X POST "$BASE/meetings" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Bad\",\"startAt\":\"2027-01-01T11:00:00.000Z\",\"endAt\":\"2027-01-01T10:00:00.000Z\"}"); check "end<start 400" 400 "$C"

echo "== 4. Admin schedules a meeting, inviting faculty1 =="
C=$(code -X POST "$BASE/meetings" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Approval Committee\",\"agenda\":\"Review\",\"confidentiality\":\"CONFIDENTIAL\",\"startAt\":\"2027-01-01T10:00:00.000Z\",\"endAt\":\"2027-01-01T11:00:00.000Z\",\"passcode\":\"secret12\",\"invitees\":[{\"userId\":\"$FAC1_ID\"}]}")
check "schedule 201" 201 "$C"
MID=$(cat /tmp/mt_body | j "['id']")
MCODE=$(cat /tmp/mt_body | j "['meetingCode']")
echo "  meeting id=$MID code=$MCODE"
echo "$MCODE" | grep -qE '^VMR-20[0-9]{2}-[A-Z0-9]{6}$' && { echo "  PASS: code format $MCODE"; PASS=$((PASS+1)); } || { echo "  FAIL: code format $MCODE"; FAIL=$((FAIL+1)); }
HASPASS=$(cat /tmp/mt_body | j "['hasPasscode']"); check "passcode stored (not echoed)" "True" "$HASPASS"

echo "== 5. Admin lists scope=mine includes it =="
MINE=$(curl -s "$BASE/meetings?scope=mine" -H "Authorization: Bearer $ADMIN_AT" | python3 -c "import sys,json;print(any(m['id']=='$MID' for m in json.load(sys.stdin)))")
check "mine contains meeting" "True" "$MINE"

echo "== 6. Faculty1 sees the invitation =="
INV_ID=$(curl -s "$BASE/invitations/me" -H "Authorization: Bearer $FAC1_AT" | python3 -c "import sys,json;d=json.load(sys.stdin);print([x['invitationId'] for x in d if x['meeting']['id']=='$MID'][0])" 2>/dev/null)
if [ -n "${INV_ID:-}" ]; then echo "  PASS: invitation present ($INV_ID)"; PASS=$((PASS+1)); else echo "  FAIL: no invitation"; FAIL=$((FAIL+1)); fi

echo "== 7. Access control: faculty2 (not invited) -> 403, faculty1 (invited) -> 200 =="
C=$(code "$BASE/meetings/$MID" -H "Authorization: Bearer $FAC2_AT"); check "faculty2 details 403" 403 "$C"
C=$(code "$BASE/meetings/$MID" -H "Authorization: Bearer $FAC1_AT"); check "faculty1 details 200" 200 "$C"

echo "== 8. Faculty1 accepts invitation =="
C=$(code -X POST "$BASE/invitations/$INV_ID/accept" -H "Authorization: Bearer $FAC1_AT"); check "accept 200" 201 "$C"

echo "== 9. Non-host cannot update/cancel -> 403 =="
C=$(code -X PATCH "$BASE/meetings/$MID" -H "Authorization: Bearer $FAC1_AT" -H 'Content-Type: application/json' -d '{"title":"Hacked"}'); check "faculty update 403" 403 "$C"
C=$(code -X POST "$BASE/meetings/$MID/cancel" -H "Authorization: Bearer $FAC1_AT"); check "faculty cancel 403" 403 "$C"

echo "== 10. Admin updates the meeting -> 200 =="
C=$(code -X PATCH "$BASE/meetings/$MID" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' -d '{"title":"Approval Committee (rev)"}'); check "admin update 200" 200 "$C"

echo "== 11. Faculty1 got invitation + update notifications =="
NCOUNT=$(curl -s "$BASE/notifications" -H "Authorization: Bearer $FAC1_AT" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len([n for n in d if n['data'] and n['data'].get('meetingId')=='$MID']))" 2>/dev/null)
if [ "${NCOUNT:-0}" -ge 2 ]; then echo "  PASS: >=2 notifications ($NCOUNT)"; PASS=$((PASS+1)); else echo "  FAIL: notifications ($NCOUNT)"; FAIL=$((FAIL+1)); fi

echo "== 12. Cross-institution invite by a NON-AICTE host is skipped =="
# Another org + a user in it.
OTHER=$(curl -s -X POST "$BASE/orgs" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' -d "{\"name\":\"Other Inst ${TS}\",\"type\":\"INSTITUTE\",\"code\":\"OTH${TS}\"}" | j "['id']")
make_user "oth_${TS}@other.ac.in" FACULTY "$OTHER"; OUID="$U_ID"
# Institute Admin of IITD hosts a meeting, then tries to invite the OTHER-org user -> skipped.
IAMID=$(curl -s -X POST "$BASE/meetings" -H "Authorization: Bearer $IADMIN_AT" -H 'Content-Type: application/json' \
  -d "{\"title\":\"IITD Dept Sync\",\"startAt\":\"2027-02-01T10:00:00.000Z\",\"endAt\":\"2027-02-01T11:00:00.000Z\"}" | j "['id']")
SKIP=$(curl -s -X POST "$BASE/meetings/$IAMID/invitations" -H "Authorization: Bearer $IADMIN_AT" -H 'Content-Type: application/json' -d "{\"invitees\":[{\"userId\":\"$OUID\"}]}" | python3 -c "import sys,json;d=json.load(sys.stdin);print(any('institution' in s['reason'] for s in d['skipped']))")
check "institute-admin cross-org invite skipped" "True" "$SKIP"

echo "== 13. Admin cancels; faculty1 notified =="
C=$(code -X POST "$BASE/meetings/$MID/cancel" -H "Authorization: Bearer $ADMIN_AT"); check "cancel 201" 201 "$C"
CSTATUS=$(curl -s "$BASE/meetings/$MID" -H "Authorization: Bearer $ADMIN_AT" | j "['status']"); check "status CANCELLED" "CANCELLED" "$CSTATUS"

echo "== 14. Audit chain still valid =="
VALID=$(curl -s "$BASE/audit/verify" -H "Authorization: Bearer $ADMIN_AT" | j "['valid']"); check "audit valid" "True" "$VALID"

echo "== 15. Regression: an APPROVED faculty with NO org (orgId null) can list meetings (no 500) =="
# Reproduces the '__none__' sentinel bug: a user approved WITHOUT completing org-verification
# keeps orgId = null; listing meetings used to inject the non-ObjectId string '__none__' into the
# orgId filter and crash Prisma with a 500 on every org-scoped scope.
NOEMAIL="noorg_${TS}@iitd.ac.in"
curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$NOEMAIL\",\"fullName\":\"No Org Faculty\",\"password\":\"Passw0rd!\"}" >/dev/null
NOOTP=$(getotp "$NOEMAIL")
curl -s -X POST "$BASE/auth/verify-otp" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$NOEMAIL\",\"code\":\"$NOOTP\"}" >/dev/null
# NOTE: deliberately skip /auth/org-verification so orgId stays null.
NOUID=$(curl -s "$BASE/approvals/pending" -H "Authorization: Bearer $ADMIN_AT" | python3 -c "import sys,json;d=json.load(sys.stdin);print([u['id'] for u in d if u['email']=='$NOEMAIL'][0])" 2>/dev/null)
curl -s -X POST "$BASE/approvals/$NOUID/approve" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' -d '{"role":"FACULTY"}' >/dev/null
NOORG_AT=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$NOEMAIL\",\"password\":\"Passw0rd!\"}" | j "['accessToken']")
if [ -z "${NOORG_AT:-}" ]; then echo "  FAIL: could not set up org-less faculty"; FAIL=$((FAIL+1)); fi
for S in upcoming ongoing all past mine invitations; do
  C=$(code "$BASE/meetings?scope=$S" -H "Authorization: Bearer $NOORG_AT"); check "org-less faculty scope=$S not 500 (200)" 200 "$C"
done
# Admin invites the org-less faculty to a meeting; they must be able to see it (visibility must
# not depend on the org filter that we removed for org-less non-admins).
NOMID=$(curl -s -X POST "$BASE/meetings" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Org-less Invite\",\"startAt\":\"2027-04-01T10:00:00.000Z\",\"endAt\":\"2027-04-01T11:00:00.000Z\",\"invitees\":[{\"userId\":\"$NOUID\"}]}" | j "['id']")
SEES=$(curl -s "$BASE/meetings?scope=invitations" -H "Authorization: Bearer $NOORG_AT" | python3 -c "import sys,json;print(any(m['id']=='$NOMID' for m in json.load(sys.stdin)))" 2>/dev/null)
check "org-less faculty sees invited meeting" "True" "$SEES"

echo "== 16. Regression: AICTE super-admin invites a registered CROSS-ORG member BY EMAIL -> in-app invite, not a guest link =="
# The mobile app always invites by email. A registered member in a different institution used to
# fall through to a guest-link invite (inviteeEmail only), so it never appeared in their
# /invitations/me. FAC2 is an IITD faculty; the admin is AICTE (different org).
EMID=$(curl -s -X POST "$BASE/meetings" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Email Invite Repro\",\"startAt\":\"2027-05-01T10:00:00.000Z\",\"endAt\":\"2027-05-01T11:00:00.000Z\"}" | j "['id']")
ERES=$(curl -s -X POST "$BASE/meetings/$EMID/invitations" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' \
  -d "{\"invitees\":[{\"email\":\"fb_${TS}@iitd.ac.in\"}]}")
EGL=$(echo "$ERES" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('guestLinks',[])))" 2>/dev/null)
check "registered cross-org member NOT issued a guest link" "0" "${EGL:-x}"
ESEE1=$(curl -s "$BASE/invitations/me" -H "Authorization: Bearer $FAC2_AT" | python3 -c "import sys,json;print(any(x['meeting']['id']=='$EMID' for x in json.load(sys.stdin)))" 2>/dev/null)
check "cross-org member sees email invite in /invitations/me" "True" "${ESEE1:-False}"
ESEE2=$(curl -s "$BASE/meetings?scope=invitations" -H "Authorization: Bearer $FAC2_AT" | python3 -c "import sys,json;print(any(m['id']=='$EMID' for m in json.load(sys.stdin)))" 2>/dev/null)
check "cross-org member sees email invite in scope=invitations" "True" "${ESEE2:-False}"

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
