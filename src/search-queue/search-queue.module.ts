import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { LegalDataProviderModule } from '../legal-data-provider/legal-data-provider.module';
import { SEARCH_QUEUE_NAME } from './search-queue.constants';
import { SearchQueueService } from './search-queue.service';
import { SearchProcessor } from './search.processor';

/**
 * Registers the BullMQ queue, worker processor, and SearchQueueService.
 *
 * Worker concurrency / rate limiter are configured on `@Processor`
 * (see SearchProcessor) from DOCKET_ALARM_MAX_CONCURRENCY and
 * DOCKET_ALARM_RATE_LIMIT_* environment variables.
 */
@Module({
  imports: [
    LegalDataProviderModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const redisUrl = configService.get('redis.url', { infer: true });
        return {
          connection: { url: redisUrl },
        };
      },
    }),
    BullModule.registerQueue({
      name: SEARCH_QUEUE_NAME,
    }),
  ],
  providers: [SearchQueueService, SearchProcessor],
  exports: [SearchQueueService, BullModule],
})
export class SearchQueueModule {}
