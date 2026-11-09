import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class OrgsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listOrgs() {
    return this.prisma.organization.findMany({ orderBy: { name: 'asc' } });
  }

  async getOrg(id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id }, include: { departments: true } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  listDepartments(orgId: string) {
    return this.prisma.department.findMany({ where: { orgId }, orderBy: { name: 'asc' } });
  }

  async createOrg(actorId: string, data: { name: string; type: OrgType; code: string; parentId?: string }) {
    const exists = await this.prisma.organization.findUnique({ where: { code: data.code } });
    if (exists) throw new BadRequestException('Organization code already in use');
    const org = await this.prisma.organization.create({ data });
    await this.audit.log({ actorId, action: 'ORG_CREATED', targetType: 'Organization', targetId: org.id, orgId: org.id, metadata: { code: org.code } });
    return org;
  }

  async createDepartment(actorId: string, orgId: string, name: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    const dept = await this.prisma.department.create({ data: { orgId, name } });
    await this.audit.log({ actorId, action: 'DEPARTMENT_CREATED', targetType: 'Department', targetId: dept.id, orgId });
    return dept;
  }
}
