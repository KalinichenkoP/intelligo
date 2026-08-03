import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import nock from 'nock';
import request from 'supertest';
import { App } from 'supertest/types';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { SEARCH_QUEUE_NAME } from '../src/search-queue/search-queue.constants';
import sampleEntities from './fixtures/sample-entities.json';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const DA_BASE = 'https://www.docketalarm.com/api/v1';

interface SampleEntity {
  entityId: number;
  entityType: 'Person' | 'Company';
  entityDetails: {
    name: Array<{ full: string; confidence: number; type?: string }>;
    address?: Array<{ full: string; confidence: number }>;
  };
}

const entities = sampleEntities as SampleEntity[];

function requireEntity(index: number): SampleEntity {
  const entity = entities[index];
  if (entity === undefined) {
    throw new Error(`Missing sample entity at index ${index}`);
  }
  return entity;
}

describe('LegalResultsController (e2e)', () => {
  let app: INestApplication;
  let queue: Queue;

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
      throw new Error(
        `Redis is required for e2e tests but is unreachable at ${REDIS_URL}. ` +
          'Run: docker compose up -d redis',
      );
    } finally {
      probe.disconnect();
    }

    process.env.DOCKET_ALARM_USERNAME = 'test@example.com';
    process.env.DOCKET_ALARM_PASSWORD = 'test-password';
    process.env.DOCKET_ALARM_BASE_URL = DA_BASE;
    process.env.REDIS_URL = REDIS_URL;
    process.env.RESULT_CACHE_TTL_SECONDS = '5';
    process.env.JOB_WAIT_TIMEOUT_MS = '20000';
    process.env.DOCKET_ALARM_RETRY_ATTEMPTS = '2';
    process.env.DOCKET_ALARM_RETRY_BACKOFF_MS = '100';

    nock.disableNetConnect();
    nock.enableNetConnect(
      (host) => host.includes('127.0.0.1') || host.includes('localhost'),
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    queue = app.get<Queue>(getQueueToken(SEARCH_QUEUE_NAME));
  });

  afterAll(async () => {
    nock.enableNetConnect();
    nock.cleanAll();
    if (queue !== undefined) {
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
    }
    if (app !== undefined) {
      await app.close();
    }
  });

  beforeEach(async () => {
    nock.cleanAll();
    await queue.obliterate({ force: true }).catch(() => undefined);

    nock(DA_BASE)
      .persist()
      .post('/login/')
      .reply(200, { success: true, login_token: 'test-token-abc' });
  });

  function mockSearchPages(
    predicate: (q: string) => boolean,
    results: Array<{
      court: string;
      docket: string;
      title: string;
      date_filed: string;
    }>,
  ): void {
    nock(DA_BASE)
      .persist()
      .get('/search/')
      .query((query) => typeof query.q === 'string' && predicate(query.q))
      .reply(200, (uri: string) => {
        const url = new URL(uri, DA_BASE);
        const limit = Number(url.searchParams.get('limit') ?? '50');
        const offset = Number(url.searchParams.get('offset') ?? '0');
        const page = results.slice(offset, offset + limit);
        return {
          success: true,
          count: results.length,
          search_results: page.map((r) => ({
            result_type: 'docket',
            court: r.court,
            docket: r.docket,
            title: r.title,
            link: `https://www.docketalarm.com/${r.docket}`,
            date_filed: r.date_filed,
          })),
        };
      });
  }

  it('returns 400 for invalid body', async () => {
    const res = await request(app.getHttpServer() as App)
      .post('/api/v1/legal_results')
      .send({ entityId: 'not-a-number' })
      .expect(400);

    expect(res.body).toHaveProperty('statusCode', 400);
    expect(res.body).toHaveProperty('correlationId');
  });

  it('searches Bradley Friedman with alias fan-out and FL state narrowing path', async () => {
    mockSearchPages(
      (q) => q.includes('Bradley Friedman'),
      [
        {
          court: 'Florida Middle District Court',
          docket: 'BF-1',
          title: 'Case BF-1',
          date_filed: '01/15/2023',
        },
        {
          court: 'Connecticut State, Superior Court',
          docket: 'BF-2',
          title: 'Case BF-2',
          date_filed: '06/01/2022',
        },
      ],
    );
    mockSearchPages(
      (q) => q.includes('Brad Gof Friedman'),
      [
        {
          court: 'Nevada Bankruptcy Court',
          docket: 'BF-3',
          title: 'Case BF-3',
          date_filed: '03/01/2024',
        },
      ],
    );

    const bradley = requireEntity(0);
    const res = await request(app.getHttpServer() as App)
      .post('/api/v1/legal_results')
      .send({
        entityId: bradley.entityId,
        entityType: bradley.entityType,
        entityDetails: bradley.entityDetails,
      })
      .expect(200);

    const body = res.body as {
      results: Array<{ court: string }>;
      meta: { namesSearched: number; returned: number; truncated: boolean };
    };
    expect(body.meta.namesSearched).toBe(2);
    expect(body.results.length).toBe(3);
    // FEDERAL before STATE
    expect(body.results[0]?.court).toMatch(/District Court|Bankruptcy/);
  });

  it('sorts mixed court types by priority then date', async () => {
    mockSearchPages(
      () => true,
      [
        {
          court: 'United States Tax Court',
          docket: 'U-1',
          title: 'Tax',
          date_filed: '01/01/2024',
        },
        {
          court: 'Ohio State, Hamilton County, Court of Common Pleas',
          docket: 'C-1',
          title: 'County',
          date_filed: '01/01/2024',
        },
        {
          court: 'Florida Middle District Court',
          docket: 'F-1',
          title: 'Federal old',
          date_filed: '01/01/2020',
        },
        {
          court: 'Florida Middle District Court',
          docket: 'F-2',
          title: 'Federal new',
          date_filed: '01/01/2023',
        },
        {
          court: 'Connecticut State, Superior Court',
          docket: 'S-1',
          title: 'State',
          date_filed: '01/01/2022',
        },
      ],
    );

    const goldman = requireEntity(3);
    const res = await request(app.getHttpServer() as App)
      .post('/api/v1/legal_results')
      .send({
        entityId: goldman.entityId,
        entityType: goldman.entityType,
        entityDetails: goldman.entityDetails,
      })
      .expect(200);

    const body = res.body as {
      results: Array<{ docket: string; court: string }>;
      meta: { namesSearched: number; returned: number; truncated: boolean };
    };
    const dockets = body.results.map((r) => r.docket);
    expect(dockets).toEqual(['F-2', 'F-1', 'S-1', 'C-1', 'U-1']);
  });

  it('returns empty results when DocketAlarm finds nothing', async () => {
    nock(DA_BASE)
      .persist()
      .get('/search/')
      .query(true)
      .reply(200, { success: true, count: 0, search_results: [] });

    const westlake = requireEntity(2);
    const res = await request(app.getHttpServer() as App)
      .post('/api/v1/legal_results')
      .send({
        entityId: westlake.entityId,
        entityType: westlake.entityType,
        entityDetails: westlake.entityDetails,
      })
      .expect(200);

    const body = res.body as {
      results: unknown[];
      meta: { returned: number };
    };
    expect(body.results).toEqual([]);
    expect(body.meta.returned).toBe(0);
  });

  it('returns 503 when DocketAlarm login fails', async () => {
    nock.cleanAll();
    nock(DA_BASE)
      .persist()
      .post('/login/')
      .reply(200, { success: false, error: 'bad credentials' });

    const robert = requireEntity(1);
    await request(app.getHttpServer() as App)
      .post('/api/v1/legal_results')
      .send({
        entityId: robert.entityId,
        entityType: robert.entityType,
        entityDetails: robert.entityDetails,
      })
      .expect(503);
  });
});
