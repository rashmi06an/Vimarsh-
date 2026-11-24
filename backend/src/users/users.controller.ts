import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { UsersService } from './users.service';
import { TokensService } from '../auth/tokens.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';

class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(120) fullName?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) photoUrl?: string;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokensService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  me(@CurrentUser() user: AuthedUser) {
    return this.users.getProfile(user.id);
  }

  @Get('directory')
  @ApiOperation({ summary: 'Search registered members you may invite to a meeting' })
  directory(@CurrentUser() user: AuthedUser, @Query('q') q?: string) {
    return this.users.directory(user, q);
  }

  @Get('members')
  @ApiOperation({ summary: 'Admin: list organisation members (manage access)' })
  members(@CurrentUser() user: AuthedUser) {
    return this.users.listMembers(user);
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Admin: revoke a member\'s access' })
  suspend(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.users.setMemberAccess(user, id, true);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Admin: restore a member\'s access' })
  restore(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.users.setMemberAccess(user, id, false);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my profile' })
  updateMe(@CurrentUser() user: AuthedUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Get('me/sessions')
  @ApiOperation({ summary: 'List my active sessions/devices' })
  sessions(@CurrentUser() user: AuthedUser) {
    return this.users.listSessions(user.id);
  }

  @Delete('me/sessions/:id')
  @ApiOperation({ summary: 'Revoke one of my sessions' })
  async revoke(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    await this.tokens.revokeSessionById(user.id, id);
    return { message: 'Session revoked' };
  }

  @Post('me/deactivate')
  @ApiOperation({ summary: 'Deactivate my account (reversible; revokes sessions)' })
  deactivate(@CurrentUser() user: AuthedUser) {
    return this.users.deactivate(user.id);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Delete my account (erases personal data; irreversible)' })
  deleteMe(@CurrentUser() user: AuthedUser) {
    return this.users.deleteAccount(user.id);
  }
}
