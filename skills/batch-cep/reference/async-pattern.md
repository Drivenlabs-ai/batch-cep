# Async Pattern: 202 + indexing_token Poll Loop

Many CEP write endpoints return HTTP 202 (Accepted) with a token. This guide explains the pattern and how to use it.

## Why 202?

CEP operations like audience creation or update often involve background processing:
- Building indexes
- Propagating data to edge caches
- Validating constraints

Instead of blocking your request for seconds, Batch returns **202 immediately** with a token so you can poll for completion.

## The pattern

### Step 1: Send the write request

```bash
curl -X POST https://api.batch.com/2.11/audiences/create \
  -H "Authorization: Bearer $REST_KEY" \
  -H "X-Batch-Project: $PROJECT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "premium_users",
    "type": "custom_ids",
    "display_name": "Premium Users"
  }'
```

### Step 2: Get the indexing_token

Response (HTTP 202):

```json
{
  "indexing_token": "a0082dc6860938a26280bd3ba927303b"
}
```

**202 does NOT mean success.** It means "accepted, I'm working on it." Store the token.

### Step 3: Poll for completion

Call the corresponding `view` endpoint with the token:

```bash
curl -X POST https://api.batch.com/2.11/audiences/view \
  -H "Authorization: Bearer $REST_KEY" \
  -H "X-Batch-Project: $PROJECT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"indexing_token": "a0082dc6860938a26280bd3ba927303b"}'
```

Response (HTTP 200):

```json
{
  "status": "indexing",
  "size": 0
}
```

or (when done):

```json
{
  "status": "ready",
  "size": 12453,
  "display_name": "Premium Users",
  "type": "custom_ids",
  "created_at": "2026-05-13T10:00:00Z"
}
```

### Step 4: Retry on "indexing"

If `status` is `indexing`, wait and retry. Suggested backoff:

```
Attempt 1: send view request
Response status="indexing" → wait 2s
Attempt 2: send view request
Response status="indexing" → wait 5s
Attempt 3: send view request
Response status="indexing" → wait 10s
Attempt 4: send view request
Response status="ready" → success
```

Typical indexing time: **seconds to minutes**, depending on audience size and Batch load.

## Which endpoints use 202?

### CEP audiences

- `POST /audiences/create` → 202
- `POST /audiences/update` → 202
- `POST /audiences/replace` → 202
- `POST /audiences/remove` → 202
- Poll via `POST /audiences/view`

### CEP campaigns

- `POST /campaigns/create` → 202 (sometimes; check response)
- Poll via `POST /campaigns/view`

### MEP (synchronous)

MEP endpoints (transactional, campaigns, custom-audience) are **all synchronous**. No 202 pattern. Response is immediate (HTTP 200 or 4xx/5xx error).

## Practical example: complete workflow

```bash
#!/bin/bash
set -e

REST_KEY="your_rest_key"
PROJECT_KEY="your_project_key"

# Step 1: Create audience (async)
response=$(curl -s -X POST https://api.batch.com/2.11/audiences/create \
  -H "Authorization: Bearer $REST_KEY" \
  -H "X-Batch-Project: $PROJECT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "premium_users",
    "type": "custom_ids"
  }')

token=$(echo "$response" | jq -r '.indexing_token')
echo "Audience creation accepted. Token: $token"

# Step 2: Poll until ready
max_attempts=30
attempt=0
wait_time=2

while [ $attempt -lt $max_attempts ]; do
  attempt=$((attempt + 1))
  
  status_response=$(curl -s -X POST https://api.batch.com/2.11/audiences/view \
    -H "Authorization: Bearer $REST_KEY" \
    -H "X-Batch-Project: $PROJECT_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"indexing_token\": \"$token\"}")
  
  status=$(echo "$status_response" | jq -r '.status')
  size=$(echo "$status_response" | jq -r '.size // 0')
  
  echo "Attempt $attempt: status=$status, size=$size"
  
  if [ "$status" = "ready" ]; then
    echo "Audience ready! Size: $size"
    break
  fi
  
  sleep $wait_time
  wait_time=$((wait_time + 1))  # Increment wait (2s → 3s → 4s...)
done

if [ $attempt -eq $max_attempts ]; then
  echo "Timeout: audience did not finish indexing within 5 minutes"
  exit 1
fi
```

## Error handling

If `view` returns a 4xx or 5xx status:
- **400 / 422:** Invalid token (typo?) → check the token value
- **404:** Token not found (expired? wrong project?) → may need to recreate
- **5xx:** Server issue → retry with backoff

## In batch-cep

When you run a command that returns 202 (e.g., `$batch-cep audiences create`):

1. Claude captures the `indexing_token` from the response
2. Claude prints the token to you: "Audience creation accepted. Token: abc123. Use `$batch-cep audiences view abc123` to check status."
3. You poll manually using `$batch-cep audiences view <token>`
4. Claude shows you the status until it's `ready`

## See also

- [overview.md](overview.md) — CEP vs MEP intro
- [rate-limits.md](rate-limits.md) — rate limit implications for polling loops
- [cep/audiences.md](cep/audiences.md) — audiences view endpoint details
- [errors.md](errors.md) — error handling
