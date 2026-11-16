export type Role = 'SUPER_ADMIN' | 'MINISTRY' | 'INSTITUTE_ADMIN' | 'HOD' | 'FACULTY' | 'GUEST';
export type UserStatus = 'PENDING_OTP' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  orgId: string | null;
  designation: string | null;
}

export interface Profile extends PublicUser {
  emailVerified: boolean;
  phone: string | null;
  photoUrl: string | null;
  rejectionReason: string | null;
  org?: { id: string; name: string; code: string; type: string } | null;
  department?: { id: string; name: string } | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse extends TokenPair {
  user: PublicUser;
}

export interface RegisterResponse extends TokenPair {
  message: string;
  status: UserStatus;
  user: PublicUser;
}

// ---- Admin invite (QR onboarding) ----
export interface InviteValidation {
  valid: boolean;
  role?: Role;
  orgName?: string | null;
  departmentName?: string | null;
}

export interface CreatedInvite {
  id: string;
  code: string; // formatted XXXX-XXXX-XXXX-XXXX; shown once
  role: Role;
  orgName: string;
  note: string | null;
  expiresAt: string;
}

export type InviteState = 'ACTIVE' | 'REDEEMED' | 'REVOKED' | 'EXPIRED';

// ---- Admin password-reset recovery ----
export interface PendingResetItem {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  requestedAt: string;
}

export interface ApprovedReset {
  code: string; // one-time reset code; shown once
  email: string;
  fullName: string;
  expiresAt: string;
}

export interface InviteListItem {
  id: string;
  role: Role;
  note: string | null;
  status: InviteState;
  expiresAt: string;
  redeemedAt: string | null;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  code: string;
  type: 'AICTE' | 'MINISTRY' | 'INSTITUTE';
}

export interface Department {
  id: string;
  name: string;
  orgId: string;
}

export type MeetingStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
export type Confidentiality = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type MeetingScope = 'upcoming' | 'ongoing' | 'past' | 'invitations' | 'mine' | 'all';

export interface MeetingSummary {
  id: string;
  meetingCode: string;
  title: string;
  hostName: string;
  isHost: boolean;
  startAt: string;
  endAt: string;
  timezone: string;
  status: MeetingStatus;
  confidentiality: Confidentiality;
  waitingRoomEnabled: boolean;
  hasPasscode: boolean;
  locked: boolean;
  participantCount: number;
  myInvitationStatus: string | null;
}

export interface MeetingPolicies {
  allowRecording: boolean;
  allowScreenShare: boolean;
  allowChat: boolean;
  micOnJoin: boolean;
  cameraOnJoin: boolean;
}

export interface MeetingDetails {
  id: string;
  meetingCode: string;
  title: string;
  description: string | null;
  agenda: string | null;
  hostId: string;
  orgId: string;
  startAt: string;
  endAt: string;
  timezone: string;
  type: string;
  confidentiality: Confidentiality;
  status: MeetingStatus;
  waitingRoomEnabled: boolean;
  hasPasscode: boolean;
  locked: boolean;
  capacity: number;
  policies: MeetingPolicies;
  host: { id: string; fullName: string; email: string; designation: string | null } | null;
  participants: Array<{ id: string; userId: string | null; guestName: string | null; state: string; handRaised: boolean }>;
  invitationCount: number;
  documentCount: number;
  canManage: boolean;
  myInvitationStatus: string | null;
}

export interface InvitationItem {
  invitationId: string;
  role: string;
  status: string;
  meeting: { id: string; title: string; meetingCode: string; startAt: string; endAt: string; status: MeetingStatus; confidentiality: Confidentiality };
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface CreateMeetingInput {
  title: string;
  description?: string;
  agenda?: string;
  startAt: string;
  endAt: string;
  timezone?: string;
  confidentiality?: Confidentiality;
  departmentId?: string;
  waitingRoomEnabled?: boolean;
  passcode?: string;
  capacity?: number;
  policies?: Partial<MeetingPolicies>;
  invitees?: Array<{ userId?: string; email?: string; role?: 'PARTICIPANT' | 'GUEST' }>;
}
