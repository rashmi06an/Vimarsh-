// Phase 6+ test: application-level AES-256-GCM encryption at rest for documents.
// Proves: (1) the object stored in MinIO is CIPHERTEXT (not the plaintext, no plaintext marker),
//         (2) an AUTHORIZED download returns the EXACT original bytes (decrypt round-trip),
//         (3) TAMPERING with the stored ciphertext makes decryption FAIL (GCM auth tag).
// Reads the raw stored object directly from MinIO via the S3 SDK to inspect what is on disk.
//
// Usage: node scripts/encryption-test.mjs   (API must be running on :4000, MinIO on :9000)
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const BASE = process.env.BASE || 'http://localhost:4000';
const S3_ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000';
const S3_BUCKET = process.env.S3_BUCKET || 'vimarsh-private';
const S3_ACCESS = process.env.S3_ACCESS_KEY || 'vimarsh';
const S3_SECRET = process.env.S3_SECRET_KEY || 'vimarsh-secret';
const ADMIN_EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL || 'admin@aicte.vimarsh.local';
const ADMIN_PASS = process.env.SEED_SUPER_ADMIN_PASSWORD || 'Admin@12345';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { console.log('  PASS:', name); pass++; } else { console.log('  FAIL:', name); fail++; } };

async function collect(body) {
  const chunks = [];
  for await (const c of body) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

async function main() {
  // 1) Authenticate as the seeded super admin (host can view/upload to own meetings).
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  }).then((r) => r.json());
  const AT = login.accessToken;
  check('admin login', !!AT);
  if (!AT) throw new Error('login failed');

  // 2) Create a meeting to attach the document to.
  const now = Date.now();
  const meeting = await fetch(`${BASE}/meetings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AT}` },
    body: JSON.stringify({
      title: 'Encryption test', startAt: new Date(now + 60000).toISOString(), endAt: new Date(now + 3600000).toISOString(),
    }),
  }).then((r) => r.json());
  const MID = meeting.id;
  check('meeting created', !!MID);

  // 3) Upload a known plaintext PDF containing a unique marker we can search for on disk.
  const marker = `VIMARSH-SECRET-PLAINTEXT-${now}`;
  const plaintext = Buffer.from(`%PDF-1.4\n${marker}\nconfidential body\n%%EOF`);
  const form = new FormData();
  form.append('file', new Blob([plaintext], { type: 'application/pdf' }), 'secret.pdf');
  const up = await fetch(`${BASE}/meetings/${MID}/documents`, {
    method: 'POST', headers: { Authorization: `Bearer ${AT}` }, body: form,
  }).then((r) => r.json());
  check('document uploaded', !!up.id);
  const DOCID = up.id;

  // 4) Authorized download via the API must return the EXACT original bytes (decrypt round-trip).
  const dlResp = await fetch(`${BASE}/documents/${DOCID}/download`, { headers: { Authorization: `Bearer ${AT}` } });
  const dlBuf = Buffer.from(await dlResp.arrayBuffer());
  check('download status 200', dlResp.status === 200);
  check('downloaded bytes EXACTLY match original plaintext', dlBuf.equals(plaintext));

  // 5) Inspect the RAW object on disk in MinIO — it must be ciphertext, not plaintext.
  const s3 = new S3Client({
    endpoint: S3_ENDPOINT, region: 'us-east-1', forcePathStyle: true,
    credentials: { accessKeyId: S3_ACCESS, secretAccessKey: S3_SECRET },
  });
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: `meetings/${MID}/` }));
  const key = listed.Contents?.[0]?.Key;
  check('stored object exists in MinIO', !!key);
  check('stored object key marked .enc', !!key && key.endsWith('.enc'));
  const raw = await collect((await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }))).Body);
  check('stored object is NOT equal to the plaintext', !raw.equals(plaintext));
  check('stored object does NOT contain the plaintext marker (is ciphertext)', !raw.includes(Buffer.from(marker)));
  check('ciphertext has non-zero length', raw.length > 0);

  // 6) Tamper detection: flip one byte of the stored ciphertext -> GCM auth must reject the download.
  const corrupted = Buffer.from(raw);
  corrupted[corrupted.length - 1] ^= 0xff;
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: corrupted, ContentType: 'application/octet-stream' }));
  const tamperResp = await fetch(`${BASE}/documents/${DOCID}/download`, { headers: { Authorization: `Bearer ${AT}` } });
  check('tampered ciphertext fails to decrypt (GCM auth tag rejects)', tamperResp.status >= 400);
}

main()
  .catch((e) => { console.log('  FAIL: unexpected error —', e.message); fail++; })
  .finally(() => {
    console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
  });
