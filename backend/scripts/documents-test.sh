#!/usr/bin/env bash
# Phase 5 test: document upload with CONTENT validation (magic bytes), private storage,
# signed-URL download, access control, sha256 integrity, and recording policy/role gating.
set -uo pipefail
BASE="${1:-http://localhost:4000}"
API_LOG="${2:-/tmp/vimarsh-api.log}"
PASS=0; FAIL=0
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1)" 2>/dev/null; }
check() { if [ "$2" = "$3" ]; then echo "  PASS: $1 ($3)"; PASS=$((PASS+1)); else echo "  FAIL: $1 (expected $2, got $3)"; FAIL=$((FAIL+1)); fi; }
code() { curl -s -o /tmp/dt_body -w "%{http_code}" "$@"; }
getotp() { sleep 1; grep -A4 "To:      $1" "$API_LOG" | grep "CODE:" | tail -1 | grep -oE "[0-9]{6}" | head -1; }

TMP=$(mktemp -d)
printf '%%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%%%EOF' > "$TMP/valid.pdf"
printf '\x89PNG\r\n\x1a\n fake-but-valid-magic' > "$TMP/pic.png"
printf 'MZ this is actually an executable' > "$TMP/evil.pdf"   # wrong magic for .pdf
printf 'plain text not an office file' > "$TMP/notdoc.docx"    # wrong magic for .docx

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
  U_ID="$uid"
}

TS=$(date +%s)
make_user "doc1_${TS}@iitd.ac.in"; FAC_AT="$U_AT"; FAC_ID="$U_ID"
make_user "doc2_${TS}@iitd.ac.in"; STRANGER_AT="$U_AT"

START=$(python3 -c "import datetime;print((datetime.datetime.now(datetime.UTC)+datetime.timedelta(seconds=60)).strftime('%Y-%m-%dT%H:%M:%S.000Z'))")
END=$(python3 -c "import datetime;print((datetime.datetime.now(datetime.UTC)+datetime.timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M:%S.000Z'))")

echo "== Setup: meeting (recording OFF) inviting faculty =="
MID=$(curl -s -X POST "$BASE/meetings" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Docs\",\"startAt\":\"$START\",\"endAt\":\"$END\",\"invitees\":[{\"userId\":\"$FAC_ID\"}]}" | j "['id']")

echo "== 1. Upload valid PDF -> 201, sha256 present =="
C=$(code -X POST "$BASE/meetings/$MID/documents" -H "Authorization: Bearer $ADMIN_AT" -F "file=@$TMP/valid.pdf"); check "pdf upload 201" 201 "$C"
DOCID=$(cat /tmp/dt_body | j "['id']"); SHA=$(cat /tmp/dt_body | j "['sha256']")
[ -n "$SHA" ] && { echo "  PASS: sha256 present"; PASS=$((PASS+1)); } || { echo "  FAIL: no sha256"; FAIL=$((FAIL+1)); }
SCAN=$(cat /tmp/dt_body | j "['scanStatus']"); check "scanStatus SKIPPED (no scanner)" "SKIPPED" "$SCAN"

echo "== 2. Content validation: .pdf with wrong magic -> 400 =="
C=$(code -X POST "$BASE/meetings/$MID/documents" -H "Authorization: Bearer $ADMIN_AT" -F "file=@$TMP/evil.pdf"); check "fake pdf 400" 400 "$C"
echo "== 3. Content validation: .docx that isn't a zip -> 400 =="
C=$(code -X POST "$BASE/meetings/$MID/documents" -H "Authorization: Bearer $ADMIN_AT" -F "file=@$TMP/notdoc.docx"); check "fake docx 400" 400 "$C"

echo "== 4. Invited faculty can upload a PNG -> 201 =="
C=$(code -X POST "$BASE/meetings/$MID/documents" -H "Authorization: Bearer $FAC_AT" -F "file=@$TMP/pic.png"); check "faculty png 201" 201 "$C"

echo "== 5. List documents (host) -> 2 =="
NDOCS=$(curl -s "$BASE/meetings/$MID/documents" -H "Authorization: Bearer $ADMIN_AT" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
check "two documents" "2" "$NDOCS"

echo "== 6. Authorized download streams the file, decrypted server-side (host) -> 200 =="
# Documents are AES-256-GCM encrypted at rest, so there is no presigned URL to raw bytes:
# the backend decrypts in memory after the access check and streams the plaintext. (Proof that
# the stored object is ciphertext is in scripts/encryption-test.mjs.)
C=$(code "$BASE/documents/$DOCID/download" -H "Authorization: Bearer $ADMIN_AT"); check "download 200" 200 "$C"

echo "== 7. Downloaded bytes match the original (encrypt -> store -> decrypt round-trip) =="
DLHASH=$(shasum -a 256 /tmp/dt_body | cut -d' ' -f1)
SRCHASH=$(shasum -a 256 "$TMP/valid.pdf" | cut -d' ' -f1)
check "downloaded bytes match original" "$SRCHASH" "$DLHASH"

echo "== 8. Stranger (not invited) cannot list/download -> 403 =="
C=$(code "$BASE/meetings/$MID/documents" -H "Authorization: Bearer $STRANGER_AT"); check "stranger list 403" 403 "$C"
C=$(code "$BASE/documents/$DOCID/download" -H "Authorization: Bearer $STRANGER_AT"); check "stranger download 403" 403 "$C"

echo "== 9. Recording policy gate: recording OFF -> host start 403 =="
# make meeting live first
curl -s -X POST "$BASE/meetings/$MID/join-request" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' -d '{}' >/dev/null
curl -s -X POST "$BASE/meetings/$MID/token" -H "Authorization: Bearer $ADMIN_AT" >/dev/null
C=$(code -X POST "$BASE/meetings/$MID/recording/start" -H "Authorization: Bearer $ADMIN_AT"); check "recording off -> 403" 403 "$C"

echo "== 10. Recording ON meeting: non-host start 403; host start NOT 403 (egress-gated) =="
MID2=$(curl -s -X POST "$BASE/meetings" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' \
  -d "{\"title\":\"Rec\",\"startAt\":\"$START\",\"endAt\":\"$END\",\"policies\":{\"allowRecording\":true},\"invitees\":[{\"userId\":\"$FAC_ID\"}]}" | j "['id']")
curl -s -X POST "$BASE/meetings/$MID2/join-request" -H "Authorization: Bearer $ADMIN_AT" -H 'Content-Type: application/json' -d '{}' >/dev/null
curl -s -X POST "$BASE/meetings/$MID2/token" -H "Authorization: Bearer $ADMIN_AT" >/dev/null
C=$(code -X POST "$BASE/meetings/$MID2/recording/start" -H "Authorization: Bearer $FAC_AT"); check "non-host start 403" 403 "$C"
C=$(code -X POST "$BASE/meetings/$MID2/recording/start" -H "Authorization: Bearer $ADMIN_AT")
# 201 if egress running, 400 if egress service is down — both mean authorization PASSED.
if [ "$C" = "201" ] || [ "$C" = "400" ]; then echo "  PASS: host start authorized (egress result $C)"; PASS=$((PASS+1)); else echo "  FAIL: host start ($C)"; FAIL=$((FAIL+1)); fi

echo "== 11. Audit chain valid =="
VALID=$(curl -s "$BASE/audit/verify" -H "Authorization: Bearer $ADMIN_AT" | j "['valid']"); check "audit valid" "True" "$VALID"

rm -rf "$TMP"
echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
