import { CourtType } from '../interfaces/legal-data-provider.interface';

/**
 * Derive a court-authority bucket from a DocketAlarm `court` string.
 *
 * DocketAlarm search results do not include an explicit court-type field,
 * so classification is a best-effort heuristic verified against the assignment's
 * seven examples. Unrecognized courts fall back to UNCATEGORIZED.
 *
 * Rule order (important — rule 1 must precede rule 2 so that
 * "Pennsylvania State, Magisterial District Court, Chester County" is COUNTY,
 * not FEDERAL):
 * 1. Contains "State," → COUNTY if also contains "County", else STATE
 * 2. Contains "District Court" | "Court of Appeals" | "Bankruptcy Court" | "Circuit" → FEDERAL
 * 3. Else → UNCATEGORIZED
 */
export function classifyCourt(court: string): CourtType {
  const value = court.trim();

  if (value.includes('State,')) {
    return value.includes('County') ? 'COUNTY' : 'STATE';
  }

  if (
    value.includes('District Court') ||
    value.includes('Court of Appeals') ||
    value.includes('Bankruptcy Court') ||
    value.includes('Circuit')
  ) {
    return 'FEDERAL';
  }

  return 'UNCATEGORIZED';
}

/**
 * Numeric priority for sorting: lower number = higher authority.
 * FEDERAL (0) > STATE (1) > COUNTY (2) > UNCATEGORIZED (3).
 */
export function courtTypePriority(courtType: CourtType): number {
  switch (courtType) {
    case 'FEDERAL':
      return 0;
    case 'STATE':
      return 1;
    case 'COUNTY':
      return 2;
    case 'UNCATEGORIZED':
      return 3;
  }
}
