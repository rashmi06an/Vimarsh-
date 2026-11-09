import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Single Prisma client for the app lifecycle. Connects on module init so a bad
 * DATABASE_URL fails fast at startup rather than on first query.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to MongoDB');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
