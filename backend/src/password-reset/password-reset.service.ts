import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PasswordResetStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';
import {
  formatInviteCode,
  generateInviteCode,
  normalizeInviteCode,
  sha256Hex,
} from '../common/crypto/hash.util';

// How long an approved reset code stays valid.
const RESET_TTL_MINUTES = 60;

/**
 * Admin-controlled password recovery — no email, no SMTP.
 *   member requestReset() → admin approve() (issues a one-time code) → member completeReset().
 * The code is stored only as a SHA-256 hash; redemption is atomic and single-use, and all of
 * the member's sessions are revoked on success.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Member-initiated (public). Never reveals whether the account exists. */
  async requestReset(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (user) {
      // Reuse any open request so a member cannot spam the admin's queue.
      const open = await this.prisma.passwordReset.findFirst({
        where: {
          userId: user.id,
          status: { in: [PasswordResetStatus.REQUESTED, PasswordResetStatus.APPROVED] },
        },
      });
      if (!open) {
        await this.prisma.passwordReset.create({
          data: { userId: user.id, orgId: user.orgId ?? null, status: PasswordResetStatus.REQUESTED },
        });
        await this.audit.log({
          actorId: user.id,
          action: 'PASSWORD_RESET_REQUESTED',
          targetType: 'User',
          targetId: user.id,
          orgId: user.orgId,
        });
      }
    }
    return {
      message: 'If an account exists, your administrator has been notified to review the request.',
    };
  }

  /** Member-initiated (public). Consumes an approved code and sets the new password. */
  async completeReset(email: string, rawCode: string, newPassword: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const code = normalizeInviteCode(rawCode);
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    // Uniform error — no account enumeration, no distinction between bad email and bad code.
    const invalid = new BadRequestException('Invalid or expired reset request.');
    if (!user || code.length < 8) throw invalid;

    const codeHash = sha256Hex(code);
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });

    await this.prisma.$transaction(async (tx) => {
      // Atomic single-use claim: APPROVED + unexpired + matching code → USED.
      const claim = await tx.passwordReset.updateMany({
        where: {
          userId: user.id,
          codeHash,
          status: PasswordResetStatus.APPROVED,
          expiresAt: { gt: new Date() },
        },
        data: { status: PasswordResetStatus.USED, usedAt: new Date() },
      });
      if (claim.count === 0) throw invalid;
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      // Revoke every active session — a reset invalidates old logins.
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: { isSet: false } },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.log({
      actorId: user.id,
      action: 'PASSWORD_RESET_COMPLETED',
      targetType: 'User',
      targetId: user.id,
      orgId: user.orgId,
    });
    return { message: 'Password reset. Please sign in with your new password.' };
  }

  // ---------------- Admin dashboard ----------------

  async listPending(admin: AuthedUser) {
    const where =
      admin.role === Role.SUPER_ADMIN
        ? { status: PasswordResetStatus.REQUESTED }
        : { status: PasswordResetStatus.REQUESTED, orgId: admin.orgId ?? '000000000000000000000000' };
    const rows = await this.prisma.passwordReset.findMany({
      where,
      orderBy: { requestedAt: 'asc' },
      take: 100,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, fullName: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      email: byId.get(r.userId)?.email ?? '',
      fullName: byId.get(r.userId)?.fullName ?? '',
      requestedAt: r.requestedAt,
    }));
  }

  async approve(admin: AuthedUser, id: string) {
    const pr = await this.loadRequested(admin, id);
    const user = await this.prisma.user.findUnique({ where: { id: pr.userId } });
    if (!user) throw new NotFoundException('User not found.');

    const codePlain = generateInviteCode(16);
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);
    await this.prisma.passwordReset.update({
      where: { id },
      data: {
        status: PasswordResetStatus.APPROVED,
        codeHash: sha256Hex(codePlain),
        approvedById: admin.id,
        approvedAt: new Date(),
        expiresAt,
      },
    });
    await this.audit.log({
      actorId: admin.id,
      action: 'PASSWORD_RESET_APPROVED',
      targetType: 'PasswordReset',
      targetId: id,
      orgId: pr.orgId,
      metadata: { userId: pr.userId },
    });
    // The code is returned exactly once so the admin can relay it to the member.
    return { code: formatInviteCode(codePlain), email: user.email, fullName: user.fullName, expiresAt };
  }

  async reject(admin: AuthedUser, id: string) {
    const pr = await this.loadRequested(admin, id);
    await this.prisma.passwordReset.update({ where: { id }, data: { status: PasswordResetStatus.REJECTED } });
    await this.audit.log({
      actorId: admin.id,
      action: 'PASSWORD_RESET_REJECTED',
      targetType: 'PasswordReset',
      targetId: id,
      orgId: pr.orgId,
      metadata: { userId: pr.userId },
    });
    return { message: 'Reset request rejected.' };
  }

  private async loadRequested(admin: AuthedUser, id: string) {
    const pr = await this.prisma.passwordReset.findUnique({ where: { id } });
    if (!pr) throw new NotFoundException('Reset request not found.');
    if (pr.status !== PasswordResetStatus.REQUESTED) {
      throw new BadRequestException('This request is no longer pending.');
    }
    if (admin.role !== Role.SUPER_ADMIN && pr.orgId !== admin.orgId) {
      throw new ForbiddenException('You can only manage reset requests for your own organisation.');
    }
    return pr;
  }
}
