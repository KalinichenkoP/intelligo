/**
 * Typed application configuration loaded from environment variables.
 * Defaults mirror `.env.example` and are validated by the Joi schema.
 */
export interface AppConfig {
  port: number;
  nodeEnv: string;
  docketAlarm: {
    username: string;
    password: string;
    baseUrl: string;
    clientMatter: string;
    maxConcurrency: number;
    rateLimitMax: number;
    rateLimitDurationMs: number;
    retryAttempts: number;
    retryBackoffMs: number;
  };
  redis: {
    url: string;
  };
  queue: {
    resultCacheTtlSeconds: number;
    failedJobRetentionSeconds: number;
    jobWaitTimeoutMs: number;
  };
  aliases: {
    minConfidence: number;
    maxNames: number;
  };
  throttle: {
    ttlMs: number;
    limit: number;
  };
}

/**
 * Factory used by NestJS ConfigModule to map `process.env` into typed config.
 */
export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  docketAlarm: {
    username: process.env.DOCKET_ALARM_USERNAME ?? '',
    password: process.env.DOCKET_ALARM_PASSWORD ?? '',
    baseUrl: process.env.DOCKET_ALARM_BASE_URL ?? 'https://www.docketalarm.com/api/v1',
    clientMatter: process.env.DOCKET_ALARM_CLIENT_MATTER ?? 'intelligo-legal-results',
    maxConcurrency: parseInt(process.env.DOCKET_ALARM_MAX_CONCURRENCY ?? '5', 10),
    rateLimitMax: parseInt(process.env.DOCKET_ALARM_RATE_LIMIT_MAX ?? '5', 10),
    rateLimitDurationMs: parseInt(
      process.env.DOCKET_ALARM_RATE_LIMIT_DURATION_MS ?? '1000',
      10,
    ),
    retryAttempts: parseInt(process.env.DOCKET_ALARM_RETRY_ATTEMPTS ?? '3', 10),
    retryBackoffMs: parseInt(process.env.DOCKET_ALARM_RETRY_BACKOFF_MS ?? '1000', 10),
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  queue: {
    resultCacheTtlSeconds: parseInt(process.env.RESULT_CACHE_TTL_SECONDS ?? '30', 10),
    failedJobRetentionSeconds: parseInt(
      process.env.FAILED_JOB_RETENTION_SECONDS ?? '10',
      10,
    ),
    jobWaitTimeoutMs: parseInt(process.env.JOB_WAIT_TIMEOUT_MS ?? '20000', 10),
  },
  aliases: {
    minConfidence: parseFloat(process.env.ALIAS_MIN_CONFIDENCE ?? '0.3'),
    maxNames: parseInt(process.env.MAX_ALIAS_NAMES ?? '5', 10),
  },
  throttle: {
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '60', 10),
  },
});
