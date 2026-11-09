import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness + honest provider-configuration report' })
  async health() {
    let db = 'down';
    try {
      // Lightweight round-trip to Mongo.
      await this.prisma.user.findFirst({ select: { id: true } });
      db = 'up';
    } catch {
      db = 'down';
    }

    const providers = this.config.get('providers') as {
      sms: string;
      push: string;
      malwareScanner: string;
    };

    return {
      status: 'ok',
      service: 'vimarsh-api',
      time: new Date().toISOString(),
      db,
      providers: {
        email: this.mail.isConfigured ? 'configured' : 'not-configured',
        sms: providers.sms ? 'configured' : 'not-configured',
        push: providers.push ? 'configured' : 'not-configured',
        malwareScanner: providers.malwareScanner ? 'configured' : 'not-configured',
      },
    };
  }
}
