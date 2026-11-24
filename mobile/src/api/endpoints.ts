import { apiRequest, uploadFile, downloadDocument } from './client';
import {
  ApprovedReset,
  CreateMeetingInput,
  CreatedInvite,
  Department,
  DirectoryUser,
  InvitationItem,
  InviteListItem,
  InviteValidation,
  LoginResponse,
  PendingResetItem,
  MeetingDetails,
  MeetingScope,
  MeetingSummary,
  NotificationItem,
  Organization,
  Profile,
  PublicUser,
  RegisterResponse,
  Role,
  TokenPair,
} from './types';

interface VerifyOtpResponse extends TokenPair {
  message: string;
  status: string;
  user: PublicUser;
}

export const authApi = {
  // Invite-gated registration: no OTP/email. Returns a session (auto-login) on success.
  register: (body: { inviteToken: string; email: string; fullName: string; password: string; phone?: string }) =>
    apiRequest<RegisterResponse>('/auth/register', { method: 'POST', body, auth: false }),

  verifyOtp: (body: { email: string; code: string }) =>
    apiRequest<VerifyOtpResponse>('/auth/verify-otp', { method: 'POST', body, auth: false }),

  resendOtp: (email: string) =>
    apiRequest<{ message: string }>('/auth/resend-otp', { method: 'POST', body: { email }, auth: false }),

  login: (body: { email: string; password: string; deviceInfo?: string }) =>
    apiRequest<LoginResponse>('/auth/login', { method: 'POST', body, auth: false }),

  orgVerification: (body: { orgId: string; departmentId?: string; designation: string }) =>
    apiRequest<{ message: string; status: string }>('/auth/org-verification', { method: 'POST', body }),

  logout: () => apiRequest<{ message: string }>('/auth/logout', { method: 'POST' }),

  forgotPassword: (email: string) =>
    apiRequest<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),

  resetPassword: (body: { email: string; code: string; newPassword: string }) =>
    apiRequest<{ message: string }>('/auth/reset-password', { method: 'POST', body, auth: false }),
};

export const usersApi = {
  me: () => apiRequest<Profile>('/users/me'),
  directory: (q?: string) =>
    apiRequest<DirectoryUser[]>(`/users/directory${q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`),
  updateMe: (body: { fullName?: string; phone?: string; photoUrl?: string }) =>
    apiRequest<Profile>('/users/me', { method: 'PATCH', body }),
  sessions: () => apiRequest<Array<{ id: string; deviceInfo: string | null; createdAt: string; expiresAt: string }>>('/users/me/sessions'),
  revokeSession: (id: string) => apiRequest<{ message: string }>(`/users/me/sessions/${id}`, { method: 'DELETE' }),
  deactivate: () => apiRequest<{ message: string }>('/users/me/deactivate', { method: 'POST' }),
  deleteAccount: () => apiRequest<{ message: string }>('/users/me', { method: 'DELETE' }),
};

export const orgsApi = {
  list: () => apiRequest<Organization[]>('/orgs'),
  departments: (orgId: string) => apiRequest<Department[]>(`/orgs/${orgId}/departments`),
};

export const meetingsApi = {
  list: (scope: MeetingScope = 'upcoming') =>
    apiRequest<MeetingSummary[]>(`/meetings?scope=${scope}`),
  details: (id: string) => apiRequest<MeetingDetails>(`/meetings/${id}`),
  create: (body: CreateMeetingInput) => apiRequest<MeetingDetails>('/meetings', { method: 'POST', body }),
  update: (id: string, body: Partial<CreateMeetingInput>) => apiRequest<MeetingDetails>(`/meetings/${id}`, { method: 'PATCH', body }),
  cancel: (id: string) => apiRequest<{ message: string }>(`/meetings/${id}/cancel`, { method: 'POST' }),
  invite: (id: string, invitees: Array<{ userId?: string; email?: string }>) =>
    apiRequest<{ invited: number; skipped: Array<{ who: string; reason: string }>; guestLinks: Array<{ email: string; token: string }> }>(
      `/meetings/${id}/invitations`, { method: 'POST', body: { invitees } }),
  participants: (id: string) =>
    apiRequest<Array<{ id: string; state: string; handRaised: boolean; name: string; isGuest: boolean }>>(`/meetings/${id}/participants`),
};

export interface JoinTokenResponse {
  token: string;
  url: string;
  room: string;
  identity: string;
  isHost: boolean;
  policies: { allowRecording: boolean; allowScreenShare: boolean; allowChat: boolean; micOnJoin: boolean; cameraOnJoin: boolean };
}

export const roomApi = {
  joinRequest: (id: string, passcode?: string) =>
    apiRequest<{ admitted: boolean; waiting: boolean }>(`/meetings/${id}/join-request`, { method: 'POST', body: { passcode } }),
  token: (id: string) => apiRequest<JoinTokenResponse>(`/meetings/${id}/token`, { method: 'POST' }),
  waiting: (id: string) => apiRequest<Array<{ participantId: string; userId: string | null; name: string }>>(`/meetings/${id}/waiting`),
  admit: (id: string, targetUserId: string) => apiRequest<{ message: string }>(`/meetings/${id}/admit`, { method: 'POST', body: { targetUserId } }),
  deny: (id: string, targetUserId: string) => apiRequest<{ message: string }>(`/meetings/${id}/deny`, { method: 'POST', body: { targetUserId } }),
  remove: (id: string, targetUserId: string) => apiRequest<{ message: string }>(`/meetings/${id}/remove`, { method: 'POST', body: { targetUserId } }),
  mute: (id: string, targetUserId: string) => apiRequest<{ message: string }>(`/meetings/${id}/mute`, { method: 'POST', body: { targetUserId } }),
  lock: (id: string, locked: boolean) => apiRequest<{ message: string; locked: boolean }>(`/meetings/${id}/lock`, { method: 'POST', body: { locked } }),
  end: (id: string) => apiRequest<{ message: string }>(`/meetings/${id}/end`, { method: 'POST' }),
};

export const invitationsApi = {
  mine: () => apiRequest<InvitationItem[]>('/invitations/me'),
  accept: (id: string) => apiRequest<{ message: string; status: string }>(`/invitations/${id}/accept`, { method: 'POST' }),
  decline: (id: string) => apiRequest<{ message: string; status: string }>(`/invitations/${id}/decline`, { method: 'POST' }),
};

export const notificationsApi = {
  list: () => apiRequest<NotificationItem[]>('/notifications'),
  unreadCount: () => apiRequest<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => apiRequest<{ message: string }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => apiRequest<{ message: string }>('/notifications/read-all', { method: 'POST' }),
};

export const invitesApi = {
  // Admin: generate a single-use onboarding invite. The code is returned once (for the QR).
  create: (body: { role?: Role; departmentId?: string; orgId?: string; note?: string; ttlHours?: number }) =>
    apiRequest<CreatedInvite>('/invites', { method: 'POST', body }),
  list: () => apiRequest<InviteListItem[]>('/invites'),
  revoke: (id: string) => apiRequest<{ message: string }>(`/invites/${id}/revoke`, { method: 'POST' }),
  // Public: pre-check a code before the new member fills in the registration form.
  validate: (code: string) =>
    apiRequest<InviteValidation>('/invites/validate', { method: 'POST', body: { code }, auth: false }),
};

export const passwordResetsApi = {
  // Admin: review and act on member password-reset requests (no email involved).
  pending: () => apiRequest<PendingResetItem[]>('/password-resets/pending'),
  approve: (id: string) => apiRequest<ApprovedReset>(`/password-resets/${id}/approve`, { method: 'POST' }),
  reject: (id: string) => apiRequest<{ message: string }>(`/password-resets/${id}/reject`, { method: 'POST' }),
};

export const approvalsApi = {
  pending: () => apiRequest<Profile[]>('/approvals/pending'),
  approve: (userId: string, role: Role) =>
    apiRequest<Profile>(`/approvals/${userId}/approve`, { method: 'POST', body: { role } }),
  reject: (userId: string, reason: string) =>
    apiRequest<Profile>(`/approvals/${userId}/reject`, { method: 'POST', body: { reason } }),
};

export interface DocumentItem {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  scanStatus: string;
  uploaderId: string;
  createdAt: string;
}

export const documentsApi = {
  list: (meetingId: string) => apiRequest<DocumentItem[]>(`/meetings/${meetingId}/documents`),
  upload: (meetingId: string, file: { uri: string; name: string; type: string }) =>
    uploadFile<DocumentItem>(`/meetings/${meetingId}/documents`, file),
  // Encrypted at rest -> decrypted + streamed by the server; saves/opens the file client-side.
  download: (documentId: string, fileName: string) => downloadDocument(documentId, fileName),
};

export interface RecordingItem {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  hasFile: boolean;
}

export const recordingsApi = {
  start: (meetingId: string) => apiRequest<{ id: string; status: string }>(`/meetings/${meetingId}/recording/start`, { method: 'POST' }),
  stop: (meetingId: string) => apiRequest<{ id: string; status: string }>(`/meetings/${meetingId}/recording/stop`, { method: 'POST' }),
  list: (meetingId: string) => apiRequest<RecordingItem[]>(`/meetings/${meetingId}/recordings`),
  url: (recordingId: string) => apiRequest<{ url: string; expiresInSeconds: number }>(`/recordings/${recordingId}/url`),
};

export interface AuditEntry {
  id: string;
  seq: number;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  prevHash: string;
  hash: string;
  createdAt: string;
}

export const auditApi = {
  list: (limit = 100) => apiRequest<AuditEntry[]>(`/audit?limit=${limit}`),
  verify: () => apiRequest<{ valid: boolean; count: number; brokenAtSeq: number | null; reason: string | null }>('/audit/verify'),
};
