/**
 * Runs before queue test files are loaded so SEARCH_QUEUE_NAME is set before
 * @Processor / BullModule.registerQueue evaluate the queue constant.
 *
 * Isolates tests from a concurrently running `yarn start:dev` worker that
 * would otherwise steal jobs from the shared production queue name.
 */
process.env.SEARCH_QUEUE_NAME =
  process.env.SEARCH_QUEUE_NAME ?? 'docket-alarm-search-test';
process.env.DOCKET_ALARM_USERNAME =
  process.env.DOCKET_ALARM_USERNAME ?? 'test@example.com';
process.env.DOCKET_ALARM_PASSWORD = process.env.DOCKET_ALARM_PASSWORD ?? 'test-password';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.DOCKET_ALARM_RETRY_ATTEMPTS = '3';
process.env.DOCKET_ALARM_RETRY_BACKOFF_MS = '100';
process.env.RESULT_CACHE_TTL_SECONDS = '3';
process.env.FAILED_JOB_RETENTION_SECONDS = '2';
process.env.JOB_WAIT_TIMEOUT_MS = '15000';
process.env.DOCKET_ALARM_MAX_CONCURRENCY = '2';
