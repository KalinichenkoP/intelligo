import { SearchCriteria } from '../interfaces/legal-data-provider.interface';

/**
 * Options controlling how a DocketAlarm search query is built / narrowed.
 */
export interface QueryBuildOptions {
  /** Name text to search as a party. */
  name: string;
  /** When true, append company type to the party name text. */
  includeCompanyType: boolean;
  /** When true, add court/state filters for Person entities. */
  includeStateFilter: boolean;
}

/**
 * Build a DocketAlarm `search/` query string (`q` parameter).
 *
 * Query language patterns (from DocketAlarm docs):
 * - `party:(name:(...))` — party name match
 * - `is:docket` — dockets only (not documents)
 * - `from:mm/dd/yyyy to:mm/dd/yyyy` — filing date window
 * - `court:(...)` — court / jurisdiction filter
 *
 * Narrowing is applied incrementally by the provider: start broad, then
 * enable `includeStateFilter` / `includeCompanyType` when count > 250.
 */
export function buildSearchQuery(
  criteria: SearchCriteria,
  options: QueryBuildOptions,
): string {
  const partyName = buildPartyName(criteria, options);
  const parts: string[] = [
    `party:(name:(${escapeQueryValue(partyName)}))`,
    'is:docket',
    `from:${toDocketAlarmDate(criteria.dateFrom)}`,
    `to:${toDocketAlarmDate(criteria.dateTo)}`,
  ];

  if (options.includeStateFilter && criteria.states.length > 0) {
    const courtClauses = criteria.states
      .map((state) => `court:(${escapeQueryValue(state)})`)
      .join(' OR ');
    parts.push(`(${courtClauses})`);
  }

  return parts.join(' ');
}

function buildPartyName(criteria: SearchCriteria, options: QueryBuildOptions): string {
  if (
    options.includeCompanyType &&
    criteria.companyType !== undefined &&
    criteria.companyType.trim().length > 0
  ) {
    return `${options.name} ${criteria.companyType.trim()}`;
  }
  return options.name;
}

/**
 * Escape characters that have special meaning in DocketAlarm query syntax.
 * Quotes wrap multi-word values; internal quotes are escaped.
 */
export function escapeQueryValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes(' ') || trimmed.includes(':') || trimmed.includes('(')) {
    return `"${trimmed.replace(/"/g, '\\"')}"`;
  }
  return trimmed;
}

/**
 * Convert ISO YYYY-MM-DD to DocketAlarm's mm/dd/yyyy date format.
 */
export function toDocketAlarmDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  return `${month}/${day}/${year}`;
}

/**
 * Convert DocketAlarm's mm/dd/yyyy (or similar) to ISO YYYY-MM-DD.
 * Returns null when the date is missing or unreadable.
 */
export function fromDocketAlarmDate(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match === null) {
    return null;
  }

  const month = match[1];
  const day = match[2];
  const year = match[3];
  if (month === undefined || day === undefined || year === undefined) {
    return null;
  }

  const mm = month.padStart(2, '0');
  const dd = day.padStart(2, '0');
  const iso = `${year}-${mm}-${dd}`;

  // Validate the date is real (e.g. reject 02/31/2020)
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return iso;
}
