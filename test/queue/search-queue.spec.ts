import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import configuration from '../../src/config/configuration';
import {
  LEGAL_DATA_PROVIDER,
  LegalDataProviderPort,
  LegalSearchResult,
  SearchCriteria,
} from '../../src/legal-data-provider/interfaces/legal-data-provider.interface';
import { SearchQueueModule } from '../../src/search-queue/search-queue.module';
import { SearchQueueService } from '../../src/search-queue/search-queue.service';
import { SEARCH_QUEUE_NAME } from '../../src/search-queue/search-queue.constants';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

function makeCriteria(suffix: string): SearchCriteria {
  return {
    entityId: 1,
    entityType: 'Person',
    names: [{ full: `Test Person ${suffix}`, confidence: 1 }],
    states: ['NY'],
    dateFrom: '2016-01-01',
    dateTo: '2026-01-01',
    maxResults: 250,
  };
}

describe('SearchQueueService (real Redis)', () => {
  let app: INestApplication;
  let searchQueueService: SearchQueueService;
  let queue: Queue;
  let providerCalls: number;
  let failTimes: number;
  let callCountForFailing: number;
  /**
   * Mutable strategy invoked by the DI-injected provider.
   * Prefer this over Object.assign so every Worker call always goes through
   * the same providerImpl.search wrapper.
   */
  let searchBehavior: (criteria: SearchCriteria) => Promise<LegalSearchResult>;

  const defaultBehavior = async (
    criteria: SearchCriteria,
  ): Promise<LegalSearchResult> => {
    providerCalls += 1;
    // Artificial delay so concurrent callers join the same in-flight job
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      cases: [
        {
          docket: `D-${criteria.names[0]?.full ?? 'x'}`,
          court: 'Florida Middle District Court',
          title: 'Test Case',
          dateFiled: '2023-01-01',
          link: 'https://example.com',
          resultType: 'docket',
          courtType: 'FEDERAL',
        },
      ],
      namesSearched: 1,
      truncated: false,
    };
  };

  beforeAll(async () => {
    const probe = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      lazyConnect: true,
    });
    try {
      await probe.connect();
      await probe.ping();
    } catch {
      await probe.quit().catch(() => undefined);
      throw new Error(
        `Redis is required for queue tests but is unreachable at ${REDIS_URL}. ` +
          'Run: docker compose up -d redis',
      );
    } finally {
      probe.disconnect();
    }

    providerCalls = 0;
    failTimes = 0;
    callCountForFailing = 0;
    searchBehavior = defaultBehavior;

    const providerImpl: LegalDataProviderPort = {
      search: (criteria: SearchCriteria): Promise<LegalSearchResult> =>
        searchBehavior(criteria),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
          ignoreEnvFile: true,
        }),
        SearchQueueModule,
      ],
    })
      .overrideProvider(LEGAL_DATA_PROVIDER)
      .useValue(providerImpl)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    searchQueueService = app.get(SearchQueueService);
    queue = app.get<Queue>(getQueueToken(SEARCH_QUEUE_NAME));
  });

  afterAll(async () => {
    if (queue !== undefined) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
    if (app !== undefined) {
      await app.close();
    }
  });

  beforeEach(async () => {
    providerCalls = 0;
    callCountForFailing = 0;
    failTimes = 0;
    searchBehavior = defaultBehavior;
    await queue.obliterate({ force: true }).catch(() => undefined);
  });

  it('coalesces parallel duplicate requests into a single provider call', async () => {
    const criteria = makeCriteria(`dup-${Date.now()}`);

    const [a, b, c] = await Promise.all([
      searchQueueService.enqueueAndWait(criteria),
      searchQueueService.enqueueAndWait(criteria),
      searchQueueService.enqueueAndWait(criteria),
    ]);

    expect(providerCalls).toBe(1);
    expect(a.cases).toEqual(b.cases);
    expect(b.cases).toEqual(c.cases);
  });

  it('serves cached results within RESULT_CACHE_TTL_SECONDS without a new provider call', async () => {
    const criteria = makeCriteria(`cache-${Date.now()}`);

    const first = await searchQueueService.enqueueAndWait(criteria);
    expect(providerCalls).toBe(1);

    const second = await searchQueueService.enqueueAndWait(criteria);
    expect(providerCalls).toBe(1);
    expect(second).toEqual(first);
  });

  it('retries on transient failures then succeeds', async () => {
    failTimes = 2;
    callCountForFailing = 0;

    searchBehavior = (_criteria: SearchCriteria): Promise<LegalSearchResult> => {
      callCountForFailing += 1;
      providerCalls += 1;
      if (callCountForFailing <= failTimes) {
        return Promise.reject(new Error('transient upstream failure'));
      }
      return Promise.resolve({
        cases: [
          {
            docket: 'OK',
            court: 'Florida Middle District Court',
            title: 'Recovered',
            dateFiled: '2023-01-01',
            link: 'https://example.com',
            resultType: 'docket',
            courtType: 'FEDERAL',
          },
        ],
        namesSearched: 1,
        truncated: false,
      });
    };

    const criteria = makeCriteria(`retry-${Date.now()}`);
    const result = await searchQueueService.enqueueAndWait(criteria);

    expect(result.cases[0]?.docket).toBe('OK');
    expect(callCountForFailing).toBe(3);
  });

  it('exhausts attempts and surfaces failure to all waiters', async () => {
    searchBehavior = (_criteria: SearchCriteria): Promise<LegalSearchResult> => {
      providerCalls += 1;
      return Promise.reject(new Error('permanent failure'));
    };

    const criteria = makeCriteria(`fail-${Date.now()}`);

    await expect(searchQueueService.enqueueAndWait(criteria)).rejects.toThrow();
    expect(providerCalls).toBeGreaterThanOrEqual(3);
  });
});
