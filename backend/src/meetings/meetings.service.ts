import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import {
  InvitationRole,
  Meeting,
  MeetingStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LivekitService } from '../livekit/livekit.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { generateMeetingCode } from '../common/crypto/hash.util';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';
import {
  CreateMeetingDto,
  InviteeDto,
  MeetingScope,
  UpdateMeetingDto,
} from './dto/meeting.dto';

// Roles permitted to schedule meetings (Faculty only if granted — future flag).
const CAN_SCHEDULE: Role[] = [Role.SUPER_ADMIN, Role.MINISTRY, Role.INSTITUTE_ADMIN, Role.HOD, Role.FACULTY, Role.GUEST];

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly livekit: LivekitService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ---------------- Scheduling ----------------

  async schedule(actor: AuthedUser, dto: CreateMeetingDto) {
    if (!CAN_SCHEDULE.includes(actor.role)) {
      throw new ForbiddenException('You do not have permission to schedule meetings');
    }
    if (!actor.orgId) throw new BadRequestException('Your account is not linked to an organization');

    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    if (start.getTime() <= Date.now()) throw new BadRequestException('Start time must be in the future');
    if (end.getTime() <= start.getTime()) throw new BadRequestException('End time must be after the start time');

    if (dto.departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!dept || dept.orgId !== actor.orgId) throw new BadRequestException('Invalid department for your organization');
    }

    const meetingCode = await this.uniqueMeetingCode();
    const passcodeHash = dto.passcode ? await argon2.hash(dto.passcode, { type: argon2.argon2id }) : null;
    const p = dto.policies ?? {};

    const meeting = await this.prisma.meeting.create({
      data: {
        meetingCode,
        title: dto.title.trim(),
        description: dto.description,
        agenda: dto.agenda,
        hostId: actor.id,
        orgId: actor.orgId,
        departmentId: dto.departmentId ?? null,
        startAt: start,
        endAt: end,
        timezone: dto.timezone ?? 'Asia/Kolkata',
        type: dto.type ?? 'STANDARD',
        confidentiality: dto.confidentiality ?? undefined,
        waitingRoomEnabled: dto.waitingRoomEnabled ?? true,
        passcodeHash,
        capacity: dto.capacity ?? 100,
        livekitRoom: meetingCode, // room name == code (unique)
        allowRecording: p.allowRecording ?? false,
        allowScreenShare: p.allowScreenShare ?? true,
        allowChat: p.allowChat ?? true,
        micOnJoin: p.micOnJoin ?? false,
        cameraOnJoin: p.cameraOnJoin ?? false,
      },
    });

    await this.audit.log({
      actorId: actor.id, action: 'MEETING_CREATED', targetType: 'Meeting', targetId: meeting.id,
      orgId: actor.orgId, metadata: { meetingCode, confidentiality: meeting.confidentiality },
    });

    if (dto.invitees && dto.invitees.length > 0) {
      await this.inviteInternal(actor, meeting, dto.invitees);
    }
    return this.getDetails(actor, meeting.id);
  }

  private async uniqueMeetingCode(): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const code = generateMeetingCode();
      const exists = await this.prisma.meeting.findUnique({ where: { meetingCode: code } });
      if (!exists) return code;
    }
    throw new BadRequestException('Could not generate a unique meeting code; try again');
  }

  // ---------------- Listing ----------------

  async list(actor: AuthedUser, scope: MeetingScope = 'upcoming') {
    const now = new Date();
    const isAdmin = actor.role === Role.SUPER_ADMIN || actor.role === Role.INSTITUTE_ADMIN;
    // Org scoping. Super admins see every org. Anyone with an org is scoped to it.
    // An INSTITUTE_ADMIN with no org must never see other orgs' meetings, so match nothing
    // (`{ in: [] }` is a valid, empty ObjectId filter — unlike a sentinel string, which Prisma
    // would reject as a malformed ObjectID and turn into a 500). A non-admin with no org gets no
    // org filter at all: the host-or-invited AND clause below already restricts what they see, so
    // an org-less faculty still sees the meetings they host or were invited to.
    let orgFilter: Prisma.MeetingWhereInput = {};
    if (actor.role !== Role.SUPER_ADMIN) {
      if (actor.orgId) {
        orgFilter = { orgId: actor.orgId };
      } else if (isAdmin) {
        orgFilter = { orgId: { in: [] } };
      }
    }

    if (scope === 'invitations') {
      const invites = await this.prisma.invitation.findMany({
        where: { inviteeUserId: actor.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
      const meetingIds = invites.map((i) => i.meetingId);
      const meetings = await this.prisma.meeting.findMany({
        where: { id: { in: meetingIds }, status: { not: MeetingStatus.CANCELLED } },
        orderBy: { startAt: 'asc' },
      });
      return this.enrich(actor, meetings);
    }

    let where: Prisma.MeetingWhereInput = { ...orgFilter };
    switch (scope) {
      case 'mine':
        where = { hostId: actor.id };
        break;
      case 'upcoming':
        where = { ...orgFilter, status: MeetingStatus.SCHEDULED, startAt: { gt: now } };
        break;
      case 'ongoing':
        where = { ...orgFilter, status: { in: [MeetingStatus.LIVE, MeetingStatus.SCHEDULED] }, startAt: { lte: now }, endAt: { gte: now } };
        break;
      case 'past':
        where = { ...orgFilter, OR: [{ status: MeetingStatus.ENDED }, { endAt: { lt: now } }] };
        break;
      case 'all':
      default:
        break;
    }

    // Visibility: non-admins only see meetings they host or are invited to.
    if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.INSTITUTE_ADMIN) {
      const myInvites = await this.prisma.invitation.findMany({ where: { inviteeUserId: actor.id }, select: { meetingId: true } });
      const invitedIds = myInvites.map((i) => i.meetingId);
      where = { AND: [where, { OR: [{ hostId: actor.id }, { id: { in: invitedIds } }] }] };
    }

    const meetings = await this.prisma.meeting.findMany({ where, orderBy: { startAt: scope === 'past' ? 'desc' : 'asc' }, take: 100 });
    return this.enrich(actor, meetings);
  }

  private async enrich(actor: AuthedUser, meetings: Meeting[]) {
    const hostIds = [...new Set(meetings.map((m) => m.hostId))];
    const hosts = await this.prisma.user.findMany({ where: { id: { in: hostIds } }, select: { id: true, fullName: true } });
    const hostMap = new Map(hosts.map((h) => [h.id, h.fullName]));

    const result = [];
    for (const m of meetings) {
      const participantCount = await this.prisma.participant.count({ where: { meetingId: m.id } });
      const myInvite = await this.prisma.invitation.findFirst({ where: { meetingId: m.id, inviteeUserId: actor.id } });
      result.push({
        id: m.id,
        meetingCode: m.meetingCode,
        title: m.title,
        hostName: hostMap.get(m.hostId) ?? 'Unknown',
        isHost: m.hostId === actor.id,
        startAt: m.startAt,
        endAt: m.endAt,
        timezone: m.timezone,
        status: m.status,
        confidentiality: m.confidentiality,
        waitingRoomEnabled: m.waitingRoomEnabled,
        hasPasscode: !!m.passcodeHash,
        locked: m.locked,
        participantCount,
        myInvitationStatus: myInvite?.status ?? null,
      });
    }
    return result;
  }

  // ---------------- Details ----------------

  async getDetails(actor: AuthedUser, id: string) {
    const meeting = await this.loadMeeting(id);
    await this.assertCanView(actor, meeting);

    const [host, participants, invitations, documentCount] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: meeting.hostId }, select: { id: true, fullName: true, email: true, designation: true } }),
      this.prisma.participant.findMany({ where: { meetingId: id } }),
      this.prisma.invitation.findMany({ where: { meetingId: id } }),
      this.prisma.document.count({ where: { meetingId: id } }),
    ]);

    const myInvite = invitations.find((i) => i.inviteeUserId === actor.id) ?? null;
    return {
      ...this.publicMeeting(meeting),
      host,
      participants: participants.map((p) => ({ id: p.id, userId: p.userId, guestName: p.guestName, state: p.state, handRaised: p.handRaised })),
      invitationCount: invitations.length,
      documentCount,
      canManage: this.canManage(actor, meeting),
      myInvitationStatus: myInvite?.status ?? null,
    };
  }

  // ---------------- Update / cancel ----------------

  async update(actor: AuthedUser, id: string, dto: UpdateMeetingDto) {
    const meeting = await this.loadMeeting(id);
    this.assertCanManage(actor, meeting);
    if (meeting.status === MeetingStatus.ENDED || meeting.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException('Cannot edit a meeting that has ended or been cancelled');
    }

    const start = dto.startAt ? new Date(dto.startAt) : meeting.startAt;
    const end = dto.endAt ? new Date(dto.endAt) : meeting.endAt;
    if (end.getTime() <= start.getTime()) throw new BadRequestException('End time must be after the start time');

    const data: Prisma.MeetingUpdateInput = {
      title: dto.title?.trim(),
      description: dto.description,
      agenda: dto.agenda,
      startAt: dto.startAt ? start : undefined,
      endAt: dto.endAt ? end : undefined,
      timezone: dto.timezone,
      confidentiality: dto.confidentiality,
      waitingRoomEnabled: dto.waitingRoomEnabled,
      capacity: dto.capacity,
    };
    if (dto.passcode !== undefined) {
      data.passcodeHash = dto.passcode ? await argon2.hash(dto.passcode, { type: argon2.argon2id }) : null;
    }
    if (dto.policies) {
      const p = dto.policies;
      Object.assign(data, {
        allowRecording: p.allowRecording, allowScreenShare: p.allowScreenShare,
        allowChat: p.allowChat, micOnJoin: p.micOnJoin, cameraOnJoin: p.cameraOnJoin,
      });
    }

    await this.prisma.meeting.update({ where: { id }, data });
    await this.audit.log({ actorId: actor.id, action: 'MEETING_UPDATED', targetType: 'Meeting', targetId: id, orgId: meeting.orgId });
    await this.notifyParticipants(id, meeting.hostId, 'MEETING_UPDATED', 'Meeting updated', `"${meeting.title}" was updated.`, { meetingId: id });
    return this.getDetails(actor, id);
  }

  async cancel(actor: AuthedUser, id: string) {
    const meeting = await this.loadMeeting(id);
    this.assertCanManage(actor, meeting);
    if (meeting.status === MeetingStatus.CANCELLED) return { message: 'Already cancelled' };

    await this.prisma.meeting.update({ where: { id }, data: { status: MeetingStatus.CANCELLED } });
    await this.audit.log({ actorId: actor.id, action: 'MEETING_CANCELLED', targetType: 'Meeting', targetId: id, orgId: meeting.orgId });
    await this.notifyParticipants(id, meeting.hostId, 'MEETING_CANCELLED', 'Meeting cancelled', `"${meeting.title}" was cancelled.`, { meetingId: id });
    return { message: 'Meeting cancelled' };
  }

  async listParticipants(actor: AuthedUser, id: string) {
    const meeting = await this.loadMeeting(id);
    await this.assertCanView(actor, meeting);
    const participants = await this.prisma.participant.findMany({ where: { meetingId: id } });
    const userIds = participants.map((p) => p.userId).filter((x): x is string => !!x);
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } });
    const umap = new Map(users.map((u) => [u.id, u]));
    return participants.map((p) => ({
      id: p.id, state: p.state, handRaised: p.handRaised,
      name: p.userId ? umap.get(p.userId)?.fullName ?? 'User' : p.guestName ?? 'Guest',
      isGuest: !p.userId,
    }));
  }

  // ---------------- Invitations (used here + by invitations controller) ----------------

  async inviteInternal(actor: AuthedUser, meeting: Meeting, invitees: InviteeDto[]) {
    const results: { invited: number; skipped: Array<{ who: string; reason: string }>; guestLinks: Array<{ email: string; token: string }> } = {
      invited: 0, skipped: [], guestLinks: [],
    };

    // AICTE (Super Admin) and Ministry hosts may convene across institutions;
    // Institute Admin / HOD / Faculty hosts are confined to the meeting's own org.
    const crossOrgAllowed = actor.role === Role.SUPER_ADMIN || actor.role === Role.MINISTRY;

    for (const inv of invitees) {
      try {
        if (inv.userId) {
          const target = await this.prisma.user.findUnique({ where: { id: inv.userId } });
          if (!target) { results.skipped.push({ who: inv.userId, reason: 'user not found' }); continue; }
          // Cross-institution invites are denied unless the host is AICTE/Ministry.
          if (!crossOrgAllowed && target.orgId !== meeting.orgId) {
            results.skipped.push({ who: target.email, reason: 'different institution' });
            continue;
          }
          const existing = await this.prisma.invitation.findFirst({ where: { meetingId: meeting.id, inviteeUserId: target.id } });
          if (existing) { results.skipped.push({ who: target.email, reason: 'already invited' }); continue; }

          await this.prisma.invitation.create({
            data: { meetingId: meeting.id, inviteeUserId: target.id, role: inv.role ?? InvitationRole.PARTICIPANT, status: 'PENDING', expiresAt: meeting.endAt },
          });
          await this.ensureParticipant(meeting.id, target.id, null);
          await this.notifications.create(target.id, 'INVITATION', 'Meeting invitation', `You are invited to "${meeting.title}".`, { meetingId: meeting.id, meetingCode: meeting.meetingCode });
          results.invited += 1;
        } else if (inv.email) {
          // Invitations are restricted to REGISTERED members only — no external/guest invites.
          // People outside the app cannot be invited (they would never receive a calendar update
          // or in-app notification). An email is accepted only if it resolves to an existing
          // account the host is allowed to invite; otherwise it is skipped.
          const email = inv.email.toLowerCase().trim();
          const existingUser = await this.prisma.user.findUnique({ where: { email } });
          if (!existingUser) {
            results.skipped.push({ who: email, reason: 'not a registered member' });
            continue;
          }
          if (!crossOrgAllowed && existingUser.orgId !== meeting.orgId) {
            results.skipped.push({ who: email, reason: 'different institution' });
            continue;
          }
          const sub = await this.inviteInternal(actor, meeting, [{ userId: existingUser.id, role: inv.role }]);
          results.invited += sub.invited;
          results.skipped.push(...sub.skipped);
        } else {
          results.skipped.push({ who: '(empty)', reason: 'no userId or email' });
        }
      } catch (e) {
        results.skipped.push({ who: inv.userId ?? inv.email ?? '?', reason: (e as Error).message });
      }
    }

    await this.audit.log({ actorId: actor.id, action: 'MEETING_INVITED', targetType: 'Meeting', targetId: meeting.id, orgId: meeting.orgId, metadata: { count: results.invited } });
    return results;
  }

  async invite(actor: AuthedUser, meetingId: string, invitees: InviteeDto[]) {
    const meeting = await this.loadMeeting(meetingId);
    this.assertCanManage(actor, meeting);
    return this.inviteInternal(actor, meeting, invitees);
  }

  private async ensureParticipant(meetingId: string, userId: string | null, guestName: string | null) {
    if (userId) {
      const existing = await this.prisma.participant.findFirst({ where: { meetingId, userId } });
      if (existing) return existing;
    }
    return this.prisma.participant.create({ data: { meetingId, userId, guestName, state: 'INVITED' } });
  }

  // ---------------- Live meeting: waiting room + token + host controls ----------------

  private assertJoinable(meeting: Meeting): void {
    if (meeting.status === MeetingStatus.CANCELLED) throw new BadRequestException('This meeting was cancelled');
    if (meeting.status === MeetingStatus.ENDED) throw new BadRequestException('This meeting has ended');
    const now = Date.now();
    const opens = meeting.startAt.getTime() - 15 * 60 * 1000; // join opens 15 min before start
    const closes = meeting.endAt.getTime() + 30 * 60 * 1000; // small grace after end
    if (now < opens) throw new BadRequestException('The meeting has not opened yet');
    if (now > closes) throw new BadRequestException('The meeting join window has closed');
  }

  async joinRequest(actor: AuthedUser, id: string, passcode?: string) {
    const meeting = await this.loadMeeting(id);
    await this.assertCanView(actor, meeting);
    this.assertJoinable(meeting);

    const isHost = this.canManage(actor, meeting);

    if (meeting.passcodeHash && !isHost) {
      const ok = passcode ? await argon2.verify(meeting.passcodeHash, passcode).catch(() => false) : false;
      if (!ok) throw new ForbiddenException('Incorrect meeting passcode');
    }
    if (!isHost && meeting.locked) throw new ForbiddenException('The meeting is locked by the host');

    const activeCount = await this.prisma.participant.count({ where: { meetingId: id, state: { in: ['ADMITTED', 'JOINED'] } } });
    if (!isHost && activeCount >= meeting.capacity) throw new ForbiddenException('The meeting is at capacity');

    const participant = await this.ensureParticipant(id, actor.id, null);

    if (isHost || !meeting.waitingRoomEnabled) {
      await this.prisma.participant.update({ where: { id: participant.id }, data: { state: 'ADMITTED' } });
      return { admitted: true, waiting: false };
    }

    await this.prisma.participant.update({ where: { id: participant.id }, data: { state: 'WAITING' } });
    const profile = await this.prisma.user.findUnique({ where: { id: actor.id }, select: { fullName: true } });
    this.realtime.emitWaitingRequest(id, meeting.hostId, { userId: actor.id, name: profile?.fullName ?? 'User', participantId: participant.id });
    await this.audit.log({ actorId: actor.id, action: 'MEETING_WAITING', targetType: 'Meeting', targetId: id });
    return { admitted: false, waiting: true };
  }

  async issueToken(actor: AuthedUser, id: string) {
    const meeting = await this.loadMeeting(id);
    await this.assertCanView(actor, meeting);
    this.assertJoinable(meeting);
    const isHost = this.canManage(actor, meeting);

    const participant = await this.prisma.participant.findFirst({ where: { meetingId: id, userId: actor.id } });
    if (!isHost && (!participant || participant.state !== 'ADMITTED')) {
      throw new ForbiddenException('You have not been admitted to this meeting yet');
    }
    if (!isHost && meeting.locked) throw new ForbiddenException('The meeting is locked by the host');

    const profile = await this.prisma.user.findUnique({ where: { id: actor.id }, select: { fullName: true } });
    const token = await this.livekit.createToken({
      room: meeting.livekitRoom,
      identity: actor.id,
      name: profile?.fullName ?? 'User',
      canPublish: true,
    });

    await this.prisma.participant.updateMany({ where: { meetingId: id, userId: actor.id }, data: { state: 'JOINED', joinedAt: new Date() } });
    if (meeting.status === MeetingStatus.SCHEDULED) {
      await this.prisma.meeting.update({ where: { id }, data: { status: MeetingStatus.LIVE } });
    }
    this.realtime.emitParticipantUpdate(id);
    await this.audit.log({ actorId: actor.id, action: 'MEETING_JOINED', targetType: 'Meeting', targetId: id, orgId: meeting.orgId });

    return {
      token,
      url: this.livekit.clientUrl,
      room: meeting.livekitRoom,
      identity: actor.id,
      isHost,
      policies: {
        allowRecording: meeting.allowRecording,
        allowScreenShare: meeting.allowScreenShare,
        allowChat: meeting.allowChat,
        micOnJoin: meeting.micOnJoin,
        cameraOnJoin: meeting.cameraOnJoin,
      },
    };
  }

  async waitingList(actor: AuthedUser, id: string) {
    const meeting = await this.loadMeeting(id);
    this.assertCanManage(actor, meeting);
    const waiting = await this.prisma.participant.findMany({ where: { meetingId: id, state: 'WAITING' } });
    const userIds = waiting.map((w) => w.userId).filter((x): x is string => !!x);
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
    const umap = new Map(users.map((u) => [u.id, u.fullName]));
    return waiting.map((w) => ({ participantId: w.id, userId: w.userId, name: w.userId ? umap.get(w.userId) ?? 'User' : w.guestName ?? 'Guest' }));
  }

  async admit(actor: AuthedUser, id: string, targetUserId: string) {
    const meeting = await this.loadMeeting(id);
    this.assertCanManage(actor, meeting);
    await this.prisma.participant.updateMany({ where: { meetingId: id, userId: targetUserId }, data: { state: 'ADMITTED' } });
    this.realtime.emitAdmitted(id, targetUserId);
    this.realtime.emitParticipantUpdate(id);
    await this.notifications.create(targetUserId, 'WAITING_ROOM_ADMITTED', 'Admitted to meeting', `You have been admitted to "${meeting.title}".`, { meetingId: id });
    await this.audit.log({ actorId: actor.id, action: 'MEETING_ADMITTED', targetType: 'Meeting', targetId: id, metadata: { targetUserId } });
    return { message: 'Admitted' };
  }

  async deny(actor: AuthedUser, id: string, targetUserId: string) {
    const meeting = await this.loadMeeting(id);
    this.assertCanManage(actor, meeting);
    await this.prisma.participant.updateMany({ where: { meetingId: id, userId: targetUserId }, data: { state: 'DENIED' } });
    this.realtime.emitDenied(id, targetUserId);
    await this.audit.log({ actorId: actor.id, action: 'MEETING_DENIED', targetType: 'Meeting', targetId: id, metadata: { targetUserId } });
    return { message: 'Denied' };
  }

  async removeParticipant(actor: AuthedUser, id: string, targetUserId: string) {
    const meeting = await this.loadMeeting(id);
    this.assertCanManage(actor, meeting);
    await this.prisma.participant.updateMany({ where: { meetingId: id, userId: targetUserId }, data: { state: 'REMOVED' } });
    await this.livekit.removeParticipant(meeting.livekitRoom, targetUserId);
    this.realtime.emitRemoved(id, targetUserId);
    await this.audit.log({ actorId: actor.id, action: 'MEETING_REMOVED_PARTICIPANT', targetType: 'Meeting', targetId: id, metadata: { targetUserId } });
    return { message: 'Participant removed' };
  }

  async setLock(actor: AuthedUser, id: string, locked: boolean) {
    const meeting = await this.loadMeeting(id);
    this.assertCanManage(actor, meeting);
    await this.prisma.meeting.update({ where: { id }, data: { locked } });
    this.realtime.emitLock(id, locked);
    await this.audit.log({ actorId: actor.id, action: locked ? 'MEETING_LOCKED' : 'MEETING_UNLOCKED', targetType: 'Meeting', targetId: id });
    return { message: locked ? 'Meeting locked' : 'Meeting unlocked', locked };
  }

  async forceMute(actor: AuthedUser, id: string, targetUserId: string) {
    const meeting = await this.loadMeeting(id);
    this.assertCanManage(actor, meeting);
    this.realtime.emitForceMute(id, targetUserId);
    await this.audit.log({ actorId: actor.id, action: 'MEETING_MUTE', targetType: 'Meeting', targetId: id, metadata: { targetUserId } });
    return { message: 'Mute signal sent' };
  }

  async endMeeting(actor: AuthedUser, id: string) {
    const meeting = await this.loadMeeting(id);
    this.assertCanManage(actor, meeting);
    await this.prisma.meeting.update({ where: { id }, data: { status: MeetingStatus.ENDED } });
    await this.livekit.endRoom(meeting.livekitRoom);
    this.realtime.emitEnded(id);
    await this.audit.log({ actorId: actor.id, action: 'MEETING_ENDED', targetType: 'Meeting', targetId: id, orgId: meeting.orgId });
    return { message: 'Meeting ended for all' };
  }

  // ---------------- Access helpers ----------------

  private async loadMeeting(id: string): Promise<Meeting> {
    const meeting = await this.prisma.meeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    return meeting;
  }

  canManage(actor: AuthedUser, meeting: Meeting): boolean {
    if (actor.role === Role.SUPER_ADMIN) return true;
    if (meeting.hostId === actor.id) return true;
    if (actor.role === Role.INSTITUTE_ADMIN && actor.orgId === meeting.orgId) return true;
    return false;
  }

  private assertCanManage(actor: AuthedUser, meeting: Meeting): void {
    if (!this.canManage(actor, meeting)) throw new ForbiddenException('You cannot manage this meeting');
  }

  async assertCanView(actor: AuthedUser, meeting: Meeting): Promise<void> {
    if (this.canManage(actor, meeting)) return;
    const invite = await this.prisma.invitation.findFirst({ where: { meetingId: meeting.id, inviteeUserId: actor.id } });
    if (invite) return;
    // Deny by default (including cross-institution).
    throw new ForbiddenException('You do not have access to this meeting');
  }

  private async notifyParticipants(meetingId: string, excludeUserId: string, type: 'MEETING_UPDATED' | 'MEETING_CANCELLED', title: string, body: string, data: Record<string, unknown>) {
    const parts = await this.prisma.participant.findMany({ where: { meetingId }, select: { userId: true } });
    const userIds = parts.map((p) => p.userId).filter((x): x is string => !!x && x !== excludeUserId);
    await this.notifications.createMany([...new Set(userIds)], type, title, body, data);
  }

  private publicMeeting(m: Meeting) {
    return {
      id: m.id,
      meetingCode: m.meetingCode,
      title: m.title,
      description: m.description,
      agenda: m.agenda,
      hostId: m.hostId,
      orgId: m.orgId,
      departmentId: m.departmentId,
      startAt: m.startAt,
      endAt: m.endAt,
      timezone: m.timezone,
      type: m.type,
      confidentiality: m.confidentiality,
      status: m.status,
      waitingRoomEnabled: m.waitingRoomEnabled,
      hasPasscode: !!m.passcodeHash,
      locked: m.locked,
      capacity: m.capacity,
      policies: {
        allowRecording: m.allowRecording,
        allowScreenShare: m.allowScreenShare,
        allowChat: m.allowChat,
        micOnJoin: m.micOnJoin,
        cameraOnJoin: m.cameraOnJoin,
      },
    };
  }
}
