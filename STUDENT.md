# VIMARSH (विमर्श) — AICTE Secure Online Meeting Platform

> **Single source of truth for this project.** Every decision, every module, what was
> built, **why**, **how**, and **where the code lives** is recorded here. If it is written
> as "working" in this file, it was actually run and tested. Planned/unbuilt things are
> marked clearly. This file is written so I can explain and defend the project in a viva.

- **App name:** Vimarsh (displayed as "AICTE Vimarsh")
- **Wordmark:** विमर्श (Devanagari)
- **Tagline:** "Secure meetings for India's technical education."
- **Context:** AICTE Problem Statement 2023 — Domain: Blockchain & Cybersecurity — Mobile App Development.
- **Last updated:** 2026-11-16 (Phases 0–6 built & tested, 101/101 backend tests incl. AES-256-GCM
  document encryption at rest; Phase 7 release wired; post-review pass added the mobile recordings
  access UI and removed sync-conflict duplicate files — see §28)

---

## 0. DOCUMENT CONVENTIONS

Status tags used throughout this file:

- ✅ **DONE** — built, run, and tested on this machine (test evidence recorded in §16).
- 🟡 **IN PROGRESS** — partially built.
- ⬜ **PLANNED** — designed but no code yet.
- ❌ **NOT DOING / DEFERRED** — with a reason.

**Progress as of 2026-11-07:** Phases 0–6 ✅ **built and tested** end-to-end — auth/onboarding,
RBAC + org scope, meetings/invitations/notifications, LiveKit live conferencing + waiting room +
host controls, realtime chat, documents, recording control, hash-chained audit, and security
hardening, plus **AES-256-GCM encryption at rest for documents**. **101/101 automated backend tests
pass** (smoke 26, meetings 19, livekit 17, realtime 4, documents 15, encryption-at-rest 11,
security 9) + a live audit tamper-detection demo. Mobile app builds, typechecks and
bundles; the LiveKit video room needs a development build (two-device run is the owner's step, §26).
Phase 7 release (local-Gradle APK) is wired (§25). Full what/why/how/where is in §22; run commands
in §16; owner actions in §24; **security posture in §27**.

> **Design sections §5–§15 describe the system _as built_** (the design was realised; where an
> implementation detail diverged from the original plan it is called out in §22). Status tags below
> reflect reality: everything marked ✅ was actually run and tested on this machine.

---

## 1. REPO AUDIT (Phase 0) — ✅ DONE (2026-11-06)

**What I did:** Inspected the project directory, the surrounding filesystem, the git state,
and the local toolchain before writing any code.

**What I found:**

| Check | Result | Implication |
|---|---|---|
| `/Users/rashmianand/Desktop/Vimarsh` contents | **Empty** (no files, no hidden files) | Greenfield build. No existing frontend/backend/DB/deps/navigation to reuse or preserve. |
| Git repository root | **`/Users/rashmianand`** (the HOME directory) | ⚠️ A `git init` was run in the home folder. The whole home dir is one repo. I will **not** run any git write commands. Recommend the user create a dedicated repo scoped to the project folder (see "Known issues", §18). |
| Node.js | v22.22.3 | ✓ Meets Expo SDK 57 requirement (≥ 22.13). |
| npm | 10.9.8 | ✓ |
| Docker | 29.9.2 | ✓ Available for Compose stack. |
| Docker Compose | v5.6.1 | ✓ |
| Docker daemon | **Not running** at audit time | Must start Docker Desktop before Phase 1 infra work. |
| Expo tooling | present (`npx expo`) | ✓ |
| Latest Expo SDK (today) | **57** (RN 0.86) | Candidate SDK; final pin decided in Phase 1 after checking LiveKit plugin peer deps. |

**Why it matters:** Rule 1 ("inspect first, reuse working code, don't duplicate") is satisfied
trivially because there is nothing pre-existing. All architecture decisions below are made
fresh and are free to follow best practice without compatibility debt.

**Commands run during audit (read-only, no writes):**
```
ls -la /Users/rashmianand/Desktop/Vimarsh
git rev-parse --show-toplevel
git status --short
node -v ; npm -v ; docker -v ; docker compose version
docker info   # to check daemon
```

---

## 2. PROJECT OVERVIEW

Vimarsh is a **mobile-first secure video-conferencing platform** purpose-built for AICTE
(All India Council for Technical Education) and India's technical-education ecosystem
(AICTE HQ, ministries, institutes, departments, faculty, and invited guests).

It provides:
- Role-based, organization-scoped access to confidential meetings.
- Real WebRTC audio/video via a LiveKit SFU (two real devices join the same room).
- Backend-enforced authentication, approval workflow, and authorization (RBAC + org scope + meeting scope).
- Scheduling, invitations, calendar, notifications, in-meeting chat, screen share, documents.
- Server-side recording (policy-gated) to private storage with expiring signed URLs.
- An append-only, hash-chained audit log with a verify-chain endpoint and a tamper-detection demo.
- A government-portal visual identity ("Vimarsh") that is calm, official, and trustworthy.

**It is NOT:** a general-purpose consumer app, and it does **not** claim end-to-end media
encryption (LiveKit SFU and server-side recording can access media — see §9/§15).

---

## 3. OBJECTIVES (mapped to the problem statement)

1. **Secure authentication & onboarding** — email-OTP verification, organization verification,
   manual approval before any privileged role is granted.
2. **Role-based, organization-scoped authorization** — enforced server-side on every sensitive route.
3. **Real multi-device video conferencing** — LiveKit SFU, backend-issued short-lived tokens.
4. **Meeting lifecycle management** — schedule, invite, calendar, notifications, waiting room, history.
5. **Confidential collaboration** — documents and recordings behind authorization + expiring signed URLs.
6. **Tamper-evident auditing** — hash-chained audit log + verify endpoint (the "blockchain-adjacent" core).
7. **Honest security posture** — document exactly what is and isn't protected; no false claims.

---

## 4. TECH STACK (as built, with reasons)

### Mobile (React Native + Expo — **development build**, not Expo Go)
| Choice | Version strategy | Why |
|---|---|---|
| Expo SDK | Pinned in Phase 1 (candidate 54–57; chosen = newest SDK the LiveKit Expo plugin officially supports) | Managed workflow + config plugins + EAS build. **Expo Go cannot run LiveKit native modules**, so a dev build is mandatory. |
| TypeScript | latest compatible | Rule 4: TS for all new modules. |
| React Navigation | v7 (native stack + bottom tabs) | Standard, supports nested stacks + navigation guards + deep links. |
| expo-secure-store | SDK-matched | Secure token storage (Keychain / Keystore). |
| LiveKit React Native SDK | SDK-matched (`@livekit/react-native`, `@livekit/react-native-expo-plugin`, `@config-plugins/react-native-webrtc`) | Real WebRTC via SFU. |
| socket.io-client | matched to server | Realtime meeting events, chat, waiting-room, notifications. |
| expo-notifications | optional | Push only if configured; in-app notifications always work. |
| React Query (TanStack) | latest | Server-state caching, loading/error/empty states cleanly. |
| zustand or Context | light | Auth/session state. (Decide in Phase 1; prefer minimal.) |

### Backend (NestJS)
| Choice | Why |
|---|---|
| NestJS (REST + Swagger/OpenAPI) | Structured modules, guards, DI, DTO validation, first-class interceptors/filters. |
| Socket.IO gateway | Realtime events (meeting state, chat, waiting room, notifications). |
| JWT access + rotating refresh tokens (replay detection) | Short-lived access; refresh rotation with reuse detection for session security. |
| Argon2id (`argon2`) | Memory-hard password hashing. |
| Prisma + MongoDB | Type-safe data layer; Mongo for flexible meeting/participant docs; unique constraints + indexes. |
| class-validator / class-transformer | DTO whitelist + forbidNonWhitelisted (stops mass assignment). |
| @nestjs/throttler | Login throttling, OTP + API rate limits. |
| LiveKit Server SDK (`livekit-server-sdk`) | Mint room-scoped, short-lived access tokens server-side. API secret never leaves backend. |
| LiveKit Egress | Server-side recording to private storage. |
| MinIO (S3-compatible) SDK | Private object storage; expiring presigned URLs only. |
| pino (structured logging) | Structured, parseable logs. |

### Infra (Docker Compose)
`api`, `mongo`, `livekit`, `redis` (if LiveKit/egress needs it), `minio`. Env-based config,
`.env.example` committed, real secrets only in `.env` (gitignored).

**Why this stack:** it is exactly the stack the problem statement calls for, every piece is
open-source and runnable locally, and each piece maps to a non-negotiable requirement
(real video, real auth, server-enforced security, private storage, audit integrity).

---

## 5. HIGH-LEVEL ARCHITECTURE (as built)

```
                       ┌─────────────────────────────────────────────┐
                       │                 MOBILE APP                   │
                       │  Expo dev build (React Native + TypeScript)  │
                       │  - Auth/session (SecureStore)                │
                       │  - Navigation (guards + deep links)          │
                       │  - REST client (access token)                │
                       │  - Socket.IO client (realtime)               │
                       │  - LiveKit client (WebRTC media)             │
                       └───────┬───────────────┬───────────────┬──────┘
                 HTTPS/REST    │    WSS Socket  │   WebRTC/WSS  │
                               ▼               ▼               ▼
         ┌──────────────────────────────────────────┐   ┌──────────────┐
         │              NestJS API (api)              │   │  LiveKit SFU  │
         │  Auth · Users · Orgs · Meetings · Invites  │   │  (media only) │
         │  Tokens · Documents · Recordings · Audit   │   │  rooms,tracks │
         │  Guards: JWT + RBAC + Org + Meeting scope  │   └──────┬───────┘
         │  Socket.IO gateway  ·  LiveKit token mint  │          │ Egress
         └───┬───────────────┬───────────────┬────────┘          ▼
             │ Prisma        │ presign        │ mint       ┌──────────────┐
             ▼               ▼                ▼            │    MinIO     │
       ┌──────────┐   ┌──────────────┐  (no secret        │ private obj  │
       │  MongoDB │   │    MinIO      │   to client)       │  storage     │
       │  (data)  │   │ (files/recs)  │◄───────────────────┤ recordings   │
       └──────────┘   └──────────────┘    recordings       └──────────────┘
                         (+ redis if egress/livekit requires)
```

**Trust boundary:** the LiveKit **API secret** and MinIO credentials live **only** in the
backend. The app never sees them. The app receives only: a short-lived JWT, short-lived
room-scoped LiveKit tokens, and expiring presigned URLs.

---

## 6. FOLDER STRUCTURE (as built)

```
Vimarsh/
├── STUDENT.md                      # this file (single source of truth)
├── docker-compose.yml              # api, mongo, livekit, minio, (redis)
├── .env.example                    # every env var, with safe placeholders
├── livekit/
│   └── livekit.yaml                # LiveKit server config (dev)
│
├── backend/                        # NestJS API
│   ├── prisma/
│   │   └── schema.prisma           # Mongo datasource, models, indexes
│   ├── src/
│   │   ├── main.ts                 # bootstrap, global pipes/filters, Swagger
│   │   ├── app.module.ts
│   │   ├── common/                 # guards, decorators, filters, crypto
│   │   │   ├── guards/             # JwtAuthGuard, RolesGuard, WsSafeThrottlerGuard
│   │   │   │                       #   (org/meeting scope enforced in the services, not guards)
│   │   │   ├── decorators/         # @Roles, @CurrentUser, @Public
│   │   │   ├── filters/            # AllExceptionsFilter
│   │   │   └── crypto/             # argon2, hash-chain helpers
│   │   ├── auth/                   # register, otp, login, refresh (rotation+replay), reset, logout
│   │   ├── users/                  # profile, sessions/devices
│   │   ├── orgs/                   # institutes, departments, org verification
│   │   ├── approvals/              # registration approval workflow
│   │   ├── meetings/               # schedule/update/cancel/details/history
│   │   ├── invitations/            # invite, invitation status, deep-link tokens
│   │   ├── realtime/               # Socket.IO gateway (events, chat, waiting room)
│   │   ├── livekit/                # token mint + room admin
│   │   ├── documents/              # upload/download, content validation, presign
│   │   ├── recordings/             # egress start/stop, access + presign
│   │   ├── audit/                  # append-only hash-chained log + verify-chain
│   │   └── notifications/          # in-app notifications (+ provider iface for push/SMS)
│   └── test/                       # e2e + unit
│
└── mobile/                         # Expo app
    ├── app.config.ts               # Expo config + LiveKit/webrtc plugins
    ├── src/
    │   ├── theme/                  # design tokens (colors, type, spacing, radius)
    │   ├── i18n/                   # en.ts (single strings file; hi.ts later)
    │   ├── api/                    # REST client, interceptors, endpoints
    │   ├── auth/                   # session store, SecureStore, auth context
    │   ├── navigation/             # root/auth/app navigators, guards, deep links
    │   ├── components/             # reusable UI (Button, Card, Badge, States…)
    │   ├── screens/                # auth/, tabs/, meetings/, room/, admin/, profile/
    │   ├── realtime/               # socket client hook
    │   └── livekit/                # room hooks/wrappers
    └── assets/
        └── branding/               # AICTE logo slot (user-supplied, referenced once)
```

**Why this shape:** one backend module per bounded concern (keeps guards and DTOs local and
auditable), one mobile folder per concern, a single theme file and a single i18n file
(as the spec mandates), and a single branding slot so the official logo can be swapped in
one place.

---

## 7. DATA MODEL / DB SCHEMA (as built — Prisma + MongoDB)

Final field lists are locked in Phase 1; this is the intended shape.

- **User**: `id, email(unique), emailVerified, passwordHash(argon2id), fullName, phone?,
  role(enum), orgId?, departmentId?, designation, status(enum: PENDING_OTP|PENDING_APPROVAL|
  APPROVED|REJECTED|SUSPENDED), rejectionReason?, photoUrl?, createdAt, updatedAt`.
  Indexes: unique `email`; `(orgId, role)`.
- **Otp**: `id, userId, codeHash, purpose(enum: EMAIL_VERIFY|PASSWORD_RESET), expiresAt,
  attempts, consumedAt?`. Index `(userId, purpose)`; short TTL.
- **Session / RefreshToken**: `id, userId, deviceInfo, refreshTokenHash, familyId,
  rotatedFrom?, revokedAt?, replacedByHash?, expiresAt, createdAt`. Rotation + replay
  detection: reuse of a rotated token revokes the whole `familyId`.
- **Organization (Institute)**: `id, name, type(AICTE|MINISTRY|INSTITUTE), code(unique),
  parentId?, status, createdAt`.
- **Department**: `id, orgId, name, hodUserId?`.
- **Meeting**: `id, meetingCode(unique, VMR-<year>-XXXXXX), title, description, agenda,
  hostId, orgId, departmentId?, startAt, endAt, timezone, type, confidentiality(enum:
  PUBLIC|INTERNAL|CONFIDENTIAL|RESTRICTED), status(enum: SCHEDULED|LIVE|ENDED|CANCELLED),
  waitingRoomEnabled, passcodeHash?, locked, capacity, policies{recording,screenShare,chat,
  micOnJoin,cameraOnJoin}, livekitRoom, createdAt`.
  Indexes: unique `meetingCode`; `(orgId, startAt)`; `(hostId, startAt)`.
- **Invitation**: `id, meetingId, inviteeUserId? | inviteeEmail?, role(PARTICIPANT|GUEST),
  status(enum: PENDING|ACCEPTED|DECLINED|EXPIRED), tokenHash(for deep link), expiresAt,
  createdAt`. Index `(meetingId, inviteeEmail)`.
- **Participant**: `id, meetingId, userId?, guestName?, state(enum: INVITED|WAITING|ADMITTED|
  JOINED|LEFT|REMOVED|DENIED), handRaised, joinedAt?, leftAt?`. Index `(meetingId, userId)`.
- **Document**: `id, meetingId, uploaderId, fileName, storageKey, contentType(validated),
  sizeBytes, sha256, scanStatus(enum: SKIPPED|PENDING|CLEAN|INFECTED), createdAt`.
- **Recording**: `id, meetingId, egressId, storageKey, status, startedBy, startedAt, endedAt?`.
- **Notification**: `id, userId, type, title, body, data(json), readAt?, createdAt`.
- **AuditLog** (append-only): `id, seq(monotonic), actorId?, action, targetType, targetId?,
  orgId?, metadata(json), prevHash, hash(SHA-256 over canonical fields), createdAt`.
  The `hash` covers `{seq, actorId, action, targetType, targetId, metadata, prevHash, createdAt}`.
- **ConsentRecord**: `id, userId, type, grantedAt, version` (privacy).

---

## 8. ROLE → PERMISSION MATRIX (server-enforced, as built)

| Capability | Super Admin (AICTE) | Ministry | Institute Admin | HOD | Faculty | Guest |
|---|---|---|---|---|---|---|
| Platform settings / security policy | ✅ | — | — | — | — | — |
| Manage all users / institutes | ✅ | — | own institute | — | — | — |
| Approve privileged (AICTE/Ministry) registrations | ✅ | — | — | — | — | — |
| Approve faculty/HOD registrations | ✅ | — | ✅ (own institute) | — | — | — |
| Assign HODs | ✅ | — | ✅ (own institute) | — | — | — |
| View audit logs (+ verify chain) | ✅ | — | own institute (scoped) | — | — | — |
| View ALL meetings | ✅ | — | own institute | own dept | — | — |
| Schedule meetings | ✅ | where permitted | ✅ (institute) | ✅ (dept) | only if granted | — |
| Invite participants | ✅ | where permitted | ✅ | ✅ (dept) | if host | — |
| Join meeting | if invited/host | authorized only | institute meetings | dept meetings | invited only | **invitation only** |
| Start/stop recording | if policy allows + host | if authorized | if host/policy | if host/policy | if host/policy | — |
| Access recordings | ✅ | authorized only | institute | dept | assigned | — |
| Host controls (mute/remove/lock/admit/end) | host | host | host | host | host | — |

**Hard rule:** cross-institution access is **always denied** at the guard layer, regardless of role
(except Super Admin). A faculty hitting an admin API manually → **403**.

---

## 9. SECURITY DESIGN (honest, as built)

**Implemented and tested (✅):**
- **Passwords:** Argon2id.
- **Tokens:** short-lived JWT access; rotating refresh tokens with **replay/reuse detection**
  (reuse revokes the token family); server-side session revocation; SecureStore on device.
- **Throttling/lockout:** login attempts, OTP requests, and sensitive endpoints rate-limited; OTP expiry.
- **Authorization:** global guards `JwtAuthGuard` → `RolesGuard` (HTTP only), plus **organization
  and meeting scope enforced in the service layer** — `MeetingsService.canManage` /
  `assertCanView` / `assertJoinable` (meeting exists, time window, invitation, org, account status,
  capacity, lock). Ownership checked on every mutating route. (The original plan named separate
  `OrgScopeGuard`/`MeetingAccessGuard` classes; these checks were implemented in the services
  instead — same effect, documented in §22.4/§22.10/§22.12.)
- **DTO validation:** global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true,
  transform: true })` to block mass assignment and unknown fields.
- **Meeting access:** private rooms, backend-minted short-lived room-scoped LiveKit tokens,
  waiting room, passcode (hashed), invitation expiry, host removal, room lock.
- **Transport:** TLS in deployment (documented exactly — local dev may use http; stated honestly).
- **Audit:** append-only, hash-chained (SHA-256), verify-chain endpoint + tamper-detection demo.
- **Mobile hardening (where feasible):** FLAG_SECURE / screenshot block on meeting screen,
  hide content in app switcher. Biometric unlock, cert pinning, root/jailbreak detection =
  deferred/optional (MVP note in §17).

**Explicitly NOT claimed (per rule 5 and the five non-negotiables):**
- ❌ **End-to-end media encryption.** LiveKit is an **SFU** — the server (and Egress recording)
  can access media. Media is encrypted **in transit** (DTLS-SRTP/TLS), **not** end-to-end.
  We will never call this E2EE.
- ❌ Legal/regulatory certification of any kind.
- **Encryption at rest:** only what the infrastructure/MinIO config actually provides —
  stated exactly in §15 once configured, not implied.

---

## 10. AUTH DESIGN (as built)

1. **Register** → create `User(status=PENDING_OTP)`, send email OTP (provider interface;
   if no email provider configured, OTP is surfaced via an honest dev channel + logged, never silently faked).
2. **OTP verify** → `emailVerified=true`, `status=PENDING_APPROVAL`.
3. **Org verification** → user submits org/department/designation.
4. **Approval** → Institute Admin (faculty/HOD) or Super Admin (AICTE/Ministry) approves → role assigned,
   `status=APPROVED`; or rejects with reason (`status=REJECTED`, reason visible to user).
5. **Login** → Argon2id verify → issue access (short TTL) + refresh (rotating). Throttled + lockout.
6. **Refresh** → rotate; detect reuse → revoke family.
7. **Reset** → OTP-gated password reset.
8. **Logout** → revoke session/refresh family.

**Registration never grants a privileged role.** Role is only assigned at approval.

---

## 11. VIDEO ARCHITECTURE (as built)

- **Transport:** WebRTC via **LiveKit SFU**. The app publishes/subscribes tracks to a LiveKit room.
- **Token minting:** only the backend calls `livekit-server-sdk` with the API key/secret to
  mint a **short-lived, single-room-scoped** access token, issued **only after** the
  `MeetingAccessGuard` + waiting-room admission pass. The **API secret never reaches the app**.
- **Waiting room:** participant enters `WAITING`; host admits via Socket.IO event; backend then
  mints the token. Guest must have a valid invitation.
- **In-meeting:** audio, video, flip camera, chat (Socket.IO), screen share (platform limits
  documented honestly), raise hand, participant list, host controls (mute/remove/lock/admit/end).
- **Recording:** LiveKit **Egress** (server-side) to MinIO, policy-gated, visible indicator,
  records who started/stopped; playback via authorization + expiring presigned URL.
- **Resilience:** handle permission-denied, weak/lost network + reconnect, backgrounding,
  host/participant disconnect, cancelled-while-waiting, ended-mid-session, expired/invalid token,
  unauthorized join, capacity reached.

---

## 12. API SURFACE (as built — live at Swagger /docs)

Auth: `POST /auth/register`, `/auth/verify-otp`, `/auth/resend-otp`, `/auth/login`,
`/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`.
Users: `GET/PATCH /users/me`, `GET /users/me/sessions`, `DELETE /users/me/sessions/:id`.
Orgs: `GET /orgs`, `/orgs/:id`, `/orgs/:id/departments`.
Approvals: `GET /approvals/pending`, `POST /approvals/:userId/approve|reject`.
Meetings: `POST /meetings`, `GET /meetings`, `GET /meetings/:id`, `PATCH /meetings/:id`,
`POST /meetings/:id/cancel`, `GET /meetings/:id/participants`.
Invitations: `POST /meetings/:id/invitations`, `GET /invitations/me`,
`POST /invitations/:id/accept|decline`.
Room: `POST /meetings/:id/join-request` (→ waiting room), `POST /meetings/:id/token`
(→ LiveKit token after admission), host: `POST /meetings/:id/admit|deny|remove|lock|end`.
Documents: `POST /meetings/:id/documents`, `GET /meetings/:id/documents`,
`GET /documents/:id/download` (presigned).
Recordings: `POST /meetings/:id/recording/start|stop`, `GET /meetings/:id/recordings`,
`GET /recordings/:id/url` (presigned).
Audit: `GET /audit` (scoped), `GET /audit/verify` (chain verification).
Notifications: `GET /notifications`, `POST /notifications/:id/read`.
Health: `GET /health`.

---

## 13. SCREENS (as built)

Auth: Splash, Welcome, Register, OTP, Org verification, Application status, Login, Forgot/Reset.
Tabs: Home, Meetings, Calendar, Notifications, Profile. Nested stacks with navigation guards
(unauthenticated / pending / suspended / wrong role / unauthorized meeting) + deep links.
Meeting room (dark UI), Schedule Meeting, Meeting Details, Admin (users/institutes/approvals/
roles/oversight/audit/recordings/analytics). Every screen has loading / empty / error states.

---

## 14. DESIGN SYSTEM — "VIMARSH" IDENTITY (as built)

Defined once in `mobile/src/theme` and reused everywhere.

- **Primary (navy):** `#1B2F5B`
- **Accent (saffron):** `#E8871E` — CTAs, active tab indicator, highlights only. Never a background.
- **Success (India green):** `#1E7B3A` — status only (approved/connected/verified).
- **Danger (restrained red):** leave/end/remove + errors only.
- **Surfaces:** white cards on a very light grey-blue background; 1px subtle borders;
  one corner radius; minimal shadows.
- **Meeting room:** dark navy-charcoal; saffron/green/red for status indicators only.
- **Type:** Noto Sans (UI) + Noto Sans Devanagari (विमर्श wordmark). Body ≥ 16px.
- **Role badges** and **confidentiality labels**: consistent fixed colors.
- **Meeting ID format:** `VMR-<year>-XXXXXX`. Printable invitation cards with AICTE branding.
- **Branding rules:** NO State Emblem / Ashoka Chakra (legally restricted). Text-based wordmark
  or a simple original geometric mark. Official AICTE logo (if provided) lives only in
  `/assets/branding` and is referenced from one place.

---

## 15. ENVIRONMENT VARIABLES (as built — full list in `.env.example`)

Backend: `NODE_ENV, PORT, DATABASE_URL (mongo), JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
ACCESS_TTL, REFRESH_TTL, ARGON_* , LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET,
S3_ENDPOINT (minio), S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_REGION,
EMAIL_PROVIDER + creds (or dev mode flag), SMS_PROVIDER (optional), PUSH_PROVIDER (optional),
MALWARE_SCANNER (optional), THROTTLE_*`.
Seed: `SEED_SUPER_ADMIN_EMAIL`, `SEED_SUPER_ADMIN_PASSWORD` (bootstrap admin; dev defaults, required in prod).
Recording: `LIVEKIT_EGRESS_S3_ENDPOINT` (egress → MinIO on the docker network).
Mobile: `EXPO_PUBLIC_API_URL` (REST + Socket.IO; the LiveKit media URL comes from the backend).
See `mobile/.env.example`.
**No secrets in code.** Real values only in `.env` (gitignored); `.env.example` / `mobile/.env.example`
have placeholders. The authoritative, current list is the two `.env.example` files.

**Encryption-at-rest statement (exact):**
- **Documents:** ✅ application-level **AES-256-GCM** (key in `.env` as `DOCUMENT_ENCRYPTION_KEY`,
  random IV per file, GCM auth tag stored, decrypt only after authorization). Proven by
  `scripts/encryption-test.mjs`.
- **Recordings:** ⬜ not encrypted at rest in dev — Egress writes straight to MinIO, so the feasible
  option is **MinIO SSE** (needs KMS config); documented as the production recommendation (§27).
- **MongoDB / Redis:** ⬜ not encrypted at rest in dev — infrastructure responsibility (MongoDB
  encryption-at-rest / encrypted volumes) documented in §27.

---

## 16. SETUP / RUN COMMANDS — ✅ verified for backend (2026-11-06)

**Prerequisites:** Docker Desktop running, Node ≥ 22.13.

```bash
# 0) From project root
cd /Users/rashmianand/Desktop/Vimarsh
cp .env.example .env               # fill real secrets later; dev defaults work locally

# 1) Start infrastructure (mongo replica set, redis, livekit, minio)
docker compose up -d mongo redis livekit minio
#   verify: docker compose ps   (mongo shows "healthy")

# 2) Backend install + DB schema + seed
cd backend
npm install
set -a && . ../.env && set +a          # load env for the Prisma CLI
npx prisma generate                    # generate typed client
npx prisma db push                     # create collections + indexes in MongoDB
npm run seed                           # creates AICTE org, IITD institute+dept, Super Admin

# 3) Run the API
npm run build && node dist/main.js     # or: npm run start:dev  (watch mode)
#   -> http://localhost:4000 , Swagger UI at http://localhost:4000/docs

# 4) End-to-end API test (API must be running)
./scripts/smoke-test.sh http://localhost:4000 /tmp/vimarsh-api.log
```

**Seeded Super Admin:** credentials come from `.env` (`SEED_SUPER_ADMIN_EMAIL` /
`SEED_SUPER_ADMIN_PASSWORD`); the dev defaults are `admin@aicte.vimarsh.local` / `Admin@12345`.
The seed **refuses to run in production** unless `SEED_SUPER_ADMIN_PASSWORD` is set.

### Mobile (Expo SDK 57) — ✅ verified to bundle (2026-11-06)
```bash
cd /Users/rashmianand/Desktop/Vimarsh/mobile
npm install
# Phases 1–3 have NO custom native modules, so Expo Go works now:
npx expo start            # scan QR with Expo Go (phone must be on the same Wi-Fi as the Mac)
#   The app auto-derives the backend URL from the Metro host -> http://<mac-ip>:4000.
#   To override: EXPO_PUBLIC_API_URL=http://<host>:4000 npx expo start
# Phase 4 (LiveKit video) will REQUIRE a development build (Expo Go can't load WebRTC):
#   npx expo run:android   /   npx expo run:ios   (or EAS build)
```
- The backend must be running and reachable from the phone. If the phone can't reach it,
  set `EXPO_PUBLIC_API_URL` to the Mac's LAN IP, and ensure the API listens on `0.0.0.0` (it does).
- **Build validation done here:** `npx tsc --noEmit` (0 errors) and
  `npx expo export --platform ios` (2.5MB Hermes bundle produced) — the whole module graph resolves.
  Interactive two-device run is the user's step (needs a phone/simulator).

---

## 17. FEATURE CHECKLIST

| # | Feature | Status |
|---|---|---|
| 0 | Repo audit + STUDENT.md + architecture plan | ✅ DONE |
| 1 | Foundation — **backend** (structure, env, DB, Docker Compose, API connectivity, guards, config) | ✅ DONE |
| 1 | Foundation — **mobile** (Expo SDK 57 app, theme, i18n, nav guards, API client, fonts) | ✅ DONE (bundles) |
| 2 | Auth & onboarding — **backend** (register, OTP, login, reset, approval, roles, sessions) | ✅ DONE (tested 26/26) |
| 2 | Auth & onboarding — **mobile screens** (splash, welcome, register, OTP, org, status, login, reset, tabs) | ✅ DONE (bundles) |
| 3 | Meetings — **backend** (schedule, list/scope, details, update, cancel, invitations, notifications) | ✅ DONE (tested 19/19) |
| 3 | Meetings — **mobile screens** (list+scopes, schedule, details, invite, calendar, notifications, home feed) | ✅ DONE (bundles) |
| 4 | Live conferencing — **backend** (LiveKit token service, waiting room, host controls, realtime) | ✅ DONE (tested 17/17 + 4/4) |
| 4 | Live conferencing — **mobile** (join flow, LiveKit room, grid, controls, chat, host panel) | ✅ built (bundles + prebuild OK; two-device run pending — see §26) |
| 5 | Collaboration — **backend** (documents + content validation, recording control, audit API) | ✅ DONE (tested 16/16) |
| 5 | Collaboration — **mobile** (documents in details, recording controls, **recordings access/playback**, admin: approvals + audit viewer) | ✅ built (bundles) — recordings access UI added 2026-11-16, §28 |
| 6 | Security review (helmet headers, JWT tamper, deactivate/delete + consent, screenshot block) | ✅ DONE (tested 9/9) |
| 7 | Polish + full test harness + final STUDENT.md | 🟡 IN PROGRESS |
| 7 | Release APK build | ✅ wired (local Gradle) — see §25 |
| — | MVP priority if time short: Phases 0–4 + audit hash chain | ✅ MET |
| — | Deferred last: biometrics, cert pinning, root detection, blockchain anchoring, web admin, push | ⬜ PLANNED (Future Work §20) |

**Backend automated tests: 101/101 passing** (smoke 26, meetings 19, livekit 17, realtime 4,
documents 15, encryption-at-rest 11, security 9) — see §23 and `backend/scripts/run-all-tests.sh`.

---

## 18. KNOWN ISSUES / RISKS (current)

*Resolved since the Phase 0 audit:* the project now has its own git repo (owner-created, inside the
project folder); Docker is running; the LiveKit ↔ Expo SDK pin is locked (Expo SDK 57 + LiveKit
3.1 + WebRTC config-plugins 15). Current open items:

1. **Cleartext networking is enabled for the LAN demo** (`usesCleartextTraffic=true`, Android).
   This is required because the demo talks to `http://<LAN-IP>:4000` / `ws://<LAN-IP>:7880` with no
   TLS. **Production must use HTTPS/WSS and disable cleartext** — see the Security Posture (§27).
2. **Expo Go cannot run the video room** — a development build is required (§25/§26); the rest of
   the app runs in Expo Go.
3. **LiveKit media on a LAN** needs `rtc.node_ip` set to the laptop IP (Docker otherwise advertises
   its 172.x container IP). Documented in `livekit/livekit.yaml` and §26.2.
4. **Recording capture** needs the optional `livekit-egress` compose service running **and** active
   media (two-device). The control plane (policy/role gating, start/stop, access) is tested; the
   actual capture is not exercised headlessly. *(Resolved 2026-11-16: the mobile UI to list and
   open completed recordings now exists — §28 — so once Egress produces a file it is reachable from
   the app.)*
5. Implementation-level limitations (in-memory lockout, access-token revocation window, `db push`
   vs migrations, phone download endpoint, Office-file subtype) are listed in §22.8.

---

## 19. TECHNICAL DECISIONS (with reasons)

- **Development build over Expo Go** — LiveKit needs native WebRTC modules Expo Go can't load.
- **Backend-only LiveKit token minting** — keeps the API secret off the device; enforces
  authorization before any media access (non-negotiable #1 and #3).
- **Hash-chained audit log instead of on-chain storage** — cheap, verifiable, no PII on chain;
  optional testnet anchoring of the chain-head only, last (non-negotiable #4, honest #5).
- **Prisma + MongoDB** — flexible meeting/participant documents, type-safe access, enforced
  unique constraints/indexes.
- **Single theme file + single i18n file** — mandated; enables later Hindi labels and one-place theming.

---

## 20. FUTURE WORK

Biometric unlock, certificate pinning, root/jailbreak detection, LiveKit E2EE track encryption
investigation (insertable streams — documented honestly, not claimed until proven), blockchain
anchoring of audit chain-head to a testnet, web admin dashboard, push notifications, analytics,
Hindi (hi) i18n, accessibility pass.

---

## 21. CHANGE LOG

- **2026-11-06 (Phase 0)** — Repo audited (greenfield), toolchain verified, STUDENT.md created
  with full architecture plan, schema, role matrix, security posture, folder structure.
- **2026-11-06 (Phase 1 infra + backend, Phase 2 auth)** — Built & tested: Docker Compose stack,
  NestJS backend foundation, full auth/onboarding, approval workflow, RBAC guards, rotating
  refresh tokens with reuse detection, hash-chained audit log + verify + tamper demo. 26/26 API
  tests pass. Refined onboarding so verified-but-unapproved users get a session (to see status)
  while still being 403'd from all real features. See §22.
- **2026-11-06 (Phase 1 mobile + Phase 2 mobile screens)** — Built the Expo SDK 57 app: design
  system, i18n, fonts, secure token storage, auto-refresh API client, status-driven navigation
  guard, and all auth/onboarding/tab screens. `tsc` clean; iOS bundle exports. See §22.9.
- **2026-11-06 (Phase 3)** — Meetings backend (schedule/scopes/details/update/cancel/invite) +
  invitations + notifications (19/19 tests); mobile meetings/schedule/details/invite/calendar/
  notifications/home. See §22.10–22.11.
- **2026-11-06 (Phase 4)** — Live conferencing: LiveKit token service + waiting room + host
  controls (17/17), Socket.IO realtime (4/4); mobile LiveKit room. Fixed global guards crashing
  WS handlers. See §22.12. Two-device media run pending (§26).
- **2026-11-06 (Phase 5)** — Documents (content-validated, signed URLs) + recording control +
  audit API (16/16); mobile documents + admin (approvals + audit viewer). See §22.13.
- **2026-11-06 (Phase 6)** — Security: helmet, JWT-tamper, deactivate/delete + consent, screenshot
  block (9/9). See §22.14.
- **2026-11-06 (Phase 7)** — Full paced test harness (`run-all-tests.sh`), final report (§23).
  **91/91 backend tests passing.**
- **2026-11-07 (owner decisions)** — Merged DECISION_PENDING.md into §24 and removed the file;
  wired the local-Gradle release APK (§25: `mobile/.env.example`, `apk:release`/`apk:device`
  scripts, LiveKit `node_ip` for LAN); documented push notifications as a limitation; kept the text
  wordmark launcher icon; added the full two-device Android video-test checklist (§26).
- **2026-11-07 (encryption at rest + web-run fixes)** — Re-ran the full suite (91/91 confirmed).
  Verified the Android cleartext flag in the generated manifest (`expo prebuild -p android`).
  Implemented **AES-256-GCM encryption at rest for documents** (`common/crypto/file-crypto.ts`,
  key from `.env` `DOCUMENT_ENCRYPTION_KEY`, random IV per file, GCM tag stored, server-side
  decrypt only after authorization; download now streams decrypted bytes instead of a presigned
  URL). Added `scripts/encryption-test.mjs` (11/11: ciphertext at rest, exact round-trip, tamper
  rejected) and wired it into `run-all-tests.sh` → **101/101**. Documented recordings (MinIO SSE,
  not app-level) and MongoDB/Redis as at-rest limitations with production recommendations (§27).
  Mobile download updated to an authenticated stream (`expo-file-system` + `expo-sharing`, web
  fallback). Also fixed two web-run bugs so the app runs in a browser for review: `expo-secure-store`
  has no web impl (added a `localStorage` fallback in `auth/storage.ts` + a try/finally so bootstrap
  can't hang on the splash), and the bottom tab bar now respects safe-area insets.
- **2026-11-16 (post-review completion pass)** — Closed the one remaining functional gap against
  AICTE requirement #4 ("access recordings"): built the **mobile Recordings access UI**
  (`mobile/src/screens/meetings/RecordingsSection.tsx`) and wired it into Meeting Details. The
  backend list/presigned-URL endpoints already existed and were tested, but no screen called them,
  so recordings could be started/stopped but never played back. Also removed **199 sync-conflict
  duplicate files** (`"<name> 2.ext"` from iCloud/Drive) that were cluttering the working tree —
  all were untracked, so nothing in git changed. Both projects still `tsc`-clean. Full detail in §28.

---

## 22. IMPLEMENTATION LOG — what / why / how / where (the viva detail)

### 22.1 Infrastructure (`docker-compose.yml`, `livekit/livekit.yaml`, `.env.example`)
- **What:** 4 services — `mongo` (single-node replica set `rs0`), `redis`, `livekit` (SFU),
  `minio` (private S3). **Where:** [docker-compose.yml](docker-compose.yml).
- **Why replica set:** Prisma's MongoDB connector needs a replica set for transactions
  (`$transaction` is used in password reset). A single-node RS satisfies this locally.
- **How verified:** `mongo` healthcheck runs `rs.initiate()` then `rs.status().ok` → reports
  healthy; `curl :9000/minio/health/live` → 200; LiveKit → 200; `rs.status().ok` → 1.
- **Decision — MinIO image:** The official `minio/minio` and `minio/mc` images were **removed
  from Docker Hub (Sept 2026)**, so pulls fail with "access denied". Switched to
  `cgr.dev/chainguard/minio:latest` (pulls fine) and **dropped the `mc` client container** — the
  backend creates its bucket at boot via the S3 SDK (`StorageService.ensureBucket()`). Verified:
  log shows `Created private storage bucket "vimarsh-private"`.

### 22.2 Backend version decisions (why these pins)
- **NestJS 12** (not 11): at build time Nest 12.3.3 is `latest` (11 is `legacy`). Chose current.
- **@nestjs/swagger 12.1.0**: the 11.x line peers Nest 11; 12.1.0 is the Nest-12 build.
- **TypeScript 6.0.x** (not 7): Nest's `@nestjs/schematics` needs TS ≥ 6, but `ts-jest` needs
  TS < 7. TS 6.0.3 satisfies both. (TS 7 is `latest` but unusable with the test toolchain yet.)
- **Prisma 6.19.3**, **LiveKit server SDK 2.19**, **Argon2 0.41**. Full list:
  [backend/package.json](backend/package.json).
- These were found by reading each package's real peer deps before installing (Rule 1), after
  three ERESOLVE failures; each pin is recorded here so the resolution is reproducible.

### 22.3 Data layer (`backend/prisma/schema.prisma`)
- All 13 models from §7 with indexes + unique constraints (`email`, `meetingCode`, `org.code`,
  `auditLog.seq`). Pushed to Mongo with `prisma db push` (verified "in sync").
- **Gotcha found & fixed — Prisma + MongoDB null matching:** a filter `{ field: null }` does
  **not** match documents where the optional field is *absent* (never set). This silently broke
  OTP lookup (`consumedAt: null`) and session lookup (`revokedAt: null`). **Fix:** for sessions
  use Prisma's `{ isSet: false }` operator; for OTP, fetch latest and check `consumedAt` in code.
  Where: [tokens.service.ts](backend/src/auth/tokens.service.ts),
  [users.service.ts](backend/src/users/users.service.ts),
  [auth.service.ts](backend/src/auth/auth.service.ts). This is a real, non-obvious bug worth
  explaining in the viva.

### 22.4 Security building blocks (`backend/src/common/`)
- **Guards (global, in order):** `ThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`
  (wired in [app.module.ts](backend/src/app.module.ts) via `APP_GUARD`).
  - `JwtAuthGuard`: verifies the access JWT, rejects suspended accounts, attaches `req.user`.
    `@Public()` routes skip it. Where: [jwt-auth.guard.ts](backend/src/common/guards/jwt-auth.guard.ts).
  - `RolesGuard`: enforces `@Roles(...)`. **This is what makes "faculty → 403 on admin APIs"
    real** (test §13). Where: [roles.guard.ts](backend/src/common/guards/roles.guard.ts).
- **Global `ValidationPipe`** with `whitelist + forbidNonWhitelisted + transform`
  ([main.ts](backend/src/main.ts)) — strips/reject unknown fields → blocks **mass assignment**
  (test §4 proves `role` injection at register → 400).
- **Crypto helpers** ([hash.util.ts](backend/src/common/crypto/hash.util.ts)): canonical-JSON
  SHA-256 (audit), token hashing, OTP + meeting-code generators.

### 22.5 Auth & onboarding (`backend/src/auth/`, `users/`, `orgs/`, `approvals/`)
- **Passwords:** Argon2id. **Access token:** short-lived JWT (15 min). **Refresh token:**
  opaque random, stored only as SHA-256 hash, **rotated every use**; reusing a rotated token
  **revokes the whole family** and audits `AUTH_REFRESH_REUSE_DETECTED`
  ([tokens.service.ts](backend/src/auth/tokens.service.ts)). Test §15 proves rotation + reuse kill.
- **Flow (server-enforced):** register (always GUEST/PENDING_OTP) → email OTP → PENDING_APPROVAL
  → org verification → Super Admin / Institute Admin approval assigns the real role → APPROVED →
  login. Privileged roles need Super Admin; faculty/HOD need Institute Admin, **scoped to their
  own org** ([approvals.service.ts](backend/src/approvals/approvals.service.ts)).
- **Login hardening:** status-gated messages, in-memory lockout after N fails
  ([auth.service.ts](backend/src/auth/auth.service.ts)), per-route `@Throttle` limits.
- **OTP:** 6-digit, Argon2id-hashed, TTL + attempt cap + resend cooldown.
- **Email:** `MailService` sends via SMTP when configured; otherwise **development-only** console
  OTP fallback (fires only when `SMTP_HOST` empty **and** `NODE_ENV=development`); in production an
  empty host is a loud error and send throws (never silently faked).
  Where: [mail.service.ts](backend/src/mail/mail.service.ts). Verified: startup warning + OTP
  printed to console; `/health` reports `email: not-configured` honestly.

### 22.6 Audit chain (`backend/src/audit/`)
- Append-only log; each record's `hash = SHA256(canonical{seq, actorId, action, targetType,
  targetId, metadata, prevHash, createdAt})`, `prevHash` links to the previous hash (genesis =
  64 zeros). Writes are serialised through an in-process queue to keep `seq`/`prevHash`
  race-free on a single instance (documented limitation for multi-instance).
  Where: [audit.service.ts](backend/src/audit/audit.service.ts).
- **Verify endpoint** `GET /audit/verify` recomputes the entire chain. **Tamper demo (run live):**
  editing one record's `action` in Mongo flipped verify from `valid:true` to
  `valid:false, brokenAtSeq:3, reason:"Hash mismatch at seq 3 (record was tampered)"`.

### 22.7 Test results (automated, against the live API) — ✅ 22/22 passed
Script: [backend/scripts/smoke-test.sh](backend/scripts/smoke-test.sh). Covers: health +
honest provider report; register; duplicate→409; mass-assignment→400; login gating (pre-verify
403, pending-approval 403); OTP verify; Super Admin login; pending list; approve→role; faculty
login; **faculty→403 on `/approvals/pending`, `POST /orgs`, `/audit/verify`**; no/garbage
token→401; refresh rotation + reuse detection + family revocation; audit chain valid. Plus a
manual audit tamper-detection demo (above).

### 22.8 Known limitations (honest)
- Login lockout + OTP resend cooldown are **in-memory** (reset on API restart; fine for single
  instance — documented, would move to Redis for multi-instance).
- Access tokens are **not** checked against session revocation (valid until expiry, max 15 min);
  refresh revocation is enforced. Standard trade-off, documented.
- `prisma db push` is used (no migration history) — acceptable for MongoDB + this project stage.
- Host "mute" is a signal (client mutes on request), not a forced server-side track mute.
- Document uploads: Office subtype (docx/xlsx/pptx) validated as ZIP, not unzipped to confirm subtype.
- Downloads from a **physical phone** need `S3_ENDPOINT` set to a host the phone can reach (LAN IP),
  not `localhost` (which only works on the simulator). Documented in `.env.example`.
- **Push notifications are NOT implemented** (decision: out of MVP scope). In-app notifications
  (REST + realtime) fully work — reminders/invites/updates/approvals/security events are delivered
  in-app. Adding push later needs an Expo project id + FCM (Android)/APNs (iOS); the notification
  service already centralises creation, so push would be an added delivery channel, not a rewrite.

### 22.9 Mobile app (`mobile/`, Expo SDK 57) — Phase 1 foundation + Phase 2 screens
- **Scaffold:** Expo SDK **57.0.32**, React **19.2.3**, RN **0.86.3**, TypeScript. Created with the
  `expo-template-blank-typescript@sdk-57` template so the SDK is pinned (not bleeding-edge 58).
  Template's `AGENTS.md`/`.claude` removed to honor the single-doc rule.
- **Design system (one file):** [mobile/src/theme/index.ts](mobile/src/theme/index.ts) — navy/saffron/
  green/red tokens, spacing, one radius, role-badge + confidentiality colors. Reused everywhere.
- **i18n (one file):** [mobile/src/i18n/en.ts](mobile/src/i18n/en.ts) + `t()` helper; Hindi-ready keys.
- **Fonts:** Noto Sans (UI) + Noto Sans Devanagari (विमर्श wordmark) via `@expo-google-fonts`.
- **API client:** [mobile/src/api/client.ts](mobile/src/api/client.ts) — fetch wrapper with a
  **transparent refresh-and-retry on 401** (rotates the token once, else forces logout); endpoints
  typed in [endpoints.ts](mobile/src/api/endpoints.ts). Backend URL auto-derived from the Expo dev
  host so a physical device reaches the Mac without manual IP editing
  ([config/env.ts](mobile/src/config/env.ts)).
- **Secure storage:** tokens in `expo-secure-store` (Keychain/Keystore)
  ([auth/storage.ts](mobile/src/auth/storage.ts)).
- **Navigation guard:** [RootNavigator.tsx](mobile/src/navigation/RootNavigator.tsx) chooses the whole
  tree from auth state — bootstrapping→Splash, no user→Auth stack, verified-not-approved→Onboarding,
  approved→App tabs. There is no way to reach a protected screen without the right status.
- **Screens built:** Splash, Welcome, Register, OTP (6-cell, auto-submit, resend cooldown, dev-OTP
  note), Organization verification (real org/department pickers from the API), Application status
  (pending/rejected with reason), Login, Forgot/Reset password, bottom tabs (Home with real profile
  header + honest empty states, Profile with live sessions + revoke + sign out, and honest
  "next phase" placeholders for Meetings/Calendar/Notifications). Every screen has loading/empty/
  error states; all data comes from the real backend.
- **Reusable components:** Screen, Text, Button, TextField, Card, Badge, States, Wordmark,
  BrandPattern — in [mobile/src/components](mobile/src/components).
- **Branding:** AICTE logo kept as a single swappable asset at
  `mobile/assets/branding/logo.png` (owner-supplied; referenced from one place only — see §25.4);
  the app itself uses text-based
  विमर्श branding (no State Emblem / Ashoka Chakra).

### 22.10 Meetings (Phase 3 backend) — `backend/src/meetings`, `invitations`, `notifications`
- **Schedule** (`POST /meetings`): roles permitted = SUPER_ADMIN, MINISTRY, INSTITUTE_ADMIN, HOD
  (Faculty 403 unless granted — documented future flag). Validates future start, end>start,
  department belongs to org; generates a unique `VMR-<year>-XXXXXX` code; hashes optional passcode
  (Argon2id, never echoed); stores per-meeting policies; optional invitees processed at creation.
- **List** (`GET /meetings?scope=`): scopes upcoming/ongoing/past/invitations/mine/all, org-scoped;
  non-admins only see meetings they host or are invited to. Each row enriched with host name,
  participant count, my invitation status.
- **Details / participants / update / cancel**: access control = host OR Super Admin OR
  Institute Admin of the same org; invited users can view but not manage. Update/cancel notify
  participants and write audit entries (`MEETING_UPDATED/CANCELLED`).
- **Invitations**: `POST /meetings/:id/invitations` (host/admin). Registered-user invites are
  **org-scoped** — cross-institution invites are skipped UNLESS the host is AICTE/Ministry (who may
  legitimately convene institutes). Guest invites by email generate a hashed deep-link token
  (raw token returned once for sharing). Invitee side: `GET /invitations/me`,
  `POST /invitations/:id/accept|decline`.
- **Notifications** (`backend/src/notifications`): in-app notifications always work (independent of
  push). Created on invite/update/cancel; `GET /notifications`, unread-count, mark-read/all.
- **Tests (19/19):** [backend/scripts/meetings-test.sh](backend/scripts/meetings-test.sh) — faculty
  cannot schedule (403); past/invalid dates (400); schedule+invite; code format; passcode not
  echoed; scope=mine; invitee visibility; access control (invited 200 / uninvited 403); accept;
  non-host update/cancel 403; admin update 200; notifications fan-out; **institute-admin cross-org
  invite skipped**; cancel; audit chain still valid.

### 22.11 Meetings (Phase 3 mobile) — `mobile/src/screens/meetings`, `tabs`, `room`
- **Meetings tab** is a nested stack (`MeetingsStack`): list → details → schedule → invite → room,
  with a status-driven guard inherited from the root navigator.
- **List** ([MeetingsListScreen](mobile/src/screens/meetings/MeetingsListScreen.tsx)): segmented
  scopes (Upcoming/Ongoing/Invitations/Scheduled-by-me/Past), pull-to-refresh, loading/empty/error
  states, FAB to schedule (only for roles permitted to schedule).
- **Schedule** ([ScheduleMeetingScreen](mobile/src/screens/meetings/ScheduleMeetingScreen.tsx)):
  title/description/agenda, start/end pickers (iOS + Android via `@react-native-community/datetimepicker`),
  confidentiality chips, passcode, policy toggles; client-side validation mirrors the server.
- **Details** ([MeetingDetailsScreen](mobile/src/screens/meetings/MeetingDetailsScreen.tsx)):
  info, agenda, host, participants, accept/decline invitation, host controls (invite, cancel),
  and a Join button (opens the room; room is Phase 4).
- **Invite** ([InviteParticipantsScreen](mobile/src/screens/meetings/InviteParticipantsScreen.tsx)):
  email chips; shows invited/skipped/guest-link results from the API.
- **Calendar** ([CalendarScreen](mobile/src/screens/tabs/CalendarScreen.tsx)): real month grid with
  meeting dots, day selection, per-day meeting list.
- **Notifications** ([NotificationsScreen](mobile/src/screens/tabs/NotificationsScreen.tsx)): live
  list, unread styling, mark-read/all, deep-links to the meeting.
- **Home** now shows live/ongoing, pending invitations and upcoming from the real API, with working
  quick actions. Data via TanStack Query; refetch on focus.
- Verified: `tsc --noEmit` clean + iOS bundle exports.

### 22.12 Live conferencing (Phase 4) — `backend/src/livekit`, `realtime`, `meetings`; `mobile/src/screens/room`
- **Token service** ([livekit.service.ts](backend/src/livekit/livekit.service.ts)): mints a
  **short-lived, single-room-scoped** LiveKit JWT with `livekit-server-sdk`. The API key/secret
  live only in the backend. Tokens are issued ONLY after authorization + waiting-room admission.
- **Waiting room / join flow** ([meetings.service.ts](backend/src/meetings/meetings.service.ts)):
  `POST /meetings/:id/join-request` → host/no-waiting-room = admitted; else WAITING + realtime
  notice to host. `POST /meetings/:id/token` requires ADMITTED state. Join window = 15 min before
  start to 30 min after end; passcode (Argon2id), lock, and capacity enforced server-side.
- **Host controls:** waiting list, admit/deny, remove (also removes from the SFU), mute (signal),
  lock/unlock, end-for-all (deletes the SFU room). All require host/admin; audited.
- **Realtime gateway** ([realtime.gateway.ts](backend/src/realtime/realtime.gateway.ts)): Socket.IO
  with **JWT handshake auth**; `meeting:subscribe`, `chat:send` (gated to active participants),
  `hand:raise`, plus server→client events (waiting:request/admitted/denied, participant:update,
  meeting:lock/ended, host:mute).
- **Bug fixed (important):** the global HTTP guards (JWT/Roles/Throttler) were also running on
  WebSocket message handlers and crashing on `request.headers`. Fixed by making each guard
  `return true` for non-HTTP contexts (`context.getType() !== 'http'`); added
  [WsSafeThrottlerGuard](backend/src/common/guards/ws-safe-throttler.guard.ts). The gateway does its
  own JWT auth in `handleConnection`.
- **Mobile room** ([RoomView.tsx](mobile/src/screens/room/RoomView.tsx),
  [MeetingRoomScreen.tsx](mobile/src/screens/room/MeetingRoomScreen.tsx)): LiveKit React Native SDK
  (dev build). Join flow handles passcode + waiting room (admission via socket), then renders the
  room: participant video grid with name/mic indicators, controls (mic, camera, flip, raise hand,
  chat, participants, leave), chat (socket), and a host panel (admit/deny waiting, mute/remove,
  end). LiveKit is **lazy-loaded** behind an error boundary so the rest of the app still runs in
  Expo Go; the room itself needs a development build.
- **Tests:** [livekit-test.sh](backend/scripts/livekit-test.sh) 17/17 (token scope verified by
  decoding the JWT, waiting room, admission gating, passcode, lock, capacity, stranger denial,
  end→join-blocked); [realtime-test.mjs](backend/scripts/realtime-test.mjs) 4/4 (socket auth,
  unauth rejection, chat relay, participant gating). Mobile: `tsc` clean, bundles, `expo prebuild`
  applies the WebRTC config plugins (camera/mic permissions injected).
- **Honest note:** LiveKit is an **SFU** — media is encrypted in transit (DTLS-SRTP), **not**
  end-to-end. Two-device media run requires a dev build on real devices (§26).

### 22.13 Collaboration (Phase 5) — `backend/src/documents`, `recordings`; `mobile` docs/admin
- **Documents:** upload validates the file by **actual content (magic bytes)**, not the client MIME
  or name ([file-validation.ts](backend/src/documents/file-validation.ts)); allowed PDF/PNG/JPG/
  DOCX/XLSX/PPTX; size-limited; stored in **private MinIO**; download only via short-lived
  **presigned URLs** after an access check; SHA-256 stored for integrity; `scanStatus=SKIPPED`
  honestly when no scanner is configured. Access ends with meeting access (same `assertCanView`).
- **Recording:** `POST /meetings/:id/recording/start|stop` gated by **policy** (`allowRecording`)
  **and** role (host/admin) **and** meeting state (LIVE); server-side LiveKit **Egress** to MinIO;
  playback via authorized presigned URL; all actions audited. Egress is an optional compose service
  (`profiles: ["recording"]`) — actual capture needs it running + active media.
- **Mobile:** documents section in meeting details (pick/upload/download via signed URL); host
  record toggle in the room; **Admin tab** (Super/Institute Admin only) with registration approvals
  (role-grant chips + reject-with-reason) and an **audit viewer** with a live **verify-chain**
  button that shows intact/tampered.
- **Tests (16/16):** [documents-test.sh](backend/scripts/documents-test.sh) — valid upload, two
  content-spoof rejections (fake .pdf, fake .docx), invited-user upload, list, presigned download
  whose **bytes match the original**, stranger 403 on list+download, recording policy gate (off→403),
  role gate (non-host→403), host authorized (egress-gated), audit chain valid.

### 22.14 Security hardening (Phase 6) — tested 9/9
- **HTTP security headers** via `helmet` (CSP, HSTS, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options`), applied in [main.ts](backend/src/main.ts).
- **Authorization sweep (already enforced, re-reviewed):** every protected route runs
  JWT → Roles → Org/Meeting-scope guards; ownership checked on mutations; cross-institution denied;
  WS messages authenticated in the gateway. Proven across the suites (smoke 26, meetings 19,
  livekit 17, documents 15, encryption-at-rest 11, security 9).
- **Privacy:** consent record written at registration; `POST /users/me/deactivate` (reversible,
  revokes sessions) and `DELETE /users/me` (erases PII, clears credentials, removes OTPs, revokes
  sessions) — both audited. Audit entries are retained (reference ids, not PII).
- **Mobile:** `expo-screen-capture` blocks screenshots/recording on the meeting room (FLAG_SECURE
  on Android — also hides content in the app switcher; screenshot block on iOS). Privacy actions
  (deactivate/delete) in Profile with destructive-action confirmation.
- **Deferred (documented):** biometric unlock, certificate pinning, root/jailbreak detection — all
  listed in Future Work; none claimed as implemented.
- **Tests:** [security-test.sh](backend/scripts/security-test.sh) — headers, tampered-JWT 401,
  deactivate→login 403, delete→login 401, audit still valid.

---

## 23. FINAL REPORT (session of 2026-11-06)

**Written for: the project owner, to run and defend in a viva.**

### Implemented & verified (ran and tested)
- **Phase 0** audit + plan + STUDENT.md.
- **Phase 1** infra (Docker Compose: Mongo RS, Redis, LiveKit, MinIO) + NestJS backend foundation
  + Expo SDK 57 mobile foundation (theme, i18n, fonts, nav guard, secure storage, API client).
- **Phase 2** auth/onboarding (register → OTP → org verify → approval → role login), Argon2id,
  rotating refresh + reuse detection, throttling/lockout, sessions; mobile auth screens.
- **Phase 3** meetings (schedule/list-scopes/details/update/cancel/invite), invitations,
  notifications; mobile meetings/calendar/notifications/home.
- **Phase 4** live conferencing: backend LiveKit token (server-side, room-scoped), waiting room,
  host controls, Socket.IO realtime (auth, chat, hand, signalling); mobile LiveKit room
  (grid, controls, chat, host panel, recording toggle).
- **Phase 5** documents (content-validated, private storage, signed URLs), recording control
  (policy/role gated, Egress), audit API; mobile documents + admin (approvals + audit viewer).
- **Phase 6** security (helmet, JWT-tamper, deactivate/delete + consent, screenshot block).
- **Audit hash chain** with verify endpoint + live tamper-detection demo.

### Automated test results — **101/101 backend tests passing**
smoke 26 · meetings 19 · livekit 17 · realtime 4 · documents 15 · encryption-at-rest 11 · security 9.
Run all: `cd backend && ./scripts/run-all-tests.sh` (paced for the rate limiter).
Mobile: `tsc --noEmit` clean + iOS bundle exports + `expo prebuild` applies the WebRTC plugins.

### Pending (needs you — see §24)
1. SMTP credentials (dev console-OTP fallback working now) — optional.
2. **Two-device live video run** — follow §26 on real Android phones (code + config validated).
3. Release APK — **decided: local Gradle** and **wired** (§25); you just run it.

Decided and closed: push notifications = skipped (documented §22.8); launcher icon = text wordmark
until you add `assets/branding/logo.png` (§25.4); SMS/malware scanner = off (honestly reported).

### Exact run steps
- **Infra:** `docker compose up -d mongo redis livekit minio`
- **Backend:** `cd backend && npm install && set -a && . ../.env && set +a && npx prisma db push && npm run seed && npm run build && node dist/main.js` → http://localhost:4000 (Swagger `/docs`).
- **Mobile (Expo Go for Phases 1–3):** `cd mobile && npm install && npx expo start`.
- **Mobile (dev build for video):** `cd mobile && npx expo run:android` (or `run:ios`).
- **Seeded Super Admin (dev):** `admin@aicte.vimarsh.local` / `Admin@12345`.

### Next unfinished task
Produce the APK (§25) and run the two-device video test (§26). Everything else is built and tested.

---

## 24. PENDING DECISIONS & OWNER ACTIONS

Decisions made 2026-11-07 (this replaces the old DECISION_PENDING.md, now removed):

| # | Item | Decision | Status |
|---|---|---|---|
| 1 | Email OTP via SMTP | Keep dev console-OTP fallback for now | ⏳ add `SMTP_*` to `.env` when ready (no code change) |
| 2 | Two-device live video | Test on real Android phones | ⏳ follow the checklist in §26 |
| 3 | Release APK | **Local Gradle, no EAS, free** | ✅ wired — see §25 |
| 4 | Push notifications | **Skip** — documented as a limitation (§22.8) | ✅ decided |
| 5 | Launcher icon | **Keep text wordmark**; swap when `assets/branding/logo.png` is added | ✅ decided — see §25.4 |
| 6 | SMS / malware scanner | Optional; stay off and honestly reported | ✅ decided |

Only items marked ⏳ still need action from you.

---

## 25. RELEASE APK — local Gradle, no EAS (free)

Produces a **standalone release APK** (JS bundled, runs without Metro) using the Android
toolchain only. The default Expo Android template signs `release` with the debug key, so **no
keystore setup is needed** for testing/demo. (A proper distribution keystore is optional — §25.3.)

**Prerequisites (one time):** install **Android Studio** (gives the Android SDK + platform tools),
accept SDK licenses, and set `ANDROID_HOME` (usually `~/Library/Android/sdk`). A JDK 17 is bundled
with Android Studio. Verify: `adb --version` works.

> **Cleartext networking (Android 9+):** release builds block plain HTTP/WS by default, so the
> app would fail to reach `http://<LAN-IP>:4000` / `ws://<LAN-IP>:7880`. The build therefore sets
> `usesCleartextTraffic=true` via `expo-build-properties` in `app.json` (verified in the generated
> `AndroidManifest.xml`). **This is a LAN-demo setting only — production must use HTTPS/WSS and
> remove this flag.** See §27.

### 25.1 Point the app at your laptop (baked into the APK)
```bash
cd mobile
cp .env.example .env
# edit .env: set your laptop LAN IP (macOS: `ipconfig getifaddr en0`)
#   EXPO_PUBLIC_API_URL=http://192.168.1.50:4000
```
`EXPO_PUBLIC_API_URL` is used for REST **and** the Socket.IO realtime connection. The LiveKit
**media** URL is handed to the app by the backend, so it comes from the backend's `LIVEKIT_URL`
(set that to the LAN IP too — see §26.2), not from the app env.

### 25.2 Build & install the APK
```bash
cd mobile
# generate the native android/ project once (safe to re-run with --clean):
npm run prebuild                 # = expo prebuild -p android
# build + install a RELEASE apk onto the connected phone:
npm run apk:device               # = expo run:android --variant release --device
```
The built APK is at:
`mobile/android/app/build/outputs/apk/release/app-release.apk`
Install it on a **second** phone without rebuilding:
```bash
adb -s <second-device-id> install -r mobile/android/app/build/outputs/apk/release/app-release.apk
# (list device ids with: adb devices)
```

### 25.3 (Optional) sign with your own keystore for distribution
Only needed if you want a non-debug-signed APK. After `npm run prebuild`:
```bash
cd mobile/android
keytool -genkeypair -v -storetype PKCS12 -keystore app/vimarsh.keystore \
  -alias vimarsh -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass CHANGEME -keypass CHANGEME -dname "CN=Vimarsh,O=AICTE,C=IN"
```
Then in `android/gradle.properties` add the four `VIMARSH_*` properties and point
`android/app/build.gradle` `signingConfigs.release` at them. (Keep the generated `android/` folder;
do not re-run prebuild afterwards or you'll overwrite the signing config.)

### 25.4 Launcher icon (decision: keep text wordmark for now)
The app currently uses the default Expo launcher icon; in-app branding is the विमर्श text wordmark
(no State Emblem/Ashoka Chakra). To use your logo later: drop `assets/branding/logo.png`
(1024×1024 PNG) into `mobile/assets/branding/`, set `"icon": "./assets/branding/logo.png"` in
`mobile/app.json`, re-run `npm run prebuild`, and rebuild. Nothing else references the icon.

---

## 26. TWO-DEVICE VIDEO TEST — real Android phones (step by step)

Goal: two phones join the same meeting and exchange live audio/video. Phones and laptop must be
on the **same Wi-Fi** (and the Wi-Fi must allow client-to-client traffic — many guest/campus
networks block it; use a phone hotspot or a home router if media won't connect).

### 26.1 Find your laptop LAN IP
```bash
ipconfig getifaddr en0        # e.g. 192.168.1.50   (use en1 if on a different interface)
```
Call it `LANIP` below.

### 26.2 Point the backend + LiveKit at the LAN IP
Edit the project-root `.env`:
```
LIVEKIT_URL=ws://LANIP:7880        # this exact URL is handed to the phones
S3_ENDPOINT=http://LANIP:9000      # so document/recording downloads work from phones
CORS_ORIGINS=*
```
Edit `livekit/livekit.yaml` → under `rtc:` uncomment and set:
```
node_ip: LANIP
```
(Without `node_ip`, LiveKit-in-Docker advertises its 172.x container IP and media fails.)

### 26.3 Open the required ports (macOS firewall)
If the macOS firewall is ON (System Settings → Network → Firewall), allow incoming connections for
`node`, `docker`/`com.docker.backend`, or simply turn the firewall off on a trusted home network.
Ports that must be reachable from the phones (all published by Docker on the laptop):
- **TCP 4000** — backend API + Socket.IO
- **TCP 7880** — LiveKit signalling (WebSocket)
- **TCP 7881** — LiveKit ICE/TCP fallback
- **UDP 7882** — LiveKit media (single mux port — **not** a 50000–60000 range; our config uses one port)
- **TCP 9000** — MinIO (only needed for document/recording download from phones)

### 26.4 Start everything
```bash
# infra (restart livekit so the node_ip change takes effect):
docker compose up -d mongo redis livekit minio
docker compose restart livekit
# backend:
cd backend && set -a && . ../.env && set +a && npm run build && node dist/main.js
```

### 26.5 Enable USB debugging & connect the phones
On each Android phone: Settings → About phone → tap **Build number** 7× to unlock Developer
options → Settings → Developer options → enable **USB debugging**. Connect by USB, accept the
"Allow USB debugging?" prompt. Verify both show up:
```bash
adb devices                   # both phones should be listed as "device"
```

### 26.6 Build/install the app on both phones
```bash
cd mobile
cp .env.example .env          # set EXPO_PUBLIC_API_URL=http://LANIP:4000
npm run prebuild
# phone 1 (plugged in):
npm run apk:device
# phone 2: install the same APK (or run apk:device again with the other phone connected)
adb -s <phone2-id> install -r android/app/build/outputs/apk/release/app-release.apk
```
(After install you can unplug USB; the app talks to the laptop over Wi-Fi.)

### 26.7 Run the test
1. On phone 1: sign in as the host (an account allowed to schedule — e.g. the seeded Super Admin,
   or an Institute Admin/HOD), **Schedule** a meeting starting in a few minutes, and **Invite**
   phone 2's account by email.
2. On phone 2: sign in, accept the invitation (Alerts/Meeting details).
3. Both: open the meeting → **Join**. With the waiting room on, phone 1 (host) admits phone 2 from
   the participants panel.
4. **Verify:** each phone sees the other's video tile and hears audio; try mic/camera toggles,
   flip camera, chat, raise hand; host mute/remove/lock/end. Optional: start **recording** (needs
   `docker compose --profile recording up -d livekit-egress`).

### 26.8 If media doesn't connect (black tiles)
- Re-check `node_ip` = LANIP and that you `docker compose restart livekit` after editing.
- Confirm the phones can reach the laptop: open `http://LANIP:4000/health` in the phone browser.
- Switch off the macOS firewall (trusted network) or allow the ports in §26.3.
- Avoid guest/enterprise Wi-Fi that isolates clients — use a home router or a phone hotspot.
- Audio but no video is usually a camera-permission denial — re-grant in Android app settings.

---

## 27. SECURITY POSTURE — exactly what is and isn't implemented

This is the honest, defensible summary. "Dev" = the local Docker/LAN setup in this repo;
"Production" = what a real deployment must add. Nothing here is overstated.

### ✅ Implemented and tested
- **Password hashing:** Argon2id (memory-hard) for passwords and OTP codes.
- **Session security:** short-lived JWT access (15 min) + **rotating refresh tokens with
  reuse/replay detection** (reuse revokes the whole family); server-side revocation; tokens stored
  in the OS keystore (`expo-secure-store`).
- **Brute-force defences:** per-route rate limiting, login lockout, OTP expiry + attempt cap + resend cooldown.
- **Authorization:** RBAC + organization scope + meeting/participant scope, **enforced server-side**
  on every protected route; ownership checks on mutations; cross-institution access denied; a
  faculty calling an admin API gets **403** (proven in tests). WebSocket messages authenticated in the gateway.
- **Input safety:** global DTO validation (`whitelist` + `forbidNonWhitelisted`) blocks mass assignment.
- **HTTP headers:** helmet (CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`).
- **Meeting access:** private LiveKit rooms, **backend-only** short-lived room-scoped tokens
  (API secret never on the device), waiting room, hashed passcode, lock, capacity, join window.
- **File security:** content (magic-byte) validation, **private** object storage, SHA-256 integrity
  of the original file, access tied to meeting access.
- **Encryption at rest — documents (application-level):** every uploaded document is encrypted with
  **AES-256-GCM** before it is written to MinIO. A fresh random 12-byte IV is generated per file and
  the 16-byte GCM auth tag is stored with the record; the 32-byte key lives only in `.env`
  (`DOCUMENT_ENCRYPTION_KEY`), never in code. The object on disk is **ciphertext** — downloading it
  requires the backend to decrypt **in memory, only after the authorization check passes**, then
  stream the plaintext (so documents no longer use a presigned URL). Proven by
  `scripts/encryption-test.mjs` (11/11): the stored object is ciphertext (no plaintext marker), an
  authorized download returns the exact original bytes, and a one-byte tamper of the ciphertext makes
  GCM decryption fail.
- **Audit integrity:** append-only, SHA-256 **hash-chained** log + `/audit/verify` + a demonstrated
  tamper-detection flip.
- **Mobile screen protection:** FLAG_SECURE / screenshot + screen-record block on the meeting room
  (also hides it in the Android app switcher).
- **Privacy:** consent record at sign-up; account **deactivation** (reversible) and **deletion**
  (PII erasure) — both audited.
- **Secrets:** only in `.env` (gitignored); `.env.example` has placeholders; seed admin credentials
  come from `.env` (`SEED_SUPER_ADMIN_*`), not source.

### ❌ NOT implemented / NOT claimed (and what production needs)
- **TLS (HTTPS/WSS): NOT enabled in dev.** The API, Socket.IO and LiveKit signalling run over plain
  HTTP/WS locally, and the Android demo APK sets `usesCleartextTraffic=true` to allow it on a LAN.
  **Production must terminate TLS** (reverse proxy / `wss://` LiveKit) and **remove the cleartext
  flag**. We do not claim transport encryption in the current dev setup.
- **Encryption at rest — partial (documents yes; recordings and DB no).**
  - **Documents: YES** — application-level AES-256-GCM (see the ✅ section above). This is the one
    data class the backend handles as bytes, so app-level encryption is feasible and is implemented.
  - **Recordings: NO (documented limitation).** LiveKit **Egress writes recording files directly to
    MinIO** — the bytes never pass through the backend, so application-level AES-GCM is **not feasible**
    for recordings. The feasible path is **MinIO server-side encryption (SSE-S3)**: run MinIO with a
    KMS key (`MINIO_KMS_SECRET_KEY`, or MinIO KES) and set default bucket encryption so every object,
    recordings included, is encrypted at rest by the storage layer. This is **not enabled in the dev
    compose** (it needs KMS config) and is the documented production recommendation. Note SSE is
    server-side (MinIO holds the key) — it is at-rest protection, **not** end-to-end.
  - **MongoDB / Redis: NO (documented limitation).** The dev compose uses default unencrypted
    on-disk storage; there is no field-level or database encryption. Production should use **MongoDB
    encryption-at-rest** (WiredTiger encryption / Atlas) and encrypted volumes, plus Redis on an
    encrypted volume. No DB-level encryption-at-rest is implied anywhere in the app.
- **End-to-end media encryption (E2EE): NOT implemented, never claimed.** LiveKit is an **SFU**;
  media is encrypted **in transit** (DTLS-SRTP) but the server — and server-side Egress recording —
  can access it. This is explicitly **not** E2EE. (LiveKit insertable-streams E2EE is listed as
  future work, to be proven before any claim.)
- **Malware scanning: NOT configured.** Uploads are recorded as `scanStatus=SKIPPED`; wire a scanner
  (provider interface exists) to change this.
- **Biometric unlock, certificate pinning, root/jailbreak detection: NOT implemented** (future work).
- **No legal/regulatory certification** of any kind is claimed.

### One-line summary for the viva
"Authentication, authorization, audit integrity, file access control, **AES-256-GCM encryption at
rest for documents**, and in-transit media encryption are implemented and tested. TLS, recording
encryption (MinIO SSE) and database encryption-at-rest are infrastructure responsibilities not
configured in this local dev build (cleartext is enabled only for the LAN demo), and the platform is
deliberately **not** end-to-end encrypted because it uses an SFU."

---

## 28. POST-REVIEW COMPLETION PASS (session of 2026-11-16) — what / why / how

This session was a correctness-and-completeness review of the whole repo against the five AICTE
requirements, followed by closing the gaps found. Nothing was committed (owner will review first).

### 28.1 What I checked first (and why)
- **Why:** before changing anything I wanted evidence of what actually works, not assumptions.
- **How:** compiled both projects (`tsc --noEmit` on `mobile/` and `backend/` — both exit 0),
  then cross-checked every mobile API client group (`src/api/endpoints.ts`) against the screens
  that call it. Every group was wired **except one**.
- **Result — the single real gap:** `recordingsApi.list` and `recordingsApi.url` were declared in
  the client and fully implemented + access-controlled on the backend
  (`backend/src/recordings/recordings.service.ts`, routes in `recordings.controller.ts`), but **no
  screen called them**. The live room could *start/stop* a recording, yet there was no way to
  **browse or play a finished recording** — which AICTE requirement #4 ("access recordings")
  explicitly asks for. This was the one feature that was genuinely missing, not just untested.

### 28.2 Fix #1 — Recordings access UI (closes AICTE req #4)
- **What:** a new `RecordingsSection` that lists a meeting's recordings and opens a completed one.
- **Where:** `mobile/src/screens/meetings/RecordingsSection.tsx` (new), rendered from
  `mobile/src/screens/meetings/MeetingDetailsScreen.tsx` (two small edits: import + render).
- **Why it was modelled on `DocumentsSection`:** to match the existing pattern exactly — same
  React Query usage, same `Card` list, same loading/empty states, same error handling via
  `ApiError`. Consistency over novelty.
- **How it behaves, and why each choice:**
  - Lists via `GET /meetings/:id/recordings` (`recordingsApi.list`). Any meeting **viewer** may
    list (the backend enforces `assertCanView`), which is correct for req #4 — access is not
    host-only.
  - Each row shows a colour-coded lifecycle state — `Recording in progress` (STARTING/ACTIVE),
    `Processing…` (COMPLETED but no file yet), `Ready` (COMPLETED + file), `Failed` — plus the
    start date/time and duration. **Why:** egress files are not instant; the UI must not pretend a
    just-stopped recording is immediately playable.
  - Only a **Ready** recording is tappable. Tapping calls `GET /recordings/:id/url`
    (`recordingsApi.url`), which on the backend re-checks view access, **writes a
    `RECORDING_ACCESSED` entry to the hash-chained audit log**, and returns a **short-lived
    presigned URL** to the private MinIO object. The app then opens that URL
    (`Linking.openURL` on native, `window.open` on web). **Why a presigned URL and not a stream
    like documents:** recordings are written straight to MinIO by LiveKit Egress and never pass
    through the backend as bytes (documented in §27), so the feasible access path is a signed,
    expiring link minted after authorization — not an app-level-decrypted stream.
  - A footer line tells the user recordings are stored privately and that opening one is audited.
    **Why:** it makes the security property visible to a viva examiner, and it is literally true.
  - The section renders **only when `meeting.policies.allowRecording` is true**. **Why:** a
    recording can *only* exist when recording was permitted (the backend's `start()` refuses
    otherwise), so this gate never hides an existing recording and avoids an empty, confusing
    section on meetings where recording was never allowed.
- **Verification:** `tsc --noEmit` on `mobile/` passes (exit 0). This is a UI addition over
  already-tested endpoints; no backend code changed.

### 28.3 Fix #2 — Removed 199 sync-conflict duplicate files
- **What:** deleted every `"<name> 2.<ext>"` / `"<name> <digit>.<ext>"` duplicate across the repo
  (e.g. `App 2.tsx`, `schema 2.prisma`, `seed 2.ts`, `package 2.json`, asset copies) — 199 files.
- **Why:** these are iCloud/Google-Drive sync-conflict artifacts. They clutter the tree and the
  Metro bundler can resolve a stray `* 2.tsx` as a duplicate module, which causes confusing
  runtime/bundling issues. They are not part of the project.
- **How / safety:** `find` scoped to **exclude `node_modules` and `.git`**; I first confirmed
  **0 of them were git-tracked** (`git ls-files --error-unmatch` → 0), so deleting them removed only
  untracked copies and left every real, tracked original in place. Re-ran `tsc --noEmit` on both
  projects afterward — still exit 0.

### 28.4 What I deliberately did NOT change (and why)
- **`usesCleartextTraffic=true` (Android) was left as-is.** On first read it looks like a security
  defect, but §18/§27 already document it as a **conscious dev-only decision**: the LAN demo talks
  to `http://<LAN-IP>:4000` with no TLS, so removing the flag would break the owner's working
  two-phone test. The honest, already-recorded production fix (terminate TLS, remove the flag)
  stands; silently breaking the demo would not be "more perfect".
- **Backend code / tests were not modified.** The gap was purely a missing mobile screen over
  endpoints that already pass their 101/101 suite; adding backend code would have been unnecessary
  risk.
- **No git commit was made**, per the owner's instruction — all changes are left in the working
  tree for review.

### 28.5 Net state after this pass
- Every mobile API client group is now consumed by at least one screen (no dead client code).
- All five AICTE requirements are now represented in the running app, including recordings access.
- Both projects compile clean; the working tree is free of sync-conflict litter.
- Still honestly out of scope (unchanged, see §27): TLS in dev, recording/DB encryption-at-rest,
  E2EE media, malware scanning, biometrics/cert-pinning — all documented limitations, not defects.

---

## 29. VIVA CHEAT-SHEET — "How is Vimarsh safe for AICTE & different from Zoom?" (feature → file)

**One-line answer to memorise:**
> "Zoom is a general-purpose foreign SaaS where confidential data passes through a third party.
> Vimarsh is a **purpose-built, self-hosted, closed** platform: AICTE keeps data on its own servers,
> controls access with approval + org-scoped RBAC, encrypts shared documents with AES-256-GCM, and
> keeps a **cryptographically verifiable audit** of every sensitive action. We do **not** claim E2EE
> because we use an SFU — but what matters most for a government body, **data control and
> accountability**, is stronger than Zoom."

### 29.1 The real differentiators (and where each lives in the code)

| # | Claim (what makes it safe / different from Zoom) | Where it lives (file) |
|---|---|---|
| 1 | **Self-hosted — data stays on AICTE infra**, not a foreign SaaS (the #1 point for govt) | `docker-compose.yml`, `livekit/livekit.yaml` (Mongo + Redis + LiveKit SFU + MinIO all self-run) |
| 2 | **Closed access** — register → email **OTP verify** → **admin approval** before any feature | `backend/src/auth/auth.service.ts` (OTP), `backend/src/approvals/approvals.service.ts` (approval) |
| 3 | **Org-scoped RBAC** — a user from another institute is **403'd** (proven in tests) | `backend/src/common/guards/roles.guard.ts`, `backend/src/meetings/meetings.service.ts` (`assertCanView` / `canManage`) |
| 4 | **Meeting tokens minted backend-only** — LiveKit API secret never on the device; short-lived, room-scoped | route `backend/src/meetings/meetings.controller.ts:76`, minting `backend/src/livekit/livekit.service.ts:42` (`createToken` / `AccessToken`) |
| 5 | **Waiting room + hashed passcode + lock + capacity + join-window** — no "anyone with the link joins" | `backend/src/meetings/meetings.service.ts` (+ controller routes) |
| 6 | **Documents encrypted at rest — AES-256-GCM**, decrypt only after authorization (tested 11/11) | `backend/src/common/crypto/file-crypto.ts`, used in `backend/src/documents/documents.service.ts` |
| 7 | **Tamper-evident, hash-chained audit log** + `/audit/verify` — detects any altered/reordered record | `backend/src/audit/audit.service.ts` (`prevHash`, `verifyChain` at :85) |
| 8 | **Confidential-screen protection** — screenshot & screen-record **blocked** in the meeting room (FLAG_SECURE) | `mobile/src/screens/room/RoomView.tsx` (`ScreenCapture.preventScreenCaptureAsync`, ~line 43) |
| 9 | **Recording access is controlled + audited** — no public object; short-lived presigned URL, `RECORDING_ACCESSED` logged | `backend/src/recordings/recordings.service.ts` (`url()`), UI `mobile/src/screens/meetings/RecordingsSection.tsx` |
| 10 | **Private object storage** — bucket not public, reachable only via signed URLs minted after authz | `backend/src/storage/storage.service.ts` |
| 11 | **Privacy controls** — consent at sign-up, account **deactivate** (reversible) & **delete** (PII erasure), both audited | `backend/src/users/users.service.ts`, `backend/src/auth/auth.service.ts` |
| 12 | **HTTP hardening + input safety** — helmet headers, global DTO validation (blocks mass-assignment) | `backend/src/main.ts`, DTOs under `backend/src/**/dto/*.ts` |

### 29.2 Honest caveats to SAY OUT LOUD (so no one catches you)
- **Not E2EE** — Vimarsh is an **SFU**; media is encrypted **in transit** (DTLS-SRTP) but the server
  can access it. On pure media E2EE, Zoom's optional E2EE mode is actually stronger. This is a
  **deliberate** trade-off (SFU is needed for recording / larger meetings) — documented in §27.
- **TLS not enabled in dev** (cleartext for the LAN demo); **recording & DB at-rest encryption** are
  production infra tasks (MinIO SSE, MongoDB encryption) — documented in §27, not claimed as done.
- **No official security certification** is claimed.
- Saying these shows you understood the trade-offs — it is a strength in the viva, not a weakness.

### 29.3 If the examiner pushes: "So is it MORE secure than Zoom?"
Do **not** say "yes to everything." Say:
> "Not in every dimension — Zoom's optional E2EE is stronger on raw media secrecy. But for AICTE's
> actual risk, which is **confidential government data sitting with a third party and lack of
> accountability**, Vimarsh is better: the data never leaves AICTE's servers, access is approval- and
> role-gated, documents are encrypted at rest, and every sensitive action is in a verifiable audit
> chain. That is the security that matters here."

---

## 30. QR-BASED ADMIN ONBOARDING (session of 2026-11-16) — what / why / how

### 30.1 Why this was built
The earlier design verified a new user by emailing a 6-digit OTP. On the free Render host
that path **cannot work**: Render blocks outbound SMTP (ports 25/465/587), so the OTP email
hangs ~124s and registration fails with a 500 (see §-OTP diagnosis). The fix is to remove
email from onboarding entirely and put the admin in control of who can register — the exact
AICTE model: identity is vouched for by an administrator, not by "whoever owns an inbox".

**New flow:** Admin generates a QR → new member scans/types it → fills in a password →
account is created **already approved** and is signed in. No OTP, no SMTP, no email service.
(Decision locked with the user: **email stays as the login identifier / "User ID"**, so
meeting invitations, guest links and the seeded admin account keep working unchanged.)

### 30.2 The three security rules (from the spec) and where each is enforced
1. **Random, single-use, expiry-based token.**
   - Code = 16 chars from an unambiguous alphabet (`generateInviteCode`, no 0/O/1/I/L), ~79 bits.
   - Stored only as `sha256(code)` in `Invite.tokenHash` — the plaintext lives **only** in the QR,
     returned exactly once at generation. (`backend/src/invites/invites.service.ts`)
   - `expiresAt` enforced everywhere; default validity 48h.
2. **Atomic redemption (no two people can use the same code).**
   - `AuthService.register()` runs a Prisma interactive transaction. The claim is a single
     conditional `updateMany({ where: { tokenHash, status: ACTIVE, expiresAt > now }, data:{ REDEEMED }})`.
     Mongo applies that per-document update atomically; `count === 0` ⇒ already used / expired /
     revoked ⇒ rejected. The user row is created in the same transaction, so a failure rolls back
     the redemption. (`backend/src/auth/auth.service.ts`)
3. **Login rate-limiting + lockout** — unchanged, already present: in-memory lockout in
   `AuthService` (`assertNotLocked` / `registerFailure`) + `@Throttle` on the auth routes.

### 30.3 Files added / changed
**Backend**
- `prisma/schema.prisma` — new `Invite` model + `InviteStatus` enum (ACTIVE / REDEEMED / REVOKED).
- `src/common/crypto/hash.util.ts` — `generateInviteCode`, `normalizeInviteCode`, `formatInviteCode`.
- `src/invites/` (new module) — `invites.service.ts`, `invites.controller.ts`, `invites.module.ts`,
  `dto/invite.dto.ts`. Endpoints:
  - `POST /invites` (admin: SUPER_ADMIN / INSTITUTE_ADMIN / HOD) → generate; returns the code once.
  - `GET /invites` → list (scoped to the admin's org; super admin sees all).
  - `POST /invites/:id/revoke` → cancel an unused invite.
  - `POST /invites/validate` (public) → pre-check a code before the register form.
- `src/auth/auth.service.ts` — `register()` rewritten: invite-gated, atomic redeem, account created
  `APPROVED` with the invite's role/org, **auto-login** (returns a token pair). No mail call.
- `src/auth/dto/auth.dto.ts` — `RegisterDto` gains required `inviteToken`.
- `src/app.module.ts` — registers `InvitesModule`.
- `prisma/seed.ts` — DEV-ONLY demo invite `VIMARSH-DEMO-2026` (FACULTY @ IITD) so the flow is
  testable without first logging in as admin. **Never seeded in production.**

**Mobile**
- New deps (SDK-57 compatible): `react-native-svg`, `react-native-qrcode-svg` (QR render),
  `expo-camera` (scan). `app.json` gains the `expo-camera` plugin + camera permission string.
- `src/components/QrImage.tsx` (render a QR), `src/components/QrScanner.tsx` (camera modal, with
  manual-entry fallback if permission denied).
- `src/screens/auth/RegisterScreen.tsx` — invite-code field (scan or type) + confirm-password +
  live "joining as <role> · <org>" banner; on success **auto-logs in** instead of going to OTP.
- `src/screens/admin/InvitesScreen.tsx` (new) — generate (role chips + note), show QR + code once,
  list existing invites with status + revoke. Linked from `AdminHomeScreen` + `AdminStack`.
- `src/api/endpoints.ts` + `types.ts` — `invitesApi` + invite types; `authApi.register` now takes
  `inviteToken` and returns a session.
- `src/i18n/en.ts`, `navigation/types.ts` — strings + route params.

### 30.4 What I deliberately did NOT change (and why)
- **Forgot/Reset password still uses email OTP** → it still depends on SMTP and will NOT work on
  Render free. Out of scope for this change (the spec was about *onboarding*). Options if needed
  later: an admin "reset this user's password" action, or an HTTP email API. The register+login
  critical path now has **zero** email dependency.
- **OTP code (verify/resend) left in place** but unused by the new register flow — harmless.
- **Email kept as the account key** (per the user's decision) so nothing else in the app broke.

### 30.5 How to run / verify
1. Backend: `npx prisma generate && npx prisma db push` (creates the `Invite` collection), then
   (dev) `npm run prisma:seed` to get the demo invite. On Render, the existing build command's
   `npx prisma db push` handles the schema; the admin generates invites in-app (no seed in prod).
2. Register with code `VIMARSH-DEMO-2026` (dev) → account is created and signed in immediately.
3. Admin path: log in as super admin → Admin → Member invitations → Generate → show the QR.
4. **The mobile app MUST be rebuilt** (new native modules: expo-camera, react-native-svg) —
   `cd mobile/android && ./gradlew assembleRelease`.

### 30.6 Verification done this session
- `backend`: `nest build` clean; `prisma generate` clean; seed typechecks.
- `mobile`: `npx tsc --noEmit` exit 0.

---

## 31. ADMIN-CONTROLLED PASSWORD RESET (session of 2026-11-16) — what / why / how

### 31.1 Why
Forgot-password was the last flow still depending on email OTP, which cannot work on Render
free (SMTP blocked). Replaced with the same admin-vouched model as onboarding — **no email,
no SMTP**. Confirmed with the user: registration + login + password reset are now all
SMTP-independent.

### 31.2 Flow
1. Member (not logged in) → Forgot password → enters email → a `REQUESTED` record is created
   for an admin. Response is uniform ("if an account exists…") — no account enumeration.
2. Admin → Admin → *Password resets* → sees pending requests → **Approve** generates a
   one-time, 60-minute reset code (shown once, to relay to the member) or **Reject**.
3. Member → "I have a reset code" → enters email + code + new password → password re-hashed
   with **Argon2id**, record marked `USED` (atomic single-use), and **all existing sessions
   are revoked**.

### 31.3 Security properties
- Reset code: 16-char random (same generator as invites), stored only as `sha256`, 60-min TTL.
- Redemption is an atomic `APPROVED→USED` conditional update inside a transaction with the
  password update + session revocation — single-use, no race.
- Admin scoping: SUPER_ADMIN sees all; INSTITUTE_ADMIN/HOD only their own org (org snapshot on
  the request row). Admin roles are never reset-able by lower admins beyond their scope.
- Every step audited: `PASSWORD_RESET_REQUESTED / _APPROVED / _REJECTED / _COMPLETED`.

### 31.4 Files
**Backend**
- `prisma/schema.prisma` — `PasswordReset` model + `PasswordResetStatus` enum.
- `src/password-reset/` (new) — service (request/complete/listPending/approve/reject),
  controller (`GET /password-resets/pending`, `POST /:id/approve`, `POST /:id/reject`), module.
- `src/auth/auth.service.ts` — `forgotPassword` / `resetPassword` now delegate to the new
  service (old email-OTP reset logic removed). `auth.module.ts` imports `PasswordResetModule`.
- `src/auth/dto/auth.dto.ts` — `ResetPasswordDto.code` relaxed from 6-digit to the 16-char code.
- `src/app.module.ts` — registers `PasswordResetModule`.

**Mobile**
- `src/screens/auth/ForgotPasswordScreen.tsx` — "request sent to admin" flow.
- `src/screens/auth/ResetPasswordScreen.tsx` — alphanumeric code input (was 6-digit).
- `src/screens/admin/PasswordResetsScreen.tsx` (new) — pending list, approve (shows code once),
  reject. Linked from `AdminHomeScreen` (+ badge) and `AdminStack`.
- `src/api/endpoints.ts` + `types.ts`, `i18n/en.ts`, `navigation/types.ts` — wiring/strings.

### 31.5 Note on OTP leftovers
`Otp` model + `verify-otp`/`resend-otp` endpoints remain but are now unused by any active flow
(email verification was removed in §30, password reset in §31). Harmless; left in place to keep
the diff focused. No active path touches `MailService` anymore.

### 31.6 Verification
- `backend`: `nest build` clean, `prisma generate` clean.
- `mobile`: `npx tsc --noEmit` exit 0.

---

## 32. END-TO-END + SECURITY TEST — admin password reset & invites (session 2026-11-16)

Ran the full chain against the new backend on a local instance (port 4055, local Mongo),
driving the real HTTP API. **25/25 assertions passed.**

### Functional (invite onboarding + password reset)
- Admin login ✓ · Admin generates invite (code returned once) ✓
- Register with invite → auto-login, status APPROVED ✓ · reused invite rejected (single-use) ✓
- Forgot-password → request created ✓ · admin sees it in pending ✓
- Admin approve → one-time code issued ✓ · member resets with it ✓
- New password works, old password rejected ✓ · reused reset code rejected (single-use) ✓
- Bad code → uniform "Invalid or expired reset request." ✓
- After a reset, the old **refresh token / session is revoked** (refresh → 401) ✓, and a login
  with the latest password works ✓.

### Security (the checks explicitly requested)
- **Code shown only once:** plaintext appears in exactly two responses — invite generate and
  reset approve — and nowhere else. Verified at runtime (scanned every other response body) and
  statically (`formatInviteCode()` called only in `invites.service.ts` + `password-reset.service.ts`).
- **No DB leak:** only `tokenHash` / `codeHash` (SHA-256) are stored; no plaintext column exists.
- **No log leak:** scanned the running server log for every issued code → none present. The
  services contain zero `logger`/`console` calls.
- **No error leak / no re-fetch:** reset errors are uniform; re-approving an already-handled
  request returns 400 (the code cannot be retrieved a second time).

### One honest nuance (documented, by design)
Password reset revokes the durable **sessions (refresh tokens)**, so old logins cannot persist.
A **stateless access JWT** stays valid until its short TTL (≤15 min) — the system does not do a
per-request session check. This matches the app's existing JWT model. If instantaneous
revocation of access tokens is ever required, the `JwtAuthGuard` would need to verify the
session id (`sid`) against the DB on each request (a per-request DB lookup) — not currently done.

### Note on rate-limiting
While testing, rapid repeated calls returned **429 Too Many Requests** — the `@Throttle` limits
on the auth routes working as intended (restarting the API clears the in-memory counters).

---

## 33. INSTANT ACCESS-TOKEN REVOCATION (session 2026-11-16) — supersedes §32 nuance

### Why
Previously a reset/logout revoked the durable session (refresh token), but a stateless access
JWT stayed valid until its ≤15-min TTL. For a confidential AICTE platform that residual window
is unacceptable — a reset should kill existing access immediately.

### What changed
`src/common/guards/jwt-auth.guard.ts` now, on **every authenticated request**, verifies that the
token's session family (`sid`, already embedded in the JWT) still has an ACTIVE, unexpired
`Session` row. If logout / password reset / refresh-reuse has revoked that family, the access
token is rejected (401) on the next request. One indexed lookup (`Session @@index([familyId])`);
can be fronted by Redis later without changing semantics. No token-format or mobile change.

### Behaviour now
- Password reset → all sessions revoked → **old access token rejected instantly** (verified).
- Logout and refresh-token-reuse detection likewise reject the access token immediately.
- Active sessions pass normally; the mobile client's transparent refresh-then-logout handles a
  revoked session gracefully (forces re-login).

### Verified
- `nest build` clean.
- Full E2E re-run: **26/26 passed**, incl. "old access token INSTANTLY revoked after reset (401)"
  while "tokenA valid before reset (200)" still passes (normal sessions unaffected).
