import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Role } from '@prisma/client';
import { ApprovalsService } from './approvals.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';

class ApproveDto {
  @IsEnum(Role) role!: Role;
}
class RejectDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

@ApiTags('approvals')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.INSTITUTE_ADMIN)
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('pending')
  @ApiOperation({ summary: 'List registrations pending approval (scoped by role)' })
  pending(@CurrentUser() user: AuthedUser) {
    return this.approvals.listPending(user);
  }

  @Post(':userId/approve')
  @ApiOperation({ summary: 'Approve a registration and assign a role' })
  approve(@CurrentUser() user: AuthedUser, @Param('userId') userId: string, @Body() dto: ApproveDto) {
    return this.approvals.approve(user, userId, dto.role);
  }

  @Post(':userId/reject')
  @ApiOperation({ summary: 'Reject a registration with a reason (visible to the user)' })
  reject(@CurrentUser() user: AuthedUser, @Param('userId') userId: string, @Body() dto: RejectDto) {
    return this.approvals.reject(user, userId, dto.reason);
  }
}
