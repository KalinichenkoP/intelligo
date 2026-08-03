/**
 * Lookup tables for parsing US state names and abbreviations from free-text addresses.
 */

/** Two-letter US state / DC abbreviations keyed by lowercase full name. */
export const US_STATE_NAME_TO_CODE: Readonly<Record<string, string>> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

/** Valid two-letter US state / DC codes. */
export const US_STATE_CODES: ReadonlySet<string> = new Set(
  Object.values(US_STATE_NAME_TO_CODE),
);

/**
 * Extract a US state code from a free-text address string.
 *
 * Handles:
 * - Bare state names: "Idaho", "New York"
 * - State + country: "Arizona, United States"
 * - Full street addresses with ZIP: "1301 Florida Mall Avenue. Orlando, FL 32809"
 * - Abbreviated state without ZIP: "1200 NW 6th AVENUE, MIAMI, FL"
 *
 * @returns Two-letter state code, or null when no US state can be identified.
 */
export function extractUsState(address: string): string | null {
  const normalized = address.trim();
  if (normalized.length === 0) {
    return null;
  }

  // Bare / near-bare state name (optionally followed by ", United States")
  const bareMatch = normalized.match(
    /^([A-Za-z][A-Za-z\s]+?)(?:\s*,\s*United States)?$/i,
  );
  if (bareMatch?.[1] !== undefined) {
    const nameKey = bareMatch[1].trim().toLowerCase();
    const fromName = US_STATE_NAME_TO_CODE[nameKey];
    if (fromName !== undefined) {
      return fromName;
    }
    const upper = bareMatch[1].trim().toUpperCase();
    if (US_STATE_CODES.has(upper)) {
      return upper;
    }
  }

  // Abbreviation before ZIP: ", FL 32809" or ", FL," or trailing ", FL"
  const abbrWithZip = normalized.match(/,\s*([A-Za-z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
  if (abbrWithZip?.[1] !== undefined) {
    const code = abbrWithZip[1].toUpperCase();
    if (US_STATE_CODES.has(code)) {
      return code;
    }
  }

  // Full state name embedded near the end of the address
  const lower = normalized.toLowerCase();
  // Prefer longer names first (e.g. "new york" before "york" if it existed)
  const namesByLength = Object.keys(US_STATE_NAME_TO_CODE).sort(
    (a, b) => b.length - a.length,
  );
  for (const name of namesByLength) {
    const code = US_STATE_NAME_TO_CODE[name];
    if (code === undefined) {
      continue;
    }
    // Word-boundary-ish match to avoid matching "Washington" inside longer tokens poorly
    const pattern = new RegExp(`(?:^|[\\s,])${escapeRegex(name)}(?:[\\s,]|$)`, 'i');
    if (pattern.test(lower)) {
      return code;
    }
  }

  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
