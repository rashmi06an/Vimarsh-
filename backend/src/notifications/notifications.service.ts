import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type NotificationType =
  | 'INVITATION'
  | 'MEETING_UPDATED'
  | 'MEETING_CANCELLED'
  | 'MEETING_REMINDER'
  | 'APPROVAL_GRANTED'
  | 'APPROVAL_REJECTED'
  | 'WAITING_ROOM_ADMITTED'
  | 'SECURITY_EVENT';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create an in-app notification (always works, independent of push config). */
  async create(userId: string, type: NotificationType, title: string, body: string, data?: Record<string, unknown>) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, data: (data ?? undefined) as object | undefined },
    });
  }

  /** Fan-out the same notification to many users (e.g. meeting cancelled). */
  async createMany(userIds: string[], type: NotificationType, title: string, body: string, data?: Record<string, unknown>) {
    if (userIds.length === 0) return;
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, type, title, body, data: (data ?? undefined) as object | undefined })),
    });
  }

  list(userId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: { isSet: false } } });
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
    return { message: 'Marked read' };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: { isSet: false } }, data: { readAt: new Date() } });
    return { message: 'All marked read' };
  }
}
