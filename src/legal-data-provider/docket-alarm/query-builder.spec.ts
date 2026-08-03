import {
  buildSearchQuery,
  escapeQueryValue,
  fromDocketAlarmDate,
  toDocketAlarmDate,
} from './query-builder';
import { SearchCriteria } from '../interfaces/legal-data-provider.interface';

const baseCriteria: SearchCriteria = {
  entityId: 1,
  entityType: 'Person',
  names: [{ full: 'Bradley Friedman', confidence: 0.9 }],
  states: ['FL'],
  dateFrom: '2016-01-01',
  dateTo: '2026-01-01',
  maxResults: 250,
};

describe('query-builder', () => {
  it('builds a base party + is:docket + date query', () => {
    const q = buildSearchQuery(baseCriteria, {
      name: 'Bradley Friedman',
      includeCompanyType: false,
      includeStateFilter: false,
    });
    expect(q).toContain('party:(name:("Bradley Friedman"))');
    expect(q).toContain('is:docket');
    expect(q).toContain('from:01/01/2016');
    expect(q).toContain('to:01/01/2026');
    expect(q).not.toContain('court:');
  });

  it('adds OR-combined court filters when includeStateFilter is true', () => {
    const criteria: SearchCriteria = {
      ...baseCriteria,
      states: ['ID', 'UT', 'MO', 'AZ'],
    };
    const q = buildSearchQuery(criteria, {
      name: 'Robert Gilbert',
      includeCompanyType: false,
      includeStateFilter: true,
    });
    expect(q).toContain('court:(ID)');
    expect(q).toContain('court:(UT)');
    expect(q).toContain(' OR ');
  });

  it('appends company type when includeCompanyType is true', () => {
    const criteria: SearchCriteria = {
      ...baseCriteria,
      entityType: 'Company',
      names: [{ full: 'Westlake Services', confidence: 1, type: 'LLC' }],
      states: [],
      companyType: 'LLC',
    };
    const q = buildSearchQuery(criteria, {
      name: 'Westlake Services',
      includeCompanyType: true,
      includeStateFilter: false,
    });
    expect(q).toContain('Westlake Services LLC');
  });

  it('converts dates to and from DocketAlarm format', () => {
    expect(toDocketAlarmDate('2023-05-12')).toBe('05/12/2023');
    expect(fromDocketAlarmDate('5/12/2023')).toBe('2023-05-12');
    expect(fromDocketAlarmDate('02/31/2020')).toBeNull();
    expect(fromDocketAlarmDate('')).toBeNull();
    expect(fromDocketAlarmDate(null)).toBeNull();
  });

  it('escapes multi-word query values', () => {
    expect(escapeQueryValue('John Smith')).toBe('"John Smith"');
    expect(escapeQueryValue('Uber')).toBe('Uber');
  });
});
