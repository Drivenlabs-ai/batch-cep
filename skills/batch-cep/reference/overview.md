# Overview: CEP vs MEP

Batch.com provides two distinct API platforms for different use cases. Understanding which one to use is the first step.

## The two platforms

**Customer Engagement Platform (CEP)** is the modern, profile-oriented API. It's built around the concept of customer profiles with identifiers, attributes, events, and relationships.

**Mobile Engagement Platform (MEP)** is the legacy app-and-install-oriented API. It's built around mobile app installations and direct messaging to devices. Use it only when the equivalent doesn't exist in CEP.

## When to use which

| I want to... | Platform | Why |
|---|---|---|
| Sync CRM / profile data across channels | CEP | Profile-level operations, batch updates per custom_id |
| Create / manage audiences by custom ID | CEP | Native audience segmentation, cross-channel |
| Send campaigns to users by custom ID | CEP | Direct integration with profile data |
| Track custom events and transactions | CEP | Event taxonomy tied to profiles |
| Manage catalogs (products, items) | CEP | Catalog API is CEP-only |
| Send transactional push (1-to-1) | MEP | MEP-specific transactional endpoint |
| Send push campaigns by install ID | MEP | Legacy install-only approach |
| Manage mobile app-specific data | MEP | App-data, trigger events (app v1.0 API) |
| Create audiences from install IDs | MEP | Custom audiences v1.1 (install-scoped) |

## Authentication differences

### CEP

Three required headers:

```
Authorization: Bearer <REST_API_KEY>
X-Batch-Project: <PROJECT_KEY>
Content-Type: application/json
```

The **REST API key** is account-wide (find it in Settings → General, managers only). The **project key** is project-specific (Settings → General of the project).

### MEP

Two required headers:

```
X-Authorization: <REST_API_KEY>
Content-Type: application/json
```

The **app SDK key goes in the URL path**, not a header:

```
https://api.batch.com/1.1/<APP_KEY>/transactional/send
```

Each platform (iOS dev/live, Android dev/live, Web) has its own app key. To push to multiple platforms, make multiple calls with different keys.

## Rate limits

**CEP default:** 1 request/s per project key.

**Profile updates:** `/profiles/update` has 300/s limit, measured per **Custom ID processed** (not per request). A single request with 10 IDs counts as 10 updates.

**Bulk updates:** `/profiles/mass-update` has 10,000/s limit. Use for daily/weekly dumps, not streaming.

See [rate-limits.md](rate-limits.md) for full details and retry strategy.

## Async pattern (CEP only)

CEP write endpoints often return **HTTP 202** with:

```json
{ "indexing_token": "abc123def456" }
```

202 means "accepted, processing async." To check completion, call the corresponding `view` endpoint with the token.

MEP is synchronous — no 202 pattern.

See [async-pattern.md](async-pattern.md) for the polling workflow.

## Quick curl examples

### CEP — update a profile

```bash
curl -X POST https://api.batch.com/2.11/profiles/update \
  -H "Authorization: Bearer $BATCH_REST_KEY" \
  -H "X-Batch-Project: $BATCH_PROJECT_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "identifiers": {"custom_id": "user_123"},
      "attributes": {"$email_address": "user@example.com", "plan": "premium"}
    }
  ]'
```

### CEP — create an audience (async)

```bash
curl -X POST https://api.batch.com/2.11/audiences/create \
  -H "Authorization: Bearer $BATCH_REST_KEY" \
  -H "X-Batch-Project: $BATCH_PROJECT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "premium_users",
    "type": "custom_ids",
    "display_name": "Premium Users"
  }'
```

Returns `{"indexing_token": "..."}`. Poll with `audiences/view`.

### MEP — send transactional push

```bash
curl -X POST https://api.batch.com/1.1/$APP_KEY/transactional/send \
  -H "X-Authorization: $BATCH_REST_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": "order_confirmed",
    "recipients": {"custom_ids": ["user_123"]},
    "message": {"title": "Order", "body": "Your order is confirmed"}
  }'
```

Synchronous — response is immediate.

## Identifiers

Both platforms support multiple identifier types. See [identifiers.md](identifiers.md) for the full breakdown and when to use each.

**Short version:**
- `custom_id` is the primary one for CEP (your business ID for the user, ≤512 chars)
- `install_id` is for MEP mobile devices (Batch SDK–generated)
- `email` can target in CEP audiences
- `advertising_id` (IDFA / GAID) is for MEP ad-network attribution

## Next steps

1. **First time?** Start with [setup.md](setup.md) to get credentials in place.
2. **Need to sync profile data?** Use CEP [cep/profiles.md](cep/profiles.md).
3. **Building an audience?** Use CEP [cep/audiences.md](cep/audiences.md).
4. **Running a transactional push?** Use MEP [mep/transactional.md](mep/transactional.md).
5. **Troubleshooting an error?** Check [errors.md](errors.md).
