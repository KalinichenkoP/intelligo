import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { LegalResultsRequestDto } from './dto/legal-results-request.dto';
import {
  NameCandidate,
  SearchCriteria,
} from '../legal-data-provider/interfaces/legal-data-provider.interface';
import { extractUsState } from '../legal-data-provider/docket-alarm/us-state.util';

/** Spec-mandated hard cap on returned legal cases. */
export const MAX_LEGAL_RESULTS = 250;

/** Spec-mandated lookback window for filing dates. */
export const LOOKBACK_YEARS = 10;

/**
 * Converts a public API request into provider-agnostic SearchCriteria.
 *
 * Responsibilities:
 * - Rank names by confidence (primary = highest)
 * - Filter aliases by ALIAS_MIN_CONFIDENCE / MAX_ALIAS_NAMES
 * - Parse US states from addresses (OR-combine on confidence ties)
 * - Compute the last-10-years date window
 */
@Injectable()
export class EntityResolverService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  /**
   * Resolve the inbound DTO into SearchCriteria for the legal data provider.
   */
  resolve(request: LegalResultsRequestDto): SearchCriteria {
    const aliasConfig = this.configService.get('aliases', { infer: true });
    const names = this.resolveNames(
      request.entityDetails.name,
      aliasConfig.minConfidence,
      aliasConfig.maxNames,
    );

    const states =
      request.entityType === 'Person'
        ? this.resolveStates(request.entityDetails.address ?? [])
        : [];

    const companyType = request.entityType === 'Company' ? names[0]?.type : undefined;

    const { dateFrom, dateTo } = this.resolveDateRange();

    return {
      entityId: request.entityId,
      entityType: request.entityType,
      names,
      states,
      companyType,
      dateFrom,
      dateTo,
      maxResults: MAX_LEGAL_RESULTS,
    };
  }

  /**
   * Build the confidence-ordered name list.
   * Primary name is always included; aliases are gated by confidence floor and max count.
   */
  private resolveNames(
    names: ReadonlyArray<{ full: string; confidence: number; type?: string }>,
    minConfidence: number,
    maxAliasNames: number,
  ): NameCandidate[] {
    const sorted = [...names]
      .map((n): NameCandidate => ({
        full: n.full.trim(),
        confidence: n.confidence,
        type: n.type,
      }))
      .filter((n) => n.full.length > 0)
      .sort((a, b) => b.confidence - a.confidence);

    if (sorted.length === 0) {
      return [];
    }

    const primary = sorted[0];
    if (primary === undefined) {
      return [];
    }

    const aliases = sorted
      .slice(1)
      .filter((n) => n.confidence >= minConfidence)
      .slice(0, maxAliasNames);

    return [primary, ...aliases];
  }

  /**
   * Parse states from addresses.
   *
   * Tie-break: when multiple addresses share the maximum confidence,
   * combine all of their states with OR rather than arbitrarily picking one
   * (documented assumption — see Robert Gilbert sample).
   */
  private resolveStates(
    addresses: ReadonlyArray<{ full: string; confidence: number }>,
  ): string[] {
    if (addresses.length === 0) {
      return [];
    }

    const maxConfidence = Math.max(...addresses.map((a) => a.confidence));
    const topAddresses = addresses.filter((a) => a.confidence === maxConfidence);

    const states = new Set<string>();
    for (const address of topAddresses) {
      const state = extractUsState(address.full);
      if (state !== null) {
        states.add(state);
      }
    }

    return [...states].sort();
  }

  /**
   * Compute an inclusive last-10-years date window ending today (UTC).
   */
  private resolveDateRange(): { dateFrom: string; dateTo: string } {
    const now = new Date();
    const dateTo = this.formatIsoDate(now);
    const from = new Date(
      Date.UTC(
        now.getUTCFullYear() - LOOKBACK_YEARS,
        now.getUTCMonth(),
        now.getUTCDate(),
      ),
    );
    const dateFrom = this.formatIsoDate(from);
    return { dateFrom, dateTo };
  }

  private formatIsoDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
