import { DocketAlarmProvider } from './docket-alarm.provider';
import { DocketAlarmHttpClient } from './docket-alarm-http.client';
import { SearchCriteria } from '../interfaces/legal-data-provider.interface';

function makeCriteria(overrides: Partial<SearchCriteria> = {}): SearchCriteria {
  return {
    entityId: 99,
    entityType: 'Person',
    names: [
      { full: 'Christopher Brien', confidence: 1 },
      { full: 'Chris Brien', confidence: 0.7 },
    ],
    states: ['NY'],
    dateFrom: '2016-01-01',
    dateTo: '2026-01-01',
    maxResults: 250,
    ...overrides,
  };
}

function makeResult(
  court: string,
  docket: string,
  dateFiled = '01/01/2023',
): {
  court: string;
  docket: string;
  title: string;
  link: string;
  date_filed: string;
  result_type: string;
} {
  return {
    court,
    docket,
    title: `${docket} title`,
    link: `https://example.com/${docket}`,
    date_filed: dateFiled,
    result_type: 'docket',
  };
}

describe('DocketAlarmProvider', () => {
  let httpClient: jest.Mocked<Pick<DocketAlarmHttpClient, 'search'>>;
  let provider: DocketAlarmProvider;

  beforeEach(() => {
    httpClient = {
      search: jest.fn(),
    };
    provider = new DocketAlarmProvider(httpClient as unknown as DocketAlarmHttpClient);
  });

  it('fans out to aliases when primary is under budget', async () => {
    httpClient.search.mockImplementation(({ q, limit }) => {
      if (q.includes('Christopher Brien')) {
        if (limit === 1) {
          return Promise.resolve({
            count: 2,
            results: [makeResult('Florida Middle District Court', 'A')],
          });
        }
        return Promise.resolve({
          count: 2,
          results: [
            makeResult('Florida Middle District Court', 'A'),
            makeResult('Connecticut State, Superior Court', 'B'),
          ],
        });
      }
      if (q.includes('Chris Brien')) {
        if (limit === 1) {
          return Promise.resolve({
            count: 1,
            results: [makeResult('Nevada Bankruptcy Court', 'C')],
          });
        }
        return Promise.resolve({
          count: 1,
          results: [makeResult('Nevada Bankruptcy Court', 'C')],
        });
      }
      return Promise.resolve({ count: 0, results: [] });
    });

    const result = await provider.search(makeCriteria());
    expect(result.namesSearched).toBe(2);
    expect(result.cases).toHaveLength(3);
    expect(result.truncated).toBe(false);
  });

  it('stops alias fan-out once the global 250 cap is filled by primary', async () => {
    const primaryResults = Array.from({ length: 50 }, (_, i) =>
      makeResult('Florida Middle District Court', `P-${i}`),
    );

    httpClient.search.mockImplementation(({ q, limit, offset }) => {
      if (q.includes('Christopher Brien')) {
        if (limit === 1) {
          return Promise.resolve({ count: 250, results: [primaryResults[0]!] });
        }
        const start = offset;
        return Promise.resolve({
          count: 250,
          results: primaryResults.slice(start, start + limit),
        });
      }
      return Promise.reject(
        new Error('Alias should not be queried when primary fills the cap'),
      );
    });

    const result = await provider.search(makeCriteria({ maxResults: 50 }));
    expect(result.namesSearched).toBe(1);
    expect(result.cases).toHaveLength(50);
    expect(result.truncated).toBe(true);
  });

  it('narrows person queries with state filter when count exceeds 250', async () => {
    const calls: string[] = [];
    httpClient.search.mockImplementation(({ q, limit }) => {
      calls.push(q);
      const hasCourt = q.includes('court:');
      if (limit === 1) {
        return Promise.resolve({
          count: hasCourt ? 10 : 1000,
          results: [makeResult('Florida Middle District Court', 'X')],
        });
      }
      return Promise.resolve({
        count: 10,
        results: [makeResult('Florida Middle District Court', 'X')],
      });
    });

    const result = await provider.search(
      makeCriteria({
        names: [{ full: 'Someone Famous', confidence: 1 }],
        states: ['NY'],
      }),
    );

    expect(calls.some((q) => !q.includes('court:'))).toBe(true);
    expect(calls.some((q) => q.includes('court:(NY)'))).toBe(true);
    expect(result.cases).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });

  it('deduplicates identical cases returned under multiple names', async () => {
    httpClient.search.mockImplementation(({ limit }) => {
      const shared = makeResult('Florida Middle District Court', 'SHARED');
      if (limit === 1) {
        return Promise.resolve({ count: 1, results: [shared] });
      }
      return Promise.resolve({ count: 1, results: [shared] });
    });

    const result = await provider.search(makeCriteria());
    expect(result.cases).toHaveLength(1);
    expect(result.namesSearched).toBe(2);
  });

  it('marks truncated when narrowing is exhausted and count remains over 250', async () => {
    httpClient.search.mockImplementation(({ limit, offset }) => {
      if (limit === 1) {
        return Promise.resolve({
          count: 1000,
          results: [makeResult('Florida Middle District Court', 'T-0')],
        });
      }
      const page = Array.from({ length: limit }, (_, i) =>
        makeResult('Florida Middle District Court', `T-${offset + i}`),
      );
      return Promise.resolve({ count: 1000, results: page });
    });

    const result = await provider.search(
      makeCriteria({
        names: [{ full: 'Common Name', confidence: 1 }],
        states: [],
        maxResults: 50,
      }),
    );

    expect(result.truncated).toBe(true);
    expect(result.cases).toHaveLength(50);
  });
});
