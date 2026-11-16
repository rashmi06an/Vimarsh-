import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { InvitesService } from './invites.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';
import { CreateInviteDto, ValidateInviteDto } from './dto/invite.dto';

@ApiTags('invites')
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @ApiBearerAuth()
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTE_ADMIN, Role.HOD)
  @Post()
  @ApiOperation({ summary: 'Generate a single-use onboarding invite (returns the code once, for the QR)' })
  create(@CurrentUser() user: AuthedUser, @Body() dto: CreateInviteDto) {
    return this.invites.create(user, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTE_ADMIN, Role.HOD)
  @Get()
  @ApiOperation({ summary: 'List invites for the admin’s organisation (super admin sees all)' })
  list(@CurrentUser() user: AuthedUser) {
    return this.invites.list(user);
  }

  @ApiBearerAuth()
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTE_ADMIN, Role.HOD)
  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revoke an unused invite' })
  revoke(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.invites.revoke(user, id);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('validate')
  @ApiOperation({ summary: 'Check whether an invite code is currently usable (before registering)' })
  validate(@Body() dto: ValidateInviteDto) {
    return this.invites.validate(dto.code);
  }
}
