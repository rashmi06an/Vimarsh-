import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
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
