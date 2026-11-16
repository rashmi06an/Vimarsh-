import { Module } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { InvitesController } from './invites.controller';

// PrismaService and AuditService are provided by @Global() modules, so no imports needed.
@Module({
  providers: [InvitesService],
  controllers: [InvitesController],
})
export class InvitesModule {}
