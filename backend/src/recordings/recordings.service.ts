import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MeetingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { LivekitService } from '../livekit/livekit.service';
import { MeetingsService } from '../meetings/meetings.service';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';

@Injectable()
export class RecordingsService {
  private readonly logger = new Logger(RecordingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly livekit: LivekitService,
    private readonly meetings: MeetingsService,
  ) {}

  async start(actor: AuthedUser, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!this.meetings.canManage(actor, meeting)) throw new ForbiddenException('Only the host can start recording');
    // Policy gate: recording must be permitted for this meeting.
    if (!meeting.allowRecording) throw new ForbiddenException('Recording is not permitted for this meeting');
    if (meeting.status !== MeetingStatus.LIVE) throw new BadRequestException('The meeting must be live to record');

    const existing = await this.prisma.recording.findFirst({ where: { meetingId, status: { in: ['STARTING', 'ACTIVE'] } } });
    if (existing) throw new BadRequestException('A recording is already in progress');

    const rec = await this.prisma.recording.create({ data: { meetingId, startedBy: actor.id, status: 'STARTING' } });
    try {
      const { egressId, storageKey } = await this.livekit.startRecording(meeting.livekitRoom);
      const updated = await this.prisma.recording.update({ where: { id: rec.id }, data: { egressId, storageKey, status: 'ACTIVE' } });
      await this.audit.log({ actorId: actor.id, action: 'RECORDING_STARTED', targetType: 'Meeting', targetId: meetingId, orgId: meeting.orgId, metadata: { egressId } });
      return { id: updated.id, status: updated.status };
    } catch (e) {
      await this.prisma.recording.update({ where: { id: rec.id }, data: { status: 'FAILED' } });
      this.logger.error(`Egress start failed: ${(e as Error).message}`);
      // Honest failure: egress service likely not running.
      throw new BadRequestException('Could not start recording. Ensure the LiveKit Egress service is running.');
    }
  }

  async stop(actor: AuthedUser, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (!this.meetings.canManage(actor, meeting)) throw new ForbiddenException('Only the host can stop recording');

    const rec = await this.prisma.recording.findFirst({ where: { meetingId, status: { in: ['STARTING', 'ACTIVE'] } } });
    if (!rec || !rec.egressId) throw new BadRequestException('No active recording');

    try { await this.livekit.stopRecording(rec.egressId); } catch (e) { this.logger.warn(`stopEgress failed: ${(e as Error).message}`); }
    const updated = await this.prisma.recording.update({ where: { id: rec.id }, data: { status: 'COMPLETED', endedAt: new Date() } });
    await this.audit.log({ actorId: actor.id, action: 'RECORDING_STOPPED', targetType: 'Meeting', targetId: meetingId, orgId: meeting.orgId });
    return { id: updated.id, status: updated.status };
  }

  async list(actor: AuthedUser, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    await this.meetings.assertCanView(actor, meeting);
    const recs = await this.prisma.recording.findMany({ where: { meetingId }, orderBy: { startedAt: 'desc' } });
    return recs.map((r) => ({ id: r.id, status: r.status, startedAt: r.startedAt, endedAt: r.endedAt, hasFile: !!r.storageKey }));
  }

  async url(actor: AuthedUser, recordingId: string) {
    const rec = await this.prisma.recording.findUnique({ where: { id: recordingId } });
    if (!rec || !rec.storageKey) throw new NotFoundException('Recording not available');
    const meeting = await this.prisma.meeting.findUnique({ where: { id: rec.meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    await this.meetings.assertCanView(actor, meeting);
    if (rec.status !== 'COMPLETED') throw new BadRequestException('Recording is not ready yet');

    const url = await this.storage.presignGet(rec.storageKey);
    await this.audit.log({ actorId: actor.id, action: 'RECORDING_ACCESSED', targetType: 'Recording', targetId: rec.id, orgId: meeting.orgId });
    return { url, expiresInSeconds: this.storage.signedUrlTtl };
  }
}
