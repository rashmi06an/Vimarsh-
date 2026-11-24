import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Registered members the actor may invite to a meeting: approved accounts in the actor's own
   * organisation (AICTE/Ministry roles may search across all institutions), excluding themselves.
   * Backs the invite picker so only in-app users can be invited — there are no external invites.
   */
  async directory(actor: AuthedUser, q?: string) {
    const crossOrg = actor.role === Role.SUPER_ADMIN || actor.role === Role.MINISTRY;
    const where: Prisma.UserWhereInput = {
      status: UserStatus.APPROVED,
      id: { not: actor.id },
      ...(crossOrg ? {} : { orgId: actor.orgId ?? undefined }),
    };
    const term = q?.trim();
    if (term) {
      where.OR = [
        { fullName: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }
    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, fullName: true, email: true, role: true, org: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
      take: 30,
    });
    return users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email, role: u.role, orgName: u.org?.name ?? null }));
  }

  /** Admin: list members of the organisation (all statuses) so access can be managed. */
  async listMembers(actor: AuthedUser) {
    if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.INSTITUTE_ADMIN) {
      throw new ForbiddenException('Only administrators can view members.');
    }
    const crossOrg = actor.role === Role.SUPER_ADMIN;
    const where: Prisma.UserWhereInput = {
      id: { not: actor.id },
      ...(crossOrg ? {} : { orgId: actor.orgId ?? undefined }),
    };
    const users = await this.prisma.user.findMany({
      where,
      select: { id: true, fullName: true, email: true, role: true, status: true, org: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
      take: 300,
    });
    return users.map((u) => ({ id: u.id, fullName: u.fullName, email: u.email, role: u.role, status: u.status, orgName: u.org?.name ?? null }));
  }

  /** Admin: revoke (suspend) or restore a member's access. Suspending revokes their sessions. */
  async setMemberAccess(actor: AuthedUser, targetId: string, suspend: boolean) {
    if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.INSTITUTE_ADMIN) {
      throw new ForbiddenException('Only administrators can change member access.');
    }
    if (targetId === actor.id) throw new ForbiddenException('You cannot change your own access here.');
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');
    if (actor.role !== Role.SUPER_ADMIN && target.orgId !== actor.orgId) {
      throw new ForbiddenException('That member belongs to another organisation.');
    }
    if (target.role === Role.SUPER_ADMIN) throw new ForbiddenException('A super admin cannot be changed here.');
    const status = suspend ? UserStatus.SUSPENDED : UserStatus.APPROVED;
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: targetId }, data: { status } }),
      ...(suspend ? [this.prisma.session.updateMany({ where: { userId: targetId, revokedAt: { isSet: false } }, data: { revokedAt: new Date() } })] : []),
    ]);
    await this.audit.log({ actorId: actor.id, action: suspend ? 'MEMBER_ACCESS_REVOKED' : 'MEMBER_ACCESS_RESTORED', targetType: 'User', targetId });
    return { message: suspend ? 'Access revoked' : 'Access restored', status };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { org: true, department: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, ...safe } = user;
    void passwordHash;
    return safe;
  }

  async updateProfile(userId: string, data: { fullName?: string; phone?: string; photoUrl?: string }) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: data.fullName?.trim(),
        phone: data.phone,
        photoUrl: data.photoUrl,
      },
    });
    const { passwordHash, ...safe } = user;
    void passwordHash;
    return safe;
  }

  /** Active (non-revoked, unexpired) sessions for device/session management. */
  async listSessions(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: { isSet: false }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    // Never return token hashes.
    return sessions.map((s) => ({
      id: s.id,
      familyId: s.familyId,
      deviceInfo: s.deviceInfo,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));
  }

  /** Reversible deactivation: suspend the account and revoke all sessions. */
  async deactivate(userId: string) {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } }),
      this.prisma.session.updateMany({ where: { userId, revokedAt: { isSet: false } }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: userId, action: 'ACCOUNT_DEACTIVATED', targetType: 'User', targetId: userId });
    return { message: 'Account deactivated. Contact an administrator to reactivate.' };
  }

  /** Right-to-erasure: anonymise PII, clear credentials, revoke sessions, remove OTPs.
   *  Audit entries are retained (they reference the id, not PII) for integrity. */
  async deleteAccount(userId: string) {
    const anonEmail = `deleted+${userId}@removed.local`;
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { email: anonEmail, fullName: 'Deleted User', phone: null, photoUrl: null, passwordHash: 'DELETED', status: 'SUSPENDED', designation: null },
      }),
      this.prisma.session.updateMany({ where: { userId, revokedAt: { isSet: false } }, data: { revokedAt: new Date() } }),
      this.prisma.otp.deleteMany({ where: { userId } }),
    ]);
    await this.audit.log({ actorId: userId, action: 'ACCOUNT_DELETED', targetType: 'User', targetId: userId, metadata: { erasure: true } });
    return { message: 'Account deleted. Personal data has been removed.' };
  }
}
