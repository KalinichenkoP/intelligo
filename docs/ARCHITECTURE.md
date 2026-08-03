# Architecture

## Ports & adapters

The public API must stay **provider-agnostic**. DocketAlarm is an implementation detail behind `LegalDataProviderPort`.

```
src/
  legal-results/                 # HTTP boundary + orchestration
  legal-data-provider/
    interfaces/                  # SearchCriteria, LegalCase, LegalDataProviderPort
    docket-alarm/                # Adapter (query language, auth, narrowing, fan-out)
  search-queue/                  # BullMQ single-flight + concurrency controls
  config/                        # Typed env config + Joi validation
  common/                        # Exception filter, correlation-id interceptor
  health/                        # Redis readiness
```

### Domain types (`LegalDataProviderPort`)

| Type | Role |
|------|------|
| `SearchCriteria` | Resolved entity search intent (names, states, company type, date window, maxResults) |
| `LegalCase` | Normalized case record + derived `courtType` |
| `LegalSearchResult` | Cases + `namesSearched` / `truncated` metadata |
| `LegalDataProviderPort` | `search(criteria) → LegalSearchResult` |

To add a second provider later:

1. Implement `LegalDataProviderPort`.
2. Bind it in `LegalDataProviderModule` (or introduce a strategy selector).
3. Leave controllers / DTOs unchanged.

## Request flow

1. **`LegalResultsController`** validates the body (`class-validator`) and throttles callers.
2. **`EntityResolverService`** converts `entityDetails` into `SearchCriteria`:
   - Names sorted by confidence (primary always included).
   - Aliases filtered by `ALIAS_MIN_CONFIDENCE` and capped by `MAX_ALIAS_NAMES`.
   - Person states parsed from highest-confidence address(es); ties OR-combined.
   - Company type taken from the primary name’s `type`.
   - Last-10-years date window computed in UTC.
3. **`SearchQueueService`** computes `jobId = sha256(normalized criteria)`, enqueues (or joins) a BullMQ job, and `waitUntilFinished` for a synchronous HTTP response.
4. **`SearchProcessor`** calls `LegalDataProviderPort.search`.
5. **`DocketAlarmProvider`**:
   - For each name until the pool hits 250:
     - Probe `count` with `limit=1`.
     - Narrow (Person → state/court filter; Company → company type) while `count > 250`.
     - Paginate (`limit=50`, `offset+limit < 1000`) and merge with global `(court, docket)` dedup.
   - Map DocketAlarm fields → `LegalCase`, classifying court type.
6. **`LegalResultsService`** sorts: court priority, then `dateFiled` desc (nulls last), and maps to the response DTO.

## Court classification

DocketAlarm `search/` results do not include a court-type field. Classification is derived from the `court` string:

1. Contains `"State,"` → `COUNTY` if also `"County"`, else `STATE`.
2. Else if contains `"District Court"` / `"Court of Appeals"` / `"Bankruptcy Court"` / `"Circuit"` → `FEDERAL`.
3. Else → `UNCATEGORIZED`.

Verified against the assignment examples:

| Court string | Type |
|--------------|------|
| Florida Middle District Court | FEDERAL |
| U.S. Court of Appeals, Second Circuit | FEDERAL |
| Nevada Bankruptcy Court | FEDERAL |
| Connecticut State, Superior Court | STATE |
| Ohio State, Hamilton County, Court of Common Pleas | COUNTY |
| Pennsylvania State, Magisterial District Court, Chester County | COUNTY |
| United States Tax Court | UNCATEGORIZED |

Unrecognized courts safely fall back to `UNCATEGORIZED`.

## Concurrency model

See [RETRY_LOGIC.md](RETRY_LOGIC.md) for the full resilience story. Summary:

- **`jobId` dedup** → one DocketAlarm search flow per unique entity payload, even across pods.
- **`concurrency`** → per-worker simultaneous jobs (`DOCKET_ALARM_MAX_CONCURRENCY`).
- **`limiter`** → Redis-backed fleet-wide rate cap (`DOCKET_ALARM_RATE_LIMIT_*`).

## Security notes

- Credentials live only in env vars; never logged.
- `helmet` sets standard HTTP security headers.
- Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`.
- Public endpoint rate-limited via `@nestjs/throttler`.
- **No endpoint authentication is implemented.** `POST /api/v1/legal_results` only has rate limiting and standard security headers — there is no API key / JWT / mTLS check. This is intentional: the assignment does not specify an auth scheme, and the deployment assumption is that this service sits behind an internal gateway / service mesh / VPC boundary that handles authN/Z. If this service is ever exposed beyond a trusted internal network, an auth guard must be added before that happens.

## Known limitations & assumptions

Documented tradeoffs and gaps, called out explicitly rather than left implicit:

1. **PII at rest in Redis.** `SearchJobPayload` (entity names, addresses, confidence scores) is stored in Redis for the lifetime of a BullMQ job (`RESULT_CACHE_TTL_SECONDS` / `FAILED_JOB_RETENTION_SECONDS`), and the DocketAlarm `login_token` is cached there for 85 minutes. The application does not enforce transport or at-rest encryption for this data. Operators are responsible for:
   - Using `rediss://` (TLS) for `REDIS_URL` in any non-local environment.
   - Running Redis in a private network / VPC with no public exposure.
   - Enabling disk encryption on the Redis instance if persistence (RDB/AOF) is enabled.

   This is an operational requirement of the deployment, not something the app code guarantees today.

2. **Narrowing has a shallow ceiling.** `DocketAlarmProvider.buildNarrowingSteps` only ever produces 1–2 steps: the base query, then optionally a state filter (Person) or company-type filter (Company). If a query is still over the 250-result budget after that (e.g. a common name with no usable address), the service does **not** attempt further narrowing (such as splitting the 10-year date window into sub-ranges) — it fetches the newest 250 results from the unnarrowed query and reports `meta.truncated: true`. This is the main scenario where "as broad a range of results as possible" is not fully satisfied; API consumers should treat `truncated: true` as a signal that the result set may be incomplete for that name.

3. **Alias fan-out is sequential, not parallel.** For each name candidate (primary + aliases), narrowing probes and pagination run one after another (`for (const name of criteria.names) { await ... }`), not concurrently across aliases. This is a deliberate tradeoff: the global 250-result pool and its dedup/truncation bookkeeping are checked incrementally after each name completes, which would be significantly more complex to reason about if aliases were fetched in parallel. The cost is added latency per request when a caller has multiple aliases (each alias may involve 1–2 count probes plus several paginated page fetches). Acceptable for this scope; worth revisiting if p95/p99 latency becomes a concern at higher alias counts.

4. **Job retries re-run the entire search flow.** BullMQ retries (`DOCKET_ALARM_RETRY_ATTEMPTS`) restart the whole narrow → fan-out → paginate flow for **all** names on any thrown error, even if earlier aliases in that attempt already completed successfully. There is no partial-result checkpointing. This is simple and correct but means a late transient failure (e.g. on the last alias) discards and re-fetches work that already succeeded, up to the configured retry count.

5. **Court classification is a string-matching heuristic.** `classifyCourt` has only been verified against the seven court strings given in the assignment. DocketAlarm's real `search/` response has no explicit court-type field, so any court string that doesn't match the known patterns (`"State,"`, `"District Court"`, `"Court of Appeals"`, `"Bankruptcy Court"`, `"Circuit"`) safely falls back to `UNCATEGORIZED` rather than misclassifying — but this means the FEDERAL/STATE/COUNTY buckets are only as complete as the pattern list.

6. **Dedup key does not account for multi-document results.** Cases are deduplicated by `` `${court}::${docket}` `` in `DocketAlarmProvider.caseKey`. Today every query is scoped to `is:docket`, so each docket appears at most once per court and this key is safe. If document-level results (`resultType: 'document'`) were ever enabled by relaxing `is:docket`, multiple distinct documents under the same docket/court would collapse into a single pool entry under the current key — a document identifier would need to be added to the key first.
