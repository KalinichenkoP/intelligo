# Configuration Reference

All settings are loaded from environment variables via `@nestjs/config` and validated on boot with Joi (`src/config/env.validation.ts`). Missing required values fail fast.

Copy [`.env.example`](../.env.example) to `.env` (`yarn setup` does this for you).

## Required

| Variable | Description |
|----------|-------------|
| `DOCKET_ALARM_USERNAME` | DocketAlarm account email |
| `DOCKET_ALARM_PASSWORD` | DocketAlarm account password |
| `REDIS_URL` | Redis connection URL used by BullMQ and the login-token cache (e.g. `redis://localhost:6379`) |

**Never commit real credentials.** `.env` is gitignored.

## Application

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `SEARCH_QUEUE_NAME` | `docket-alarm-search` | BullMQ queue name. Tests override this (`docket-alarm-search-test` / `-e2e`) so they never race a concurrent `yarn start:dev` worker on the same Redis. |

## DocketAlarm client

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKET_ALARM_BASE_URL` | `https://www.docketalarm.com/api/v1` | API base (no trailing slash required) |
| `DOCKET_ALARM_CLIENT_MATTER` | `intelligo-legal-results` | Passed as `client_matter` on search calls |

## Outbound concurrency & rate limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKET_ALARM_MAX_CONCURRENCY` | `5` | Per-Worker simultaneous BullMQ jobs |
| `DOCKET_ALARM_RATE_LIMIT_MAX` | `5` | Fleet-wide max job *starts* per duration window |
| `DOCKET_ALARM_RATE_LIMIT_DURATION_MS` | `1000` | Duration window for the rate limiter (ms) |

See [RETRY_LOGIC.md](RETRY_LOGIC.md) for the concurrency vs limiter distinction.

## Retries & waiting

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCKET_ALARM_RETRY_ATTEMPTS` | `3` | BullMQ job attempts (including the first) |
| `DOCKET_ALARM_RETRY_BACKOFF_MS` | `1000` | Exponential backoff base delay (ms) |
| `JOB_WAIT_TIMEOUT_MS` | `20000` | Max time an HTTP request awaits `waitUntilFinished` |

## Result cache / job retention

| Variable | Default | Description |
|----------|---------|-------------|
| `RESULT_CACHE_TTL_SECONDS` | `30` | How long completed jobs (and their return values) remain reusable for duplicate requests |
| `FAILED_JOB_RETENTION_SECONDS` | `10` | How long failed jobs stay visible so near-simultaneous duplicates share the failure |

## Alias fan-out

| Variable | Default | Description |
|----------|---------|-------------|
| `ALIAS_MIN_CONFIDENCE` | `0.3` | Aliases below this confidence are not searched (primary always is) |
| `MAX_ALIAS_NAMES` | `5` | Hard cap on number of aliases attempted per request |

## Public API throttling

| Variable | Default | Description |
|----------|---------|-------------|
| `THROTTLE_TTL_MS` | `60000` | Throttler window (ms) |
| `THROTTLE_LIMIT` | `60` | Max requests per window per client |

## Constants (not env-configurable)

| Constant | Value | Where |
|----------|-------|-------|
| Max returned cases | `250` | Assignment requirement (`MAX_LEGAL_RESULTS`) |
| DocketAlarm page size | `50` | Vendor API max |
| Login token Redis TTL | `85` minutes | Safety buffer under vendor’s 90-minute expiry |
| Lookback years | `10` | Assignment priority |
