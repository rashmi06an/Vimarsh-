import { Module } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';
import { PasswordResetController } from './password-reset.controller';

// PrismaService and AuditService come from @Global() modules.
// Exports PasswordResetService so AuthService can delegate the public /auth/forgot|reset routes.
@Module({
  providers: [PasswordResetService],
  controllers: [PasswordResetController],
  exports: [PasswordResetService],
})
export class PasswordResetModule {}
