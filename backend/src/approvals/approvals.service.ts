import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';

// Who may be granted by whom.
const INSTITUTE_ADMIN_GRANTABLE: Role[] = [Role.FACULTY, Role.HOD];
const SUPER_ADMIN_GRANTABLE: Role[] = [Role.MINISTRY, Role.INSTITUTE_ADMIN, Role.HOD, Role.FACULTY];

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Pending approvals, scoped: Super Admin sees all; Institute Admin only their org. */
  async listPending(actor: AuthedUser) {
    const where =
      actor.role === Role.SUPER_ADMIN
        ? { status: UserStatus.PENDING_APPROVAL }
        : { status: UserStatus.PENDING_APPROVAL, orgId: actor.orgId };
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { org: true, department: true },
    });
    return users.map(({ passwordHash, ...u }) => {
      void passwordHash;
      return u;
    });
  }

  async approve(actor: AuthedUser, targetUserId: string, role: Role) {
    const target = await this.loadPending(targetUserId);

    if (actor.role === Role.INSTITUTE_ADMIN) {
      if (!actor.orgId || target.orgId !== actor.orgId) {
        throw new ForbiddenException('You can only approve users in your own institute');
      }
      if (!INSTITUTE_ADMIN_GRANTABLE.includes(role)) {
        throw new ForbiddenException('Institute Admin can only assign FACULTY or HOD');
      }
    } else if (actor.role === Role.SUPER_ADMIN) {
      if (!SUPER_ADMIN_GRANTABLE.includes(role)) {
        throw new BadRequestException('Cannot assign this role via approval');
      }
    } else {
      throw new ForbiddenException('Not permitted to approve registrations');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { status: UserStatus.APPROVED, role, rejectionReason: null },
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'APPROVAL_GRANTED',
      targetType: 'User',
      targetId: targetUserId,
      orgId: target.orgId,
      metadata: { assignedRole: role },
    });
    const { passwordHash, ...safe } = updated;
    void passwordHash;
    return safe;
  }

  async reject(actor: AuthedUser, targetUserId: string, reason: string) {
    const target = await this.loadPending(targetUserId);
    if (actor.role === Role.INSTITUTE_ADMIN && (!actor.orgId || target.orgId !== actor.orgId)) {
      throw new ForbiddenException('You can only reject users in your own institute');
    }
    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { status: UserStatus.REJECTED, rejectionReason: reason },
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'APPROVAL_REJECTED',
      targetType: 'User',
      targetId: targetUserId,
      orgId: target.orgId,
      metadata: { reason },
    });
    const { passwordHash, ...safe } = updated;
    void passwordHash;
    return safe;
  }

  private async loadPending(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== UserStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`User is not pending approval (status: ${user.status})`);
    }
    return user;
  }
}
