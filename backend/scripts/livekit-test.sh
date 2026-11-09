#!/usr/bin/env bash
# Phase 4 backend test: LiveKit token minting (server-side only), waiting-room flow,
# admission gating, passcode, lock, capacity-independent host join, and end-for-all.
set -uo pipefail
BASE="${1:-http://localhost:4000}"
API_LOG="${2:-/tmp/vimarsh-api.log}"
PASS=0; FAIL=0
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }
check() { if [ "$2" = "$3" ]; then echo "  PASS: $1 ($3)"; PASS=$((PASS+1)); else echo "  FAIL: $1 (expected $2, got $3)"; FAIL=$((FAIL+1)); fi; }
code() { curl -s -o /tmp/lk_body -w "%{http_code}" "$@"; }
getotp() { sleep 1; grep -A4 "To:      $1" "$API_LOG" | grep "CODE:" | tail -1 | grep -oE "[0-9]{6}" | head -1; }

ADMIN_AT=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@aicte.vimarsh.local","password":"Admin@12345"}' | j "['accessToken']")
IITD_ID=$(curl -s "$BASE/orgs" -H "Authorization: Bearer $ADMIN_AT" | python3 -c "import sys,json;print([o['id'] for o in json.load(sys.stdin) if o['code']=='IITD'][0])")

make_user() {
  local email="$1"
  curl -s -X POST "$BASE/auth/register" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"fullName\":\"U $email\",\"password\":\"Passw0rd!\"}" >/dev/null
  local otp; otp=$(getotp "$email")
  local at; at=$(curl -s -X POST "$BASE/auth/verify-otp" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"code\":\"$otp\"}" | j "['accessToken']")
  curl -s -X POST "$BASE/auth/org-verification" -H "Authorization: Bearer $at" -H 'Content-Type: application/json' -d "{\"orgId\":\"$IITD_ID\",\"designation\":\"M\"}" >/dev/null
  local uid; uid=$(curl -s "$BASE/approvals/pending" -H "Authorization: Bearer $ADMIN_AT" | python3 -c "import sys,json;d=json.load(sys.stdin);print([u['id'] for u in d if u['email']=='$email'][0])")
  curl -s -X POST "$BASE/approvals/$uid/approve" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' -d '{"role":"FACULTY"}' >/dev/null
  U_AT=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"password\":\"Passw0rd!\"}" | j "['accessToken']")
  U_ID="$uid"
}

TS=$(date +%s)
make_user "lk1_${TS}@iitd.ac.in"; FAC1_AT="$U_AT"; FAC1_ID="$U_ID"
make_user "lk2_${TS}@iitd.ac.in"; FAC2_AT="$U_AT"; FAC2_ID="$U_ID"

# Meeting joinable NOW: start in 60s (join opens 15 min before), end in 1h, waiting room ON, passcode set.
START=$(python3 -c "import datetime;print((datetime.datetime.utcnow()+datetime.timedelta(seconds=60)).strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
END=$(python3 -c "import datetime;print((datetime.datetime.utcnow()+datetime.timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%S.000Z'))")

echo "== Setup: AICTE admin schedules a joinable meeting (waiting room + passcode) =="
MJSON=$(curl -s -X POST "$BASE/meetings" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Live Test\",\"startAt\":\"$START\",\"endAt\":\"$END\",\"passcode\":\"roomPass1\",\"waitingRoomEnabled\":true,\"invitees\":[{\"userId\":\"$FAC1_ID\"},{\"userId\":\"$FAC2_ID\"}]}")
MID=$(echo "$MJSON" | j "['id']"); MROOM=$(echo "$MJSON" | j "['meetingCode']")
echo "  meeting=$MID room=$MROOM"

echo "== 1. Host join-request -> admitted immediately =="
C=$(code -X POST "$BASE/meetings/$MID/join-request" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' -d '{}')
ADM=$(cat /tmp/lk_body | j "['admitted']"); check "host admitted true" "True" "$ADM"

echo "== 2. Host token mints a LiveKit JWT scoped to the room =="
C=$(code -X POST "$BASE/meetings/$MID/token" -H "Authorization: Bearer $ADMIN_AT"); check "host token 201" 201 "$C"
TOKEN=$(cat /tmp/lk_body | j "['token']")
ROOM_IN_TOKEN=$(python3 -c "import sys,base64,json;p='$TOKEN'.split('.')[1];p+='='*(-len(p)%4);d=json.loads(base64.urlsafe_b64decode(p));print(d.get('video',{}).get('room',''))")
check "token room == meeting room" "$MROOM" "$ROOM_IN_TOKEN"
URL=$(cat /tmp/lk_body | j "['url']"); echo "  livekit url: $URL"

echo "== 3. Faculty1 wrong passcode -> 403 =="
C=$(code -X POST "$BASE/meetings/$MID/join-request" -H "Authorization: Bearer $FAC1_AT" -H 'Content-Type: application/json' -d '{"passcode":"wrong"}'); check "wrong passcode 403" 403 "$C"

echo "== 4. Faculty1 correct passcode -> waiting =="
C=$(code -X POST "$BASE/meetings/$MID/join-request" -H "Authorization: Bearer $FAC1_AT" -H 'Content-Type: application/json' -d '{"passcode":"roomPass1"}')
WAIT=$(cat /tmp/lk_body | j "['waiting']"); check "faculty1 waiting true" "True" "$WAIT"

echo "== 5. Faculty1 token before admit -> 403 =="
C=$(code -X POST "$BASE/meetings/$MID/token" -H "Authorization: Bearer $FAC1_AT"); check "token before admit 403" 403 "$C"

echo "== 6. Host sees waiting list, admits faculty1 =="
INWAIT=$(curl -s "$BASE/meetings/$MID/waiting" -H "Authorization: Bearer $ADMIN_AT" | python3 -c "import sys,json;print(any(w['userId']=='$FAC1_ID' for w in json.load(sys.stdin)))")
check "faculty1 in waiting list" "True" "$INWAIT"
C=$(code -X POST "$BASE/meetings/$MID/admit" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$FAC1_ID\"}"); check "admit 201" 201 "$C"

echo "== 7. Faculty1 token after admit -> 201 =="
C=$(code -X POST "$BASE/meetings/$MID/token" -H "Authorization: Bearer $FAC1_AT"); check "token after admit 201" 201 "$C"

echo "== 8. Faculty (non-host) cannot admit / end -> 403 =="
C=$(code -X POST "$BASE/meetings/$MID/admit" -H "Authorization: Bearer $FAC1_AT" -H 'Content-Type: application/json' -d "{\"targetUserId\":\"$FAC2_ID\"}"); check "faculty admit 403" 403 "$C"
C=$(code -X POST "$BASE/meetings/$MID/end" -H "Authorization: Bearer $FAC1_AT"); check "faculty end 403" 403 "$C"

echo "== 9. Lock meeting; faculty2 join -> 403 locked =="
C=$(code -X POST "$BASE/meetings/$MID/lock" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' -d '{"locked":true}'); check "lock 201" 201 "$C"
C=$(code -X POST "$BASE/meetings/$MID/join-request" -H "Authorization: Bearer $FAC2_AT" -H 'Content-Type: application/json' -d '{"passcode":"roomPass1"}'); check "locked join 403" 403 "$C"

echo "== 10. Unauthorized token request by a stranger (not invited) -> 403 =="
make_user "lk3_${TS}@iitd.ac.in"; STRANGER_AT="$U_AT"
C=$(code -X POST "$BASE/meetings/$MID/join-request" -H "Authorization: Bearer $STRANGER_AT" -H 'Content-Type: application/json' -d '{"passcode":"roomPass1"}'); check "stranger join 403" 403 "$C"

echo "== 11. Host ends meeting; subsequent join -> 400 =="
C=$(code -X POST "$BASE/meetings/$MID/end" -H "Authorization: Bearer $ADMIN_AT"); check "end 201" 201 "$C"
C=$(code -X POST "$BASE/meetings/$MID/join-request" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' -d '{}'); check "join after end 400" 400 "$C"

echo "== 12. Audit chain valid =="
VALID=$(curl -s "$BASE/audit/verify" -H "Authorization: Bearer $ADMIN_AT" | j "['valid']"); check "audit valid" "True" "$VALID"

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
