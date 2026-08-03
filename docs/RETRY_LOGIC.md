# Retry & Resilience Logic

This document describes every resilience mechanism in the service: how duplicate requests coalesce, how transient DocketAlarm failures are retried, how auth tokens are refreshed, and what happens when an HTTP caller gives up waiting.

## 1. Single-flight deduplication (duplicate / parallel requests)

**Goal:** N concurrent identical requests → **one** DocketAlarm search flow → **N** correct HTTP responses.

**Mechanism (BullMQ `jobId`):**

1. `SearchQueueService` computes  
   `jobId = sha256(JSON.stringify(normalized SearchCriteria))`.
2. It calls `queue.add('search', payload, { jobId, … })`.  
   BullMQ’s Redis-backed job creation is **atomic per `jobId`**: if a job with that id is already waiting / active / delayed, no duplicate is enqueued — callers receive a handle to the existing job.
3. Every caller then runs  
   `await job.waitUntilFinished(queueEvents, JOB_WAIT_TIMEOUT_MS)`.  
   `QueueEvents` listens to a Redis stream of job lifecycle events, so waiters on **any** instance resolve when **any** Worker completes the job.

This works across horizontally scaled pods because queue state lives in Redis, not process memory.

```
Request A ──┐
            ├── add(jobId=H) ──► [single BullMQ job] ──► Worker ──► DocketAlarm
Request B ──┘         │
                      └── waitUntilFinished ──► both HTTP responses
```

## 2. Short result cache (`RESULT_CACHE_TTL_SECONDS`)

Completed jobs are retained with:

```ts
removeOnComplete: { age: RESULT_CACHE_TTL_SECONDS }
```

A request arriving shortly **after** completion finds the job in `completed` state via `getJob(jobId)` and returns `job.returnvalue` without touching DocketAlarm again.

Failed jobs are retained briefly (`FAILED_JOB_RETENTION_SECONDS`) so near-simultaneous duplicates observe the same failure instead of silently starting a second attempt while the first is still failing.

## 3. Job-level retries (transient upstream failures)

Configured when the job is enqueued:

| Env var | Default | Meaning |
|---------|---------|---------|
| `DOCKET_ALARM_RETRY_ATTEMPTS` | `3` | Total attempts (including the first) |
| `DOCKET_ALARM_RETRY_BACKOFF_MS` | `1000` | Base delay for exponential backoff |

BullMQ retries the **entire** processor invocation (the full narrow → fan-out → paginate flow, across *all* name candidates) on thrown errors — there is no partial-result checkpointing per alias. After attempts are exhausted, `waitUntilFinished` rejects for every waiter and the API returns **503**.

This means a transient failure late in a multi-alias fan-out (e.g. on the last of five aliases) discards and re-fetches the work already done for the earlier four on retry. This is a deliberate simplicity/cost tradeoff — see [ARCHITECTURE.md § Known limitations](ARCHITECTURE.md#known-limitations--assumptions) — and would need per-alias checkpointing to avoid if retry cost becomes a problem in practice.

There is intentionally **no** separate circuit-breaker library — BullMQ attempts + the fleet-wide rate limiter are sufficient for this scope.

## 4. Login token cache & refresh-on-401

- `login_token` is cached in Redis under `docket-alarm:login_token` with an **85-minute** TTL (5-minute buffer under DocketAlarm’s 90-minute expiry).
- On auth failure (HTTP 401/403 or `success:false` messages that look token-related):
  1. Clear the cached token.
  2. Call `login/` once for a fresh token.
  3. Retry the original `search/` once.

No distributed lock is used for login: a rare redundant `login/` on concurrent cache misses is cheap compared to lock complexity.

## 5. Outbound concurrency controls

Two BullMQ knobs, answering different questions:

| Knob | Env | Scope |
|------|-----|-------|
| `concurrency` | `DOCKET_ALARM_MAX_CONCURRENCY` | **Per Worker process** — how many jobs this instance pulls at once |
| `limiter: { max, duration }` | `DOCKET_ALARM_RATE_LIMIT_MAX` / `_DURATION_MS` | **Fleet-wide** Redis token bucket — shared across every Worker |

With 3 pods at concurrency 5, simultaneous in-flight jobs can reach 15, but the rate limiter still caps how quickly new jobs *start* cluster-wide.

## 6. HTTP wait timeout (`JOB_WAIT_TIMEOUT_MS`)

If `waitUntilFinished` exceeds the timeout:

- The HTTP request returns **503** (`Legal data provider temporarily unavailable`).
- The BullMQ job **continues** in the background.
- A client retry within `RESULT_CACHE_TTL_SECONDS` after completion will typically hit the completed-job cache.

## 7. Error mapping to clients

| Internal situation | Client status |
|--------------------|---------------|
| Validation failure | `400` |
| Job failure after retries / wait timeout / upstream error | `503` (generic message; details only in logs) |
| Anything unexpected | `500` via `AllExceptionsFilter` |

Credentials and tokens are never included in client-facing messages or structured logs.
