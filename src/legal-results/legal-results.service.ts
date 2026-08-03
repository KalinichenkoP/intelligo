import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  CourtType,
  LegalCase,
} from '../legal-data-provider/interfaces/legal-data-provider.interface';
import { courtTypePriority } from '../legal-data-provider/docket-alarm/court-classifier.util';
import { LegalResultsRequestDto } from './dto/legal-results-request.dto';
import { LegalResultsResponseDto } from './dto/legal-results-response.dto';
import { EntityResolverService } from './entity-resolver.service';
import {
  isSearchJobFailedError,
  SearchQueueService,
} from '../search-queue/search-queue.service';

/**
 * Application service for POST /api/v1/legal_results.
 *
 * Flow:
 * 1. Resolve entityDetails → SearchCriteria
 * 2. Enqueue (or join) a BullMQ job and wait synchronously for the result
 * 3. Sort by court priority, then filing date descending (missing dates last)
 * 4. Map to the public response DTO
 */
@Injectable()
export class LegalResultsService {
  private readonly logger = new Logger(LegalResultsService.name);

  constructor(
    private readonly entityResolver: EntityResolverService,
    private readonly searchQueue: SearchQueueService,
  ) {}

  /**
   * Search for legal cases involving the given entity.
   */
  async search(request: LegalResultsRequestDto): Promise<LegalResultsResponseDto> {
    const criteria = this.entityResolver.resolve(request);

    if (criteria.names.length === 0) {
      return {
        results: [],
        meta: { namesSearched: 0, returned: 0, truncated: false },
      };
    }

    try {
      const jobResult = await this.searchQueue.enqueueAndWait(criteria);
      const sorted = this.sortCases(jobResult.cases);

      return {
        results: sorted.map((c) => ({
          docket: c.docket,
          court: c.court,
          title: c.title,
          dateFiled: c.dateFiled,
          link: c.link,
          resultType: c.resultType,
        })),
        meta: {
          namesSearched: jobResult.namesSearched,
          returned: sorted.length,
          truncated: jobResult.truncated,
        },
      };
    } catch (error: unknown) {
      if (isSearchJobFailedError(error)) {
        this.logger.error(
          `Search failed for entityId=${request.entityId}: ${error.message}`,
        );
        throw new ServiceUnavailableException(
          'Legal data provider temporarily unavailable',
        );
      }
      throw error;
    }
  }

  /**
   * Sort cases: court priority (FEDERAL > STATE > COUNTY > UNCATEGORIZED),
   * then dateFiled descending within each bucket.
   * Missing / unparseable dates go last within their court-priority bucket.
   */
  sortCases(cases: LegalCase[]): LegalCase[] {
    return [...cases].sort((a, b) => {
      const courtDiff = courtTypePriority(a.courtType) - courtTypePriority(b.courtType);
      if (courtDiff !== 0) {
        return courtDiff;
      }
      return compareDatesDesc(a.dateFiled, b.dateFiled);
    });
  }
}

/**
 * Compare ISO dates descending; nulls sort last.
 */
function compareDatesDesc(a: string | null, b: string | null): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  // ISO YYYY-MM-DD compares lexicographically
  if (a === b) {
    return 0;
  }
  return a < b ? 1 : -1;
}

/**
 * Re-export CourtType for tests that assert sort buckets.
 */
export type { CourtType };
