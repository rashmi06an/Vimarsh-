import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { WsSafeThrottlerGuard } from './common/guards/ws-safe-throttler.guard';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { AuditModule } from './audit/audit.module';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrgsModule } from './orgs/orgs.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { NotificationsModule } from './notifications/notifications.module';
import { LivekitModule } from './livekit/livekit.module';
import { RealtimeModule } from './realtime/realtime.module';
import { MeetingsModule } from './meetings/meetings.module';
import { InvitationsModule } from './invitations/invitations.module';
import { DocumentsModule } from './documents/documents.module';
import { RecordingsModule } from './recordings/recordings.module';
import { HealthModule } from './health/health.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // .env lives at the project root; backend runs from ./backend.
      envFilePath: ['../.env', '.env'],
    }),
    // Global API rate limiting (per-route overrides via @Throttle).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
    PrismaModule,
    MailModule,
    AuditModule,
    StorageModule,
    AuthModule,
    UsersModule,
    OrgsModule,
    ApprovalsModule,
    NotificationsModule,
    LivekitModule,
    RealtimeModule,
    MeetingsModule,
    InvitationsModule,
    DocumentsModule,
    RecordingsModule,
    HealthModule,
  ],
  providers: [
    // Order matters: throttle -> authenticate -> authorize by role.
    { provide: APP_GUARD, useClass: WsSafeThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
