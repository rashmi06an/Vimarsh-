import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParams = {
  Welcome: undefined;
  Login: undefined;
  Register: { inviteToken?: string } | undefined;
  Otp: { email: string };
  ForgotPassword: undefined;
  ResetPassword: { email: string };
};

export type OnboardingStackParams = {
  OrgVerification: undefined;
  ApplicationStatus: undefined;
};

export type MeetingsStackParams = {
  MeetingsList: undefined;
  MeetingDetails: { id: string };
  ScheduleMeeting: { meetingId?: string } | undefined;
  InviteParticipants: { meetingId: string };
  MeetingRoom: { meetingId: string };
};

export type AdminStackParams = {
  AdminHome: undefined;
  Approvals: undefined;
  Invites: undefined;
  PasswordResets: undefined;
  AuditLog: undefined;
};

export type AppTabsParams = {
  Home: undefined;
  Meetings: NavigatorScreenParams<MeetingsStackParams>;
  Calendar: undefined;
  Notifications: undefined;
  Admin: NavigatorScreenParams<AdminStackParams>;
  Profile: undefined;
};

export type RootStackParams = {
  Splash: undefined;
  Auth: NavigatorScreenParams<AuthStackParams>;
  Onboarding: NavigatorScreenParams<OnboardingStackParams>;
  App: NavigatorScreenParams<AppTabsParams>;
};
