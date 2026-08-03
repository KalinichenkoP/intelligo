import { Injectable, Logger } from '@nestjs/common';
import {
  LegalCase,
  LegalDataProviderPort,
  LegalSearchResult,
  SearchCriteria,
} from '../interfaces/legal-data-provider.interface';
import { classifyCourt } from './court-classifier.util';
import { DocketAlarmHttpClient } from './docket-alarm-http.client';
import { fromDocketAlarmDate, buildSearchQuery } from './query-builder';

/** DocketAlarm search/ returns at most 50 results per page. */
const PAGE_SIZE = 50;

/**
 * DocketAlarm adapter implementing LegalDataProviderPort.
 *
 * Algorithm (per assignment):
 * 1. For each name (primary, then aliases) in confidence order:
 *    a. Probe count with a narrowable query
 *    b. If count > 250, apply next narrowing param (state / company type)
 *    c. Paginate results, merging into a global deduped pool
 *    d. Stop the entire fan-out the moment the pool reaches maxResults (250)
 * 2. Return cases + metadata (namesSearched, truncated)
 *
 * Sorting (court priority, then date) is done by LegalResultsService.
 */
@Injectable()
export class DocketAlarmProvider implements LegalDataProviderPort {
  private readonly logger = new Logger(DocketAlarmProvider.name);

  constructor(private readonly httpClient: DocketAlarmHttpClient) {}

  /**
   * Search DocketAlarm for cases matching the given criteria.
   */
  async search(criteria: SearchCriteria): Promise<LegalSearchResult> {
    const pool = new Map<string, LegalCase>();
    let namesSearched = 0;
    let truncated = false;

    for (const name of criteria.names) {
      if (pool.size >= criteria.maxResults) {
        truncated = true;
        break;
      }

      namesSearched += 1;
      const remaining = criteria.maxResults - pool.size;
      const nameResult = await this.searchSingleName(criteria, name.full, remaining);

      for (const legalCase of nameResult.cases) {
        const key = caseKey(legalCase.court, legalCase.docket);
        if (!pool.has(key)) {
          pool.set(key, legalCase);
        }
        if (pool.size >= criteria.maxResults) {
          break;
        }
      }

      if (nameResult.truncated) {
        truncated = true;
      }

      if (pool.size >= criteria.maxResults) {
        // Remaining aliases are skipped because the global cap is reached
        if (namesSearched < criteria.names.length) {
          truncated = true;
        }
        break;
      }
    }

    return {
      cases: [...pool.values()],
      namesSearched,
      truncated,
    };
  }

  /**
   * Narrow + fetch results for a single name candidate.
   */
  private async searchSingleName(
    criteria: SearchCriteria,
    name: string,
    maxToFetch: number,
  ): Promise<{ cases: LegalCase[]; truncated: boolean }> {
    const narrowingSteps = this.buildNarrowingSteps(criteria);

    let finalQuery = '';
    let finalCount = 0;
    let truncated = false;

    for (let i = 0; i < narrowingSteps.length; i += 1) {
      const step = narrowingSteps[i];
      if (step === undefined) {
        continue;
      }

      const query = buildSearchQuery(criteria, {
        name,
        includeCompanyType: step.includeCompanyType,
        includeStateFilter: step.includeStateFilter,
      });

      const probe = await this.httpClient.search({
        q: query,
        limit: 1,
        offset: 0,
      });

      finalQuery = query;
      finalCount = probe.count;

      if (probe.count <= criteria.maxResults) {
        break;
      }

      const isLastStep = i === narrowingSteps.length - 1;
      if (isLastStep) {
        // All narrowing params exhausted — fetch up to max and mark truncated
        truncated = true;
        this.logger.warn(
          `Query for "${name}" still has ${probe.count} results after narrowing; capping at ${maxToFetch}`,
        );
      }
    }

    const cases = await this.paginate(
      finalQuery,
      Math.min(finalCount, maxToFetch, criteria.maxResults),
    );

    return { cases, truncated };
  }

  /**
   * Build the ordered list of narrowing strategies for this entity type.
   * Always starts with date window only (already in base query), then adds
   * entity-specific filters.
   */
  private buildNarrowingSteps(
    criteria: SearchCriteria,
  ): Array<{ includeStateFilter: boolean; includeCompanyType: boolean }> {
    if (criteria.entityType === 'Person') {
      const steps: Array<{
        includeStateFilter: boolean;
        includeCompanyType: boolean;
      }> = [{ includeStateFilter: false, includeCompanyType: false }];
      if (criteria.states.length > 0) {
        steps.push({ includeStateFilter: true, includeCompanyType: false });
      }
      return steps;
    }

    const steps: Array<{
      includeStateFilter: boolean;
      includeCompanyType: boolean;
    }> = [{ includeStateFilter: false, includeCompanyType: false }];
    if (criteria.companyType !== undefined && criteria.companyType.trim().length > 0) {
      steps.push({ includeStateFilter: false, includeCompanyType: true });
    }
    return steps;
  }

  /**
   * Paginate through DocketAlarm search results up to `limit` items.
   * Uses limit=50 (API max) and stops early when enough results are collected.
   */
  private async paginate(query: string, limit: number): Promise<LegalCase[]> {
    if (limit <= 0) {
      return [];
    }

    const collected: LegalCase[] = [];
    let offset = 0;

    while (collected.length < limit) {
      const pageLimit = Math.min(PAGE_SIZE, limit - collected.length);
      // DocketAlarm constraint: offset + limit must be < 1000
      if (offset + pageLimit >= 1000) {
        break;
      }

      const page = await this.httpClient.search({
        q: query,
        limit: pageLimit,
        offset,
        order: '-date_filed',
      });

      if (page.results.length === 0) {
        break;
      }

      for (const item of page.results) {
        collected.push(this.mapResult(item));
        if (collected.length >= limit) {
          break;
        }
      }

      offset += page.results.length;
      if (page.results.length < pageLimit) {
        break;
      }
    }

    return collected;
  }

  private mapResult(item: {
    court: string;
    docket: string;
    title: string;
    link: string;
    date_filed: string;
    result_type: string;
  }): LegalCase {
    const resultType = item.result_type === 'document' ? 'document' : 'docket';
    return {
      court: item.court,
      docket: item.docket,
      title: item.title,
      link: item.link,
      dateFiled: fromDocketAlarmDate(item.date_filed),
      resultType,
      courtType: classifyCourt(item.court),
    };
  }
}

/**
 * Dedup key for the global result pool.
 *
 * Safe today because every query is scoped to `is:docket` (see query-builder.ts),
 * so a given docket appears at most once per court. If `is:docket` is ever relaxed
 * to include `document`-type results, multiple distinct documents under the same
 * docket/court would collapse into a single pool entry — a document identifier
 * would need to be folded into this key first. See ARCHITECTURE.md § Known limitations.
 */
function caseKey(court: string, docket: string): string {
  return `${court}::${docket}`;
}
