import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PasswordResetService } from './password-reset.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';

@ApiTags('password-resets')
@ApiBearerAuth()
@Roles(Role.SUPER_ADMIN, Role.INSTITUTE_ADMIN, Role.HOD)
@Controller('password-resets')
export class PasswordResetController {
  constructor(private readonly resets: PasswordResetService) {}

  @Get('pending')
  @ApiOperation({ summary: 'List members awaiting a password-reset approval (scoped by org)' })
  pending(@CurrentUser() user: AuthedUser) {
    return this.resets.listPending(user);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a reset request and issue a one-time code (returned once)' })
  approve(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.resets.approve(user, id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a reset request' })
  reject(@CurrentUser() user: AuthedUser, @Param('id') id: string) {
    return this.resets.reject(user, id);
  }
}
