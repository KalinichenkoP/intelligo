import { extractUsState } from './us-state.util';

describe('extractUsState', () => {
  it('parses bare state names', () => {
    expect(extractUsState('Idaho')).toBe('ID');
    expect(extractUsState('New York')).toBe('NY');
    expect(extractUsState('Arizona, United States')).toBe('AZ');
  });

  it('parses street addresses with state abbreviation and ZIP', () => {
    expect(extractUsState('1301 Florida Mall Avenue. Orlando, FL 32809')).toBe('FL');
    expect(extractUsState('4751 Wilshire Blvd. Suite 100. Los Angeles, CA 90010')).toBe(
      'CA',
    );
  });

  it('parses addresses with abbreviation and no ZIP', () => {
    expect(extractUsState('1200 NW 6th AVENUE, MIAMI, FL')).toBe('FL');
  });

  it('returns null for unrecognizable input', () => {
    expect(extractUsState('')).toBeNull();
    expect(extractUsState('Somewhere overseas')).toBeNull();
  });
});
