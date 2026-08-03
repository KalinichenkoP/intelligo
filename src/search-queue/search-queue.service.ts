import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue, QueueEvents } from 'bullmq';
import { createHash } from 'crypto';
import { AppConfig } from '../config/configuration';
import { SearchCriteria } from '../legal-data-provider/interfaces/legal-data-provider.interface';
import {
  SEARCH_JOB_NAME,
  SEARCH_QUEUE_NAME,
  SearchJobPayload,
  SearchJobResult,
} from './search-queue.constants';

/**
 * Orchestrates enqueue + synchronous wait for DocketAlarm search jobs.
 *
 * Single-flight deduplication:
 * - jobId = sha256(entityType + normalized entityDetails)
 * - BullMQ atomically refuses to create a duplicate jobId while one is
 *   waiting/active/delayed, so N concurrent callers share one execution.
 * - waitUntilFinished resolves for every waiter once any Worker completes the job.
 * - Completed jobs retained for RESULT_CACHE_TTL_SECONDS act as a short result cache.
 */
@Injectable()
export class SearchQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(SearchQueueService.name);
  private readonly queueEvents: QueueEvents;
  private readonly jobWaitTimeoutMs: number;
  private readonly retryAttempts: number;
  private readonly retryBackoffMs: number;
  private readonly resultCacheTtlSeconds: number;
  private readonly failedJobRetentionSeconds: number;

  constructor(
    @InjectQueue(SEARCH_QUEUE_NAME)
    private readonly searchQueue: Queue<SearchJobPayload, SearchJobResult>,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {
    const redisUrl = this.configService.get('redis.url', { infer: true });
    const queueConfig = this.configService.get('queue', { infer: true });
    const da = this.configService.get('docketAlarm', { infer: true });

    this.jobWaitTimeoutMs = queueConfig.jobWaitTimeoutMs;
    this.retryAttempts = da.retryAttempts;
    this.retryBackoffMs = da.retryBackoffMs;
    this.resultCacheTtlSeconds = queueConfig.resultCacheTtlSeconds;
    this.failedJobRetentionSeconds = queueConfig.failedJobRetentionSeconds;

    this.queueEvents = new QueueEvents(SEARCH_QUEUE_NAME, {
      connection: { url: redisUrl },
    });
  }

  /**
   * Enqueue (or join) a search job and wait synchronously for its result.
   */
  async enqueueAndWait(criteria: SearchCriteria): Promise<SearchJobResult> {
    const jobId = this.computeJobId(criteria);

    // Fast path: completed job still within cache TTL
    const existing = await this.searchQueue.getJob(jobId);
    if (existing !== undefined) {
      const state = await existing.getState();
      if (state === 'completed') {
        const cached = existing.returnvalue;
        if (cached !== null && cached !== undefined) {
          this.logger.debug(`Cache hit for jobId=${jobId}`);
          return cached;
        }
      }
      if (state === 'failed') {
        // Let a near-simultaneous caller observe the same failure; do not silently re-run
        const failedReason = existing.failedReason ?? 'Search job failed';
        throw new SearchJobFailedError(failedReason);
      }
    }

    const job = await this.searchQueue.add(
      SEARCH_JOB_NAME,
      { jobId, criteria },
      {
        jobId,
        attempts: this.retryAttempts,
        backoff: {
          type: 'exponential',
          delay: this.retryBackoffMs,
        },
        removeOnComplete: {
          age: this.resultCacheTtlSeconds,
        },
        removeOnFail: {
          age: this.failedJobRetentionSeconds,
        },
      },
    );

    try {
      const result = await job.waitUntilFinished(this.queueEvents, this.jobWaitTimeoutMs);
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Search job wait failed';
      this.logger.error(`Job ${jobId} failed/timed out: ${message}`);
      throw new SearchJobFailedError(message, error);
    }
  }

  /**
   * Deterministic jobId from search criteria so duplicate entity payloads coalesce.
   */
  computeJobId(criteria: SearchCriteria): string {
    const normalized = {
      entityType: criteria.entityType,
      names: criteria.names.map((n) => ({
        full: n.full.toLowerCase(),
        confidence: n.confidence,
        type: n.type ?? null,
      })),
      states: [...criteria.states].sort(),
      companyType: criteria.companyType ?? null,
      dateFrom: criteria.dateFrom,
      dateTo: criteria.dateTo,
      maxResults: criteria.maxResults,
    };
    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueEvents.close();
  }
}

/**
 * Raised when a BullMQ search job fails or waitUntilFinished times out.
 * Mapped to HTTP 503 by LegalResultsService.
 */
export class SearchJobFailedError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SearchJobFailedError';
  }
}

/**
 * Type guard for SearchJobFailedError.
 */
export function isSearchJobFailedError(error: unknown): error is SearchJobFailedError {
  return error instanceof SearchJobFailedError;
}

/**
 * Exposed for tests that need to inspect raw BullMQ jobs.
 */
export type SearchJob = Job<SearchJobPayload, SearchJobResult>;
