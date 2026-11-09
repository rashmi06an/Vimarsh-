import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

interface SocketUser {
  id: string;
  name: string;
  role: string;
}

/**
 * Realtime events for live meetings: waiting-room signalling, chat, raise-hand, host controls.
 * Socket auth uses the same access JWT (passed in handshake auth.token). Each socket joins a
 * personal room `user:<id>` and, after subscribing, the `meeting:<id>` room.
 */
@WebSocketGateway({ cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('Realtime');
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const token = (socket.handshake.auth?.token as string) || (socket.handshake.query?.token as string);
      if (!token) throw new Error('no token');
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      const user: SocketUser = { id: payload.sub, name: payload.email, role: payload.role };
      socket.data.user = user;
      socket.join(`user:${user.id}`);
    } catch {
      socket.emit('error', { message: 'Unauthorized socket' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    const user = socket.data.user as SocketUser | undefined;
    const meetingId = socket.data.meetingId as string | undefined;
    if (user && meetingId) {
      this.server.to(`meeting:${meetingId}`).emit('participant:left', { userId: user.id });
    }
  }

  @SubscribeMessage('meeting:subscribe')
  onSubscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: { meetingId: string }): void {
    if (!body?.meetingId) return;
    socket.data.meetingId = body.meetingId;
    socket.join(`meeting:${body.meetingId}`);
  }

  @SubscribeMessage('chat:send')
  async onChat(@ConnectedSocket() socket: Socket, @MessageBody() body: { meetingId: string; text: string }): Promise<void> {
    const user = socket.data.user as SocketUser | undefined;
    if (!user || !body?.meetingId || !body?.text) return;
    // Verify the sender is an admitted/joined participant (or host) before relaying.
    const allowed = await this.isActiveParticipant(body.meetingId, user.id);
    if (!allowed) return;
    const profile = await this.prisma.user.findUnique({ where: { id: user.id }, select: { fullName: true } });
    this.server.to(`meeting:${body.meetingId}`).emit('chat:message', {
      userId: user.id,
      name: profile?.fullName ?? 'User',
      text: String(body.text).slice(0, 2000),
      at: new Date().toISOString(),
    });
  }

  @SubscribeMessage('hand:raise')
  async onHand(@ConnectedSocket() socket: Socket, @MessageBody() body: { meetingId: string; raised: boolean }): Promise<void> {
    const user = socket.data.user as SocketUser | undefined;
    if (!user || !body?.meetingId) return;
    await this.prisma.participant.updateMany({ where: { meetingId: body.meetingId, userId: user.id }, data: { handRaised: !!body.raised } });
    this.server.to(`meeting:${body.meetingId}`).emit('participant:hand', { userId: user.id, raised: !!body.raised });
  }

  private async isActiveParticipant(meetingId: string, userId: string): Promise<boolean> {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId }, select: { hostId: true } });
    if (meeting?.hostId === userId) return true;
    const p = await this.prisma.participant.findFirst({ where: { meetingId, userId, state: { in: ['ADMITTED', 'JOINED'] } } });
    return !!p;
  }

  // ---- Emit helpers called by MeetingsService (REST host controls) ----

  emitWaitingRequest(meetingId: string, hostId: string, participant: { userId: string | null; name: string; participantId: string }): void {
    this.server.to(`user:${hostId}`).emit('waiting:request', { meetingId, ...participant });
  }

  emitAdmitted(meetingId: string, userId: string): void {
    this.server.to(`user:${userId}`).emit('waiting:admitted', { meetingId });
  }

  emitDenied(meetingId: string, userId: string): void {
    this.server.to(`user:${userId}`).emit('waiting:denied', { meetingId });
  }

  emitParticipantUpdate(meetingId: string): void {
    this.server.to(`meeting:${meetingId}`).emit('participant:update', { meetingId });
  }

  emitRemoved(meetingId: string, userId: string): void {
    this.server.to(`user:${userId}`).emit('meeting:removed', { meetingId });
    this.server.to(`meeting:${meetingId}`).emit('participant:update', { meetingId });
  }

  emitLock(meetingId: string, locked: boolean): void {
    this.server.to(`meeting:${meetingId}`).emit('meeting:lock', { meetingId, locked });
  }

  emitEnded(meetingId: string): void {
    this.server.to(`meeting:${meetingId}`).emit('meeting:ended', { meetingId });
  }

  emitForceMute(meetingId: string, userId: string): void {
    this.server.to(`user:${userId}`).emit('host:mute', { meetingId });
  }
}
