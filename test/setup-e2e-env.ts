/**
 * Isolates e2e BullMQ traffic from a local `yarn start:dev` worker.
 */
process.env.SEARCH_QUEUE_NAME =
  process.env.SEARCH_QUEUE_NAME ?? 'docket-alarm-search-e2e';
process.env.DOCKET_ALARM_USERNAME =
  process.env.DOCKET_ALARM_USERNAME ?? 'test@example.com';
process.env.DOCKET_ALARM_PASSWORD = process.env.DOCKET_ALARM_PASSWORD ?? 'test-password';
process.env.DOCKET_ALARM_BASE_URL =
  process.env.DOCKET_ALARM_BASE_URL ?? 'https://www.docketalarm.com/api/v1';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.RESULT_CACHE_TTL_SECONDS = '5';
process.env.JOB_WAIT_TIMEOUT_MS = '20000';
process.env.DOCKET_ALARM_RETRY_ATTEMPTS = '2';
process.env.DOCKET_ALARM_RETRY_BACKOFF_MS = '100';
