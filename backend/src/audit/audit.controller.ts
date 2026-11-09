import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuditService } from './audit.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTE_ADMIN)
  @ApiOperation({ summary: 'List audit entries (Super Admin: all; Institute Admin: own org only)' })
  async list(@CurrentUser() user: AuthedUser, @Query('limit') limit?: string) {
    // Institute Admin is scoped to their own organisation; Super Admin sees everything.
    const orgScope = user.role === Role.SUPER_ADMIN ? null : user.orgId;
    return this.audit.list(limit ? Number(limit) : 100, orgScope);
  }

  @Get('verify')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Verify the integrity of the entire audit hash chain' })
  async verify() {
    return this.audit.verifyChain();
  }
}
