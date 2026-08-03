# Intelligo Legal Results API

Production-oriented NestJS service that exposes `POST /api/v1/legal_results` and acts as a **generic legal-data mediator**, with DocketAlarm as the first swappable provider adapter.

It is designed for scale: Redis-backed BullMQ single-flight deduplication, configurable outbound concurrency / rate limiting, alias fan-out with a hard 250-result cap, and court-priority + filing-date sorting.

## Quickstart

```bash
# Requires Node 24.x and yarn 1.22.x (see "engines" in package.json); Docker recommended for Redis
yarn setup

# Edit .env with DocketAlarm credentials (for live runs only — never commit secrets)
yarn start:dev
```

- API: `http://localhost:3000/api/v1/legal_results`
- Swagger: `http://localhost:3000/docs`
- Health: `http://localhost:3000/health`

## What this service does

1. Accepts a Person or Company entity (names + addresses with confidence scores).
2. Resolves a confidence-ordered name list (primary + aliases gated by `ALIAS_MIN_CONFIDENCE` / `MAX_ALIAS_NAMES`).
3. Searches DocketAlarm via `login/` + `search/` only, narrowing queries when a result count exceeds 250.
4. Fans out across aliases until the combined, deduplicated pool reaches 250.
5. Sorts results by court authority (`FEDERAL > STATE > COUNTY > UNCATEGORIZED`), then by filing date (newest first; missing dates last).
6. Coalesces parallel/duplicate requests so DocketAlarm sees a single search flow while every HTTP caller still gets a synchronous response.

## Architecture (high level)

```
Client → LegalResultsController
       → LegalResultsService
       → EntityResolverService  (Person/Company → SearchCriteria)
       → SearchQueueService     (BullMQ jobId dedup + waitUntilFinished)
       → SearchProcessor
       → LegalDataProviderPort  (interface)
       → DocketAlarmProvider    (narrow → fan-out → paginate → cap)
       → DocketAlarmHttpClient  (login token cache + auth refresh)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module responsibilities and how to add another provider, and its [Known limitations & assumptions](docs/ARCHITECTURE.md#known-limitations--assumptions) section for documented gaps (PII handling, no endpoint auth, narrowing ceiling, sequential fan-out, retry cost, dedup key scope).

## API

### `POST /api/v1/legal_results`

**Request**

```json
{
  "entityId": 43432,
  "entityType": "Person",
  "entityDetails": {
    "name": [
      { "full": "Bradley Friedman", "confidence": 0.9 },
      { "full": "Brad Gof Friedman", "confidence": 0.8 }
    ],
    "address": [
      { "full": "1200 NW 6th AVENUE, MIAMI, FL", "confidence": 0.9 }
    ]
  }
}
```

**Response**

```json
{
  "results": [
    {
      "docket": "1:23-cv-01234",
      "court": "Florida Middle District Court",
      "title": "…",
      "dateFiled": "2023-05-12",
      "link": "https://www.docketalarm.com/…",
      "resultType": "docket"
    }
  ],
  "meta": {
    "namesSearched": 2,
    "returned": 1,
    "truncated": false
  }
}
```

`meta` is an additive observability extension beyond the minimal assignment contract.

Sample payloads for all five assignment entities live in [`test/fixtures/sample-entities.json`](test/fixtures/sample-entities.json).

### Error responses

| Status | When |
|--------|------|
| `400` | Validation failure |
| `503` | DocketAlarm / queue failure after retries, or job wait timeout |
| `500` | Unexpected safety-net failure |

Every error body includes `{ statusCode, error, message, correlationId }`.

## Configuration

All knobs are environment variables — see [docs/CONFIGURATION.md](docs/CONFIGURATION.md) and [`.env.example`](.env.example).

Key settings:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DOCKET_ALARM_USERNAME` / `PASSWORD` | — | Required credentials (never commit) |
| `REDIS_URL` | — | Required Redis connection |
| `DOCKET_ALARM_MAX_CONCURRENCY` | `5` | Per-worker simultaneous jobs |
| `DOCKET_ALARM_RATE_LIMIT_MAX` / `_DURATION_MS` | `5` / `1000` | Fleet-wide rate cap |
| `RESULT_CACHE_TTL_SECONDS` | `30` | Completed-job reuse window |
| `ALIAS_MIN_CONFIDENCE` | `0.3` | Skip aliases below this score |
| `MAX_ALIAS_NAMES` | `5` | Cap on aliases searched per request |

## Assumptions / tie-break rules

Documented product judgments (also called out in code TSDoc):

1. **Address confidence ties** (e.g. Robert Gilbert’s four addresses at confidence `1`): OR-combine all parsed US states when narrowing, rather than picking one arbitrarily.
2. **Alias confidence floor**: aliases below `ALIAS_MIN_CONFIDENCE` are not searched (primary always is). Robert Gilbert’s `"Rob T Gil"` @ `0.1` is excluded by default.
3. **Court classification** is a heuristic over the `court` string (DocketAlarm does not return a court-type field). Verified against the seven assignment examples — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
4. **Date window** of the last 10 years is applied to every query from the start (low-cost priority from the product team).

## Resilience

Duplicate/parallel requests, retries, token refresh, and wait timeouts are described in [docs/RETRY_LOGIC.md](docs/RETRY_LOGIC.md).

## Tests

```bash
yarn test          # unit tests (no Redis)
yarn test:queue    # BullMQ single-flight / retry / cache (requires Redis)
yarn test:e2e      # HTTP + nock (requires Redis; no live DocketAlarm calls)
yarn test:cov      # coverage report
```

**No test suite calls the real DocketAlarm API.** Upstream HTTP is mocked with `nock` or a fake `LegalDataProviderPort`.

## Local helpers

| Command | What it does |
|---------|----------------|
| `yarn setup` | Copy `.env.example` → `.env`, `yarn install`, start Redis via docker-compose |
| `docker compose up -d redis` | Redis only |
| `docker compose up --build` | Full stack (api + redis) |
| `yarn start:dev` | Nest watch mode |
| `yarn lint` / `yarn format` | ESLint (strict, no `any`) + Prettier |

## Tooling

- **Package manager**: yarn (`packageManager` field pinned)
- **Dependencies**: all `dependencies`/`devDependencies` are pinned to exact versions (no `^`/`~` ranges) for reproducible installs; `engines.node`/`engines.yarn` in `package.json` document the supported runtime, matching the Dockerfile and CI (Node 24.x)
- **TypeScript**: `strict` + `noImplicitAny` + `noUncheckedIndexedAccess`
- **ESLint**: `@typescript-eslint/no-explicit-any: error`, explicit return types
- **Husky + lint-staged**: pre-commit lint/format
- **Docker**: multi-stage non-root image + `.dockerignore`

## Time estimate

Implementation of this scope (NestJS + Redis/BullMQ + both bonuses + docs + comprehensive tests): roughly **2–3 focused days**.

## Confidentiality

DocketAlarm credentials supplied for the interview must not be committed or reused outside this assignment. Keep them in `.env` only (gitignored).
