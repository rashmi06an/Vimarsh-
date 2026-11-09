import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
