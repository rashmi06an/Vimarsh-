import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrgType, Role } from '@prisma/client';
import { OrgsService } from './orgs.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';

class CreateOrgDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsEnum(OrgType) type!: OrgType;
  @IsString() @IsNotEmpty() @MaxLength(40) code!: string;
  @IsOptional() @IsString() parentId?: string;
}

class CreateDeptDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
}

@ApiTags('orgs')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('orgs')
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Get()
  @ApiOperation({ summary: 'List organizations (used during registration/org verification)' })
  list() {
    return this.orgs.listOrgs();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one organization with its departments' })
  get(@Param('id') id: string) {
    return this.orgs.getOrg(id);
  }

  @Get(':id/departments')
  @ApiOperation({ summary: 'List departments of an organization' })
  departments(@Param('id') id: string) {
    return this.orgs.listDepartments(id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create an organization (Super Admin only)' })
  create(@CurrentUser() user: AuthedUser, @Body() dto: CreateOrgDto) {
    return this.orgs.createOrg(user.id, dto);
  }

  @Post(':id/departments')
  @Roles(Role.SUPER_ADMIN, Role.INSTITUTE_ADMIN)
  @ApiOperation({ summary: 'Create a department in an organization' })
  createDept(@CurrentUser() user: AuthedUser, @Param('id') id: string, @Body() dto: CreateDeptDto) {
    // Institute Admin is confined to their own organization; Super Admin is not.
    if (user.role === Role.INSTITUTE_ADMIN && user.orgId !== id) {
      throw new ForbiddenException('You can only manage your own organization');
    }
    return this.orgs.createDepartment(user.id, id, dto.name);
  }
}
