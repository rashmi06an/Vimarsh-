import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Security headers. crossOriginResourcePolicy relaxed so the mobile app can read responses.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Global DTO validation: strip unknown props (whitelist) and reject them
  // (forbidNonWhitelisted) to block mass assignment; transform to DTO types.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const corsOrigins = config.get<string>('corsOrigins') ?? '*';
  app.enableCors({
    origin: corsOrigins === '*' ? true : corsOrigins.split(',').map((s) => s.trim()),
    credentials: true,
  });

  const swagger = new DocumentBuilder()
    .setTitle('AICTE Vimarsh API')
    .setDescription('Secure meeting platform API for India’s technical education')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, doc);

  const port = config.get<number>('port') ?? 4000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Vimarsh API listening on http://0.0.0.0:${port} (Swagger at /docs)`);
}

void bootstrap();
