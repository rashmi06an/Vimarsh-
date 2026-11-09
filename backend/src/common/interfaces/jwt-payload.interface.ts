import { Role } from '@prisma/client';

/** Shape of the decoded access-token payload attached to each authenticated request. */
export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: Role;
  orgId: string | null;
  status: string;
  sid: string; // session id (refresh-token family)
  iat?: number;
  exp?: number;
}

export interface AuthedUser {
  id: string;
  email: string;
  role: Role;
  orgId: string | null;
  status: string;
  sessionId: string;
}
