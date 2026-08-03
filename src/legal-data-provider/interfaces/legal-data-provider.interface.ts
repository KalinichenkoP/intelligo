/**
 * Entity type supported by the legal-results API.
 */
export type EntityType = 'Person' | 'Company';

/**
 * Court authority bucket used for priority sorting.
 * FEDERAL > STATE > COUNTY > UNCATEGORIZED.
 */
export type CourtType = 'FEDERAL' | 'STATE' | 'COUNTY' | 'UNCATEGORIZED';

/**
 * A single name (or alias) candidate used when searching for an entity.
 */
export interface NameCandidate {
  /** Full display name as provided by the caller. */
  full: string;
  /** Confidence score in [0, 1]. Higher values are searched first. */
  confidence: number;
  /** Optional company type (e.g. "LLC") — only meaningful for Company entities. */
  type?: string;
}

/**
 * Provider-agnostic search criteria produced by EntityResolverService.
 * Downstream providers must not assume DocketAlarm-specific field names.
 */
export interface SearchCriteria {
  entityId: number;
  entityType: EntityType;
  /**
   * Confidence-ordered list of names to search.
   * Index 0 is always the primary (highest-confidence) name.
   * Remaining entries are aliases that already passed ALIAS_MIN_CONFIDENCE / MAX_ALIAS_NAMES.
   */
  names: NameCandidate[];
  /**
   * US state codes derived from address data (Person only).
   * Empty when no usable address/state can be parsed.
   * Multiple states are OR-combined when narrowing.
   */
  states: string[];
  /**
   * Company type taken from the primary name entry (Company only).
   */
  companyType?: string;
  /**
   * Inclusive lower bound for filing date (ISO YYYY-MM-DD).
   * Spec requires cases from the last 10 years.
   */
  dateFrom: string;
  /**
   * Inclusive upper bound for filing date (ISO YYYY-MM-DD).
   */
  dateTo: string;
  /**
   * Hard cap on the final combined result set (spec: 250).
   */
  maxResults: number;
}

/**
 * A single legal case in the generic domain model.
 * Independent of any particular data provider's response shape.
 */
export interface LegalCase {
  docket: string;
  court: string;
  title: string;
  /**
   * Filing date in ISO 8601 (YYYY-MM-DD), or null when missing/unparseable.
   */
  dateFiled: string | null;
  link: string;
  resultType: 'docket' | 'document';
  /**
   * Derived court-authority bucket used for priority sorting.
   */
  courtType: CourtType;
}

/**
 * Result of a provider search, including operational metadata.
 */
export interface LegalSearchResult {
  cases: LegalCase[];
  /** How many of the entity's names were actually queried. */
  namesSearched: number;
  /**
   * True when any searched name's own query exceeded the 250-result budget
   * or remaining aliases were skipped because the global cap was already reached.
   */
  truncated: boolean;
}

/**
 * Port that every legal data provider must implement.
 * DocketAlarm is the first adapter; additional providers can be registered later
 * without changing controllers or DTOs.
 */
export interface LegalDataProviderPort {
  /**
   * Search for legal cases matching the given criteria.
   * Implementations must respect `criteria.maxResults` and return cases
   * already deduplicated by (court, docket). Sorting is the caller's responsibility.
   */
  search(criteria: SearchCriteria): Promise<LegalSearchResult>;
}

/**
 * Injection token for LegalDataProviderPort.
 */
export const LEGAL_DATA_PROVIDER = Symbol('LEGAL_DATA_PROVIDER');
