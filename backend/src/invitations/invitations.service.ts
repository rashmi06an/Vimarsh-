import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** My pending invitations, enriched with meeting summary. */
  async mine(actor: AuthedUser) {
    const invites = await this.prisma.invitation.findMany({
      where: { inviteeUserId: actor.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    const meetings = await this.prisma.meeting.findMany({
      where: { id: { in: invites.map((i) => i.meetingId) } },
    });
    const mmap = new Map(meetings.map((m) => [m.id, m]));
    return invites
      .map((i) => {
        const m = mmap.get(i.meetingId);
        if (!m) return null;
        return {
          invitationId: i.id,
          role: i.role,
          status: i.status,
          meeting: { id: m.id, title: m.title, meetingCode: m.meetingCode, startAt: m.startAt, endAt: m.endAt, status: m.status, confidentiality: m.confidentiality },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  async respond(actor: AuthedUser, invitationId: string, accept: boolean) {
    const invitation = await this.prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.inviteeUserId !== actor.id) throw new ForbiddenException('This invitation is not addressed to you');

    const status = accept ? 'ACCEPTED' : 'DECLINED';
    await this.prisma.invitation.update({ where: { id: invitationId }, data: { status } });
    await this.audit.log({
      actorId: actor.id, action: accept ? 'INVITATION_ACCEPTED' : 'INVITATION_DECLINED',
      targetType: 'Meeting', targetId: invitation.meetingId,
    });
    return { message: accept ? 'Invitation accepted' : 'Invitation declined', status };
  }
}
