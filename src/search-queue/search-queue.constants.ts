/**
 * BullMQ queue / job name constants for DocketAlarm search orchestration.
 *
 * Queue name is overridable via SEARCH_QUEUE_NAME so automated tests can use an
 * isolated queue and never race a local `yarn start:dev` worker on the same Redis.
 */
export const SEARCH_QUEUE_NAME: string =
  process.env.SEARCH_QUEUE_NAME ?? 'docket-alarm-search';

/** Job name used for every legal-results search. */
export const SEARCH_JOB_NAME = 'search';

/**
 * Payload stored on each BullMQ search job.
 */
export interface SearchJobPayload {
  /** Stable hash of entityType + normalized entityDetails — also used as jobId. */
  jobId: string;
  /** Serialized SearchCriteria (JSON-safe). */
  criteria: import('../legal-data-provider/interfaces/legal-data-provider.interface').SearchCriteria;
}

/**
 * Result stored as the BullMQ job returnvalue (and thus available for cache hits).
 */
export interface SearchJobResult {
  cases: import('../legal-data-provider/interfaces/legal-data-provider.interface').LegalCase[];
  namesSearched: number;
  truncated: boolean;
}
