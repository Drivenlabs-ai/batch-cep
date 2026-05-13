# Rate Limits & Retry Strategy

Batch imposes rate limits on API endpoints to protect stability. Understanding them helps you design scalable integrations.

## CEP default rate limit

**1 request/s per project key** across all endpoints except the special ones listed below.

If you exceed this, Batch returns **HTTP 429** (Too Many Requests). You must back off and retry.

## CEP high-throughput endpoints

Two endpoints have custom, higher rate limits designed for bulk operations:

### POST /profiles/update

- **Limit:** 300 updates/s
- **Burst:** 1000
- **Max per call:** 200 profile edits
- **Billing unit:** **per Custom ID processed** (not per HTTP request)

**Critical:** If you send one request with 10 custom IDs, you consume 10 updates. If you send 300 requests with 1 ID each, that's 300 updates (hits limit).

**When to use:** streaming updates, live events, small frequent batches (5-min micro-batches).

### POST /profiles/mass-update

- **Limit:** 10,000 updates/s
- **Burst:** none
- **Max per call:** 10,000 profile edits
- **Billing unit:** per Custom ID processed

**When to use:** daily / weekly full dumps, import a CSV of all customers, not for streaming.

## Other endpoints

| Endpoint | Limit |
|---|---|
| `/audiences/*` | 1 request/s (default) |
| `/campaigns/*` | 1 request/s (default) |
| `/catalogs/edit-items` | custom (contact Batch support) |
| Everything else | 1 request/s (default) |

## Retry strategy

### 429 (Rate Limit)

**Action:** Exponential backoff. Do NOT retry immediately.

Suggested backoff sequence: 2s → 5s → 10s → 30s → 60s

```
Attempt 1: send request
Response 429 → wait 2s
Attempt 2: send request
Response 429 → wait 5s
Attempt 3: send request
Response 429 → wait 10s
...
After 5 failures → give up
```

For `/profiles/update` and `/profiles/mass-update`, if you hit 429:
- Reduce batch size (send fewer Custom IDs per request)
- Increase interval between requests
- Switch to a slower endpoint if appropriate

### 5xx (Server Error)

**Action:** Retry with backoff. Server-side issue, not your fault.

Suggested backoff: 2s → 5s → 10s (give up after 3 attempts).

### 4xx (Client Error)

**Action:** Do NOT retry. Fix the request.

Common codes:
- **400:** Malformed JSON, invalid field
- **401:** Bad or missing REST key / project key
- **403:** Forbidden (wrong project, insufficient permissions)
- **404:** Resource not found (audience doesn't exist, etc.)
- **422:** Validation error (field value out of range, invalid format)

Read the `error_message` field and fix the request.

### 2xx (Success)

**202:** Async accepted (CEP write endpoints). See [async-pattern.md](async-pattern.md).

**200, 201, 204:** Immediate success.

## MEP rate limits

MEP has different, higher limits not documented here. Check with Batch support for your specific use case.

## Practical example: syncing 100k profiles

Scenario: You have a CSV of 100,000 customer updates to sync weekly.

### Option 1: /profiles/mass-update (recommended)

- Split into chunks of 5,000 profiles
- 20 requests total, each with ≤5,000 updates
- Space them 1-2 seconds apart to avoid bottlenecks
- Total time: ~30 seconds

```bash
for file in chunk_*.json; do
  curl -X POST https://api.batch.com/2.11/profiles/mass-update \
    -H "Authorization: Bearer $REST_KEY" \
    -H "X-Batch-Project: $PROJECT_KEY" \
    -d @$file
  sleep 2
done
```

### Option 2: /profiles/update with exponential backoff

- Split into chunks of 100 profiles
- 1,000 requests total
- 100 updates/s = ~10 seconds before hitting rate limit
- With backoff, total time: 5-10 minutes

Less efficient, but works if you need finer control.

## Monitoring and debugging

### Detecting rate limits

Check response headers:
- `X-RateLimit-Limit` — max requests/s
- `X-RateLimit-Remaining` — requests left in current second
- `X-RateLimit-Reset` — Unix timestamp when limit resets

If `Remaining` is 0 or 1, you're close to the limit. Slow down.

### Logging for analysis

Log every API call with:
- Request timestamp
- Endpoint + method
- Response status code
- Response time (ms)
- Custom IDs processed (if applicable)

Review logs weekly to spot patterns (are you hitting 429 consistently at a certain time?).

## See also

- [overview.md](overview.md) — platform differences
- [async-pattern.md](async-pattern.md) — handling 202 responses
- [errors.md](errors.md) — full error reference
