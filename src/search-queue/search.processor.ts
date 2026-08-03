import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  LEGAL_DATA_PROVIDER,
  LegalDataProviderPort,
} from '../legal-data-provider/interfaces/legal-data-provider.interface';
import {
  SEARCH_QUEUE_NAME,
  SearchJobPayload,
  SearchJobResult,
} from './search-queue.constants';

/**
 * Resolve worker options from environment.
 * Evaluated once at module load; defaults match `.env.example` / Joi schema.
 *
 * - concurrency: per-Worker-instance simultaneous jobs
 * - limiter: Redis-backed fleet-wide rate cap shared across all Workers
 */
function resolveWorkerOptions(): {
  concurrency: number;
  limiter: { max: number; duration: number };
} {
  return {
    concurrency: parseInt(process.env.DOCKET_ALARM_MAX_CONCURRENCY ?? '5', 10),
    limiter: {
      max: parseInt(process.env.DOCKET_ALARM_RATE_LIMIT_MAX ?? '5', 10),
      duration: parseInt(process.env.DOCKET_ALARM_RATE_LIMIT_DURATION_MS ?? '1000', 10),
    },
  };
}

/**
 * BullMQ worker that executes DocketAlarm searches.
 *
 * Job-level attempts/backoff are set when the job is enqueued by SearchQueueService.
 */
@Processor(SEARCH_QUEUE_NAME, resolveWorkerOptions())
export class SearchProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchProcessor.name);

  constructor(
    @Inject(LEGAL_DATA_PROVIDER)
    private readonly legalDataProvider: LegalDataProviderPort,
  ) {
    super();
  }

  /**
   * Process a single search job by delegating to LegalDataProviderPort.
   */
  async process(job: Job<SearchJobPayload, SearchJobResult>): Promise<SearchJobResult> {
    this.logger.debug(
      `Processing search job ${job.id} (attempt ${job.attemptsMade + 1})`,
    );

    const result = await this.legalDataProvider.search(job.data.criteria);

    return {
      cases: result.cases,
      namesSearched: result.namesSearched,
      truncated: result.truncated,
    };
  }
}
