import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { MeetingsService } from './meetings.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';
import { CreateMeetingDto, InviteBodyDto, MeetingScope, UpdateMeetingDto } from './dto/meeting.dto';

class JoinRequestDto {
  @IsOptional() @IsString() @MaxLength(40) passcode?: string;
}
class TargetUserDto {
  @IsString() targetUserId!: string;
}
class LockDto {
  @IsBoolean() locked!: boolean;
}

@ApiTags('meetings')
@ApiBearerAuth()
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Post()
  @ApiOperation({ summary: 'Schedule a meeting (roles permitted to schedule only)' })
  create(@CurrentUser() user: AuthedUser, @Body() dto: CreateMeetingDto) {
    return this.meetings.schedule(user, dto);
  }

  @Get()
  @ApiQuery({ name: 'scope', required: false, enum: ['upcoming', 'ongoing', 'past', 'invitations', 'mine', 'all'] })
  @ApiOperation({ summary: 'List meetings by scope (org + participation scoped)' })
  list(@CurrentUser() user: AuthedUser, @Query('scope') scope?: MeetingScope) {
    return this.meetings.list(user, scope ?? 'upcoming');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Meeting details (host/admin/invited only)' })
  details(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.meetings.getDetails(user, id);
  }

  @Get(':id/participants')
  @ApiOperation({ summary: 'List participants of a meeting' })
  participants(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.meetings.listParticipants(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a meeting (host/admin)' })
  update(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: UpdateMeetingDto) {
    return this.meetings.update(user, id, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a meeting (host/admin)' })
  cancel(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.meetings.cancel(user, id);
  }

  @Post(':id/invitations')
  @ApiOperation({ summary: 'Invite users/guests to a meeting (host/admin)' })
  invite(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: InviteBodyDto) {
    return this.meetings.invite(user, id, dto.invitees);
  }

  // ---- Live meeting ----

  @Post(':id/join-request')
  @ApiOperation({ summary: 'Request to join (enters waiting room unless host/no-waiting-room)' })
  joinRequest(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: JoinRequestDto) {
    return this.meetings.joinRequest(user, id, dto.passcode);
  }

  @Post(':id/token')
  @ApiOperation({ summary: 'Get a short-lived LiveKit token (only after admission)' })
  token(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.meetings.issueToken(user, id);
  }

  @Get(':id/waiting')
  @ApiOperation({ summary: 'List participants in the waiting room (host/admin)' })
  waiting(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.meetings.waitingList(user, id);
  }

  @Post(':id/admit')
  @ApiOperation({ summary: 'Admit a waiting participant (host/admin)' })
  admit(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: TargetUserDto) {
    return this.meetings.admit(user, id, dto.targetUserId);
  }

  @Post(':id/deny')
  @ApiOperation({ summary: 'Deny a waiting participant (host/admin)' })
  deny(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: TargetUserDto) {
    return this.meetings.deny(user, id, dto.targetUserId);
  }

  @Post(':id/remove')
  @ApiOperation({ summary: 'Remove a participant from the meeting (host/admin)' })
  remove(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: TargetUserDto) {
    return this.meetings.removeParticipant(user, id, dto.targetUserId);
  }

  @Post(':id/mute')
  @ApiOperation({ summary: 'Signal a participant to mute (host/admin)' })
  mute(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: TargetUserDto) {
    return this.meetings.forceMute(user, id, dto.targetUserId);
  }

  @Post(':id/lock')
  @ApiOperation({ summary: 'Lock/unlock the meeting (host/admin)' })
  lock(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: LockDto) {
    return this.meetings.setLock(user, id, dto.locked);
  }

  @Post(':id/end')
  @ApiOperation({ summary: 'End the meeting for all (host/admin)' })
  end(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.meetings.endMeeting(user, id);
  }
}
