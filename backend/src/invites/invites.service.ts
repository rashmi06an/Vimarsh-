import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Invite, InviteStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';
import {
  formatInviteCode,
  generateInviteCode,
  normalizeInviteCode,
  sha256Hex,
} from '../common/crypto/hash.util';
import { CreateInviteDto } from './dto/invite.dto';

/**
 * Admin-controlled onboarding. An admin generates a single-use, time-limited invite
 * code (rendered as a QR). A new member scans/types it to register — no email, no OTP,
 * no external messaging. Redemption is atomic (see AuthService.register): a code can be
 * used exactly once, even under concurrent requests.
 */
@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);

  // Roles an admin may hand out via an invite, by the inviter's own role. A SUPER_ADMIN can
  // onboard ministry/institute admins; lower admins cannot grant admin roles (no privilege
  // escalation). SUPER_ADMIN itself is never grantable via an invite.
  private static grantableFor(actorRole: Role): Role[] {
    if (actorRole === Role.SUPER_ADMIN) {
      return [Role.MINISTRY, Role.INSTITUTE_ADMIN, Role.HOD, Role.FACULTY, Role.GUEST];
    }
    return [Role.HOD, Role.FACULTY, Role.GUEST];
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(admin: AuthedUser, dto: CreateInviteDto) {
    const role = dto.role ?? Role.FACULTY;
    const grantable = InvitesService.grantableFor(admin.role);
    if (!grantable.includes(role)) {
      throw new BadRequestException(`You can only grant: ${grantable.join(', ')}.`);
    }

    // Resolve the target organisation. Non-super-admins are pinned to their own org.
    let orgId = admin.orgId ?? null;
    if (dto.orgId && dto.orgId !== admin.orgId) {
      if (admin.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenException('You can only create invites for your own organisation.');
      }
      orgId = dto.orgId;
    }
    if (!orgId) throw new BadRequestException('No organisation to attach this invite to.');

    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new BadRequestException('Unknown organisation.');

    if (dto.departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!dept || dept.orgId !== orgId) {
        throw new BadRequestException('Invalid department for this organisation.');
      }
    }

    const ttlHours = dto.ttlHours ?? 48;
    const code = generateInviteCode(16);
    const tokenHash = sha256Hex(code);
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    const invite = await this.prisma.invite.create({
      data: {
        tokenHash,
        role,
        orgId,
        departmentId: dto.departmentId ?? null,
        note: dto.note?.trim() || null,
        createdById: admin.id,
        expiresAt,
      },
    });

    await this.audit.log({
      actorId: admin.id,
      action: 'INVITE_CREATED',
      targetType: 'Invite',
      targetId: invite.id,
      orgId,
      metadata: { role, ttlHours },
    });

    // The plaintext code is returned exactly ONCE, here, so the admin can show the QR.
    // It is never stored and cannot be retrieved again.
    return {
      id: invite.id,
      code: formatInviteCode(code),
      role,
      orgName: org.name,
      note: invite.note,
      expiresAt: invite.expiresAt,
    };
  }

  async list(admin: AuthedUser) {
    const where =
      admin.role === Role.SUPER_ADMIN ? {} : { orgId: admin.orgId ?? '000000000000000000000000' };
    const rows = await this.prisma.invite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.toListItem(r));
  }

  async revoke(admin: AuthedUser, id: string) {
    const invite = await this.prisma.invite.findUnique({ where: { id } });
    if (!invite) throw new NotFoundException('Invite not found.');
    if (admin.role !== Role.SUPER_ADMIN && invite.orgId !== admin.orgId) {
      throw new ForbiddenException('You cannot manage invites for another organisation.');
    }
    if (invite.status !== InviteStatus.ACTIVE) {
      throw new BadRequestException('Only an active invite can be revoked.');
    }
    await this.prisma.invite.update({ where: { id }, data: { status: InviteStatus.REVOKED } });
    await this.audit.log({
      actorId: admin.id,
      action: 'INVITE_REVOKED',
      targetType: 'Invite',
      targetId: id,
      orgId: invite.orgId,
    });
    return { message: 'Invite revoked.' };
  }

  /** Public pre-check so the register screen can confirm a code before the member types a password. */
  async validate(rawCode: string) {
    const code = normalizeInviteCode(rawCode);
    if (code.length < 8) return { valid: false as const };
    const invite = await this.prisma.invite.findUnique({ where: { tokenHash: sha256Hex(code) } });
    if (!invite || invite.status !== InviteStatus.ACTIVE || invite.expiresAt.getTime() < Date.now()) {
      return { valid: false as const };
    }
    const org = invite.orgId
      ? await this.prisma.organization.findUnique({ where: { id: invite.orgId } })
      : null;
    const dept = invite.departmentId
      ? await this.prisma.department.findUnique({ where: { id: invite.departmentId } })
      : null;
    return {
      valid: true as const,
      role: invite.role,
      orgName: org?.name ?? null,
      departmentName: dept?.name ?? null,
    };
  }

  private toListItem(r: Invite) {
    // ACTIVE but past expiry reads as EXPIRED without needing a background job.
    const status =
      r.status === InviteStatus.ACTIVE && r.expiresAt.getTime() < Date.now()
        ? 'EXPIRED'
        : r.status;
    return {
      id: r.id,
      role: r.role,
      note: r.note,
      status,
      expiresAt: r.expiresAt,
      redeemedAt: r.redeemedAt,
      createdAt: r.createdAt,
    };
  }
}
