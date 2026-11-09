import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my notifications' })
  list(@CurrentUser() user: AuthedUser, @Query('limit') limit?: string) {
    return this.notifications.list(user.id, limit ? Number(limit) : 50);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count of my unread notifications' })
  async unread(@CurrentUser() user: AuthedUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  read(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all my notifications read' })
  readAll(@CurrentUser() user: AuthedUser) {
    return this.notifications.markAllRead(user.id);
  }
}
