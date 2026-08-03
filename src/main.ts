import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

/**
 * Bootstrap the NestJS HTTP server.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService<AppConfig, true>);
  const port = configService.get('port', { infer: true });
  const nodeEnv = configService.get('nodeEnv', { infer: true });

  app.use(helmet());
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Intelligo Legal Results API')
    .setDescription(
      'Production-oriented NestJS proxy for DocketAlarm legal case search. ' +
        'Exposes POST /api/v1/legal_results with alias fan-out, 250-result capping, ' +
        'court-priority sorting, and BullMQ-backed single-flight deduplication.',
    )
    .setVersion('1.0.0')
    .addTag('legal-results')
    .addTag('health')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(port);
  Logger.log(
    `Listening on http://localhost:${port} (env=${nodeEnv}); Swagger at /docs`,
    'Bootstrap',
  );
}

void bootstrap();
