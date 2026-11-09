// Phase 4 realtime test: two sockets (host + admitted faculty) exchange a chat message
// over the Socket.IO gateway, proving JWT socket auth, meeting subscription, participant
// gating, and relay. Also checks that an unauthenticated socket is rejected.
import { io } from 'socket.io-client';

const BASE = process.env.BASE || 'http://localhost:4000';

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${res.status} ${path}: ${JSON.stringify(data)}`);
  return data;
}

async function getOtp(email) {
  // Read the dev OTP from the API log.
  const fs = await import('node:fs');
  await new Promise((r) => setTimeout(r, 800));
  const log = fs.readFileSync('/tmp/vimarsh-api.log', 'utf8');
  const lines = log.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes(`To:      ${email}`)) {
      for (let k = i; k < i + 5 && k < lines.length; k++) {
        const m = lines[k].match(/CODE:\s+(\d{6})/);
        if (m) return m[1];
      }
    }
  }
  throw new Error('OTP not found for ' + email);
}

async function makeUser(email, orgId, adminToken) {
  await api('/auth/register', { method: 'POST', body: { email, fullName: 'RT ' + email, password: 'Passw0rd!' } });
  const otp = await getOtp(email);
  const v = await api('/auth/verify-otp', { method: 'POST', body: { email, code: otp } });
  await api('/auth/org-verification', { method: 'POST', token: v.accessToken, body: { orgId, designation: 'M' } });
  const pending = await api('/approvals/pending', { token: adminToken });
  const uid = pending.find((u) => u.email === email).id;
  await api(`/approvals/${uid}/approve`, { method: 'POST', token: adminToken, body: { role: 'FACULTY' } });
  const login = await api('/auth/login', { method: 'POST', body: { email, password: 'Passw0rd!' } });
  return { token: login.accessToken, id: uid };
}

function connect(token) {
  return io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
}

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { console.log(`  PASS: ${name}`); pass++; } else { console.log(`  FAIL: ${name}`); fail++; } };

async function main() {
  const admin = (await api('/auth/login', { method: 'POST', body: { email: 'admin@aicte.vimarsh.local', password: 'Admin@12345' } })).accessToken;
  const orgs = await api('/orgs', { token: admin });
  const iitd = orgs.find((o) => o.code === 'IITD').id;
  const ts = Date.now();
  const fac = await makeUser(`rt_${ts}@iitd.ac.in`, iitd, admin);

  const start = new Date(Date.now() + 60_000).toISOString();
  const end = new Date(Date.now() + 3_600_000).toISOString();
  const meeting = await api('/meetings', { method: 'POST', token: admin, body: { title: 'RT', startAt: start, endAt: end, waitingRoomEnabled: false, invitees: [{ userId: fac.id }] } });

  // Both admit themselves (no waiting room) so chat gating passes.
  await api(`/meetings/${meeting.id}/join-request`, { method: 'POST', token: admin, body: {} });
  await api(`/meetings/${meeting.id}/join-request`, { method: 'POST', token: fac.token, body: {} });

  // 1) Unauthenticated socket is rejected.
  await new Promise((resolve) => {
    const bad = io(BASE, { auth: {}, transports: ['websocket'], reconnection: false });
    const timer = setTimeout(() => { check('unauth socket rejected', bad.disconnected || !bad.connected); bad.close(); resolve(); }, 1500);
    bad.on('disconnect', () => { check('unauth socket rejected', true); clearTimeout(timer); bad.close(); resolve(); });
  });

  // 2) Host + faculty connect, subscribe, exchange chat.
  const hostSock = connect(admin);
  const facSock = connect(fac.token);

  await Promise.all([
    new Promise((r) => hostSock.on('connect', r)),
    new Promise((r) => facSock.on('connect', r)),
  ]);
  check('both sockets connected', hostSock.connected && facSock.connected);

  hostSock.emit('meeting:subscribe', { meetingId: meeting.id });
  facSock.emit('meeting:subscribe', { meetingId: meeting.id });
  await new Promise((r) => setTimeout(r, 300));

  const received = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 2500);
    facSock.on('chat:message', (msg) => { clearTimeout(timer); resolve(msg); });
    hostSock.emit('chat:send', { meetingId: meeting.id, text: 'Hello from host' });
  });
  check('faculty received host chat', received && received.text === 'Hello from host');
  check('chat message carries sender name', !!(received && received.name));

  hostSock.close();
  facSock.close();

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
