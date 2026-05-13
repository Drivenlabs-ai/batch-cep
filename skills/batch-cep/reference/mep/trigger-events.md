# Trigger Events (MEP)

Fire custom events that trigger automations configured in the Batch dashboard. Marketers configure "when event X arrives → send Y"; your code calls this endpoint to fire event X.

**CRITICAL:** Trigger Events endpoints live under `/1.0/`, not `/1.1/` — this is handled automatically.

## Commands

### `$batch-cep trigger-events send <custom_id> <events-json> [--app-key]`

Fire one or more events for a single Custom User ID.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `custom_id` | string | Yes | User's unique ID (1-512 chars). URL-encoded automatically. |
| `events-json` | JSON array | Yes | Array of event objects, each with `name` (required), `label`, `data`, `time` (optional). |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Schema (per event object)**

- `name` (string, required): Event name, `[a-z0-9_]{1,30}` (case-sensitive). Must match dashboard automation config.
- `label` (string, optional): Secondary classifier, max 255 chars.
- `data` (object, optional): Custom key/value pairs for templating (e.g., `{"product_id": "SKU_123"}`).
- `time` (int, optional): Unix timestamp. Defaults to now.

**Limits**

- Max 1000 events per request.
- Custom ID max 512 chars.
- Event name must be alphanumeric + underscore, 1-30 chars.

**Output**

```json
{
  "ok": true,
  "command": "trigger-events send",
  "platform": "mep",
  "result": {
    "status": "accepted",
    "count": 2,
    "raw": {}
  }
}
```

**Example**

```bash
$batch-cep trigger-events send user_123 '[
  { "name": "cart_abandoned", "label": "web", "data": { "cart_value": 45.99 } },
  { "name": "checkout_viewed" }
]'
```

→ Output:
```json
{
  "ok": true,
  "command": "trigger-events send",
  "platform": "mep",
  "result": {
    "status": "accepted",
    "count": 2,
    "raw": {}
  }
}
```

---

### `$batch-cep trigger-events send-bulk <payload-json> [--app-key]`

Fire events for many Custom User IDs in one HTTP call.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `payload-json` | JSON array | Yes | Array of `{id, events}` objects. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Schema**

Payload is a **top-level JSON array** (not wrapped in an object):

```json
[
  {
    "id": "user_123",
    "events": [
      { "name": "purchase", "data": { "order_id": "ORD_456" } }
    ]
  },
  {
    "id": "user_456",
    "events": [
      { "name": "viewed_product", "label": "mobile" },
      { "name": "added_to_cart" }
    ]
  }
]
```

**Limits**

- Total events across all users ≤ 1000 per request.
- Each user's `id` max 512 chars.
- Each event name `[a-z0-9_]{1,30}`.

**Output**

```json
{
  "ok": true,
  "command": "trigger-events send-bulk",
  "platform": "mep",
  "result": {
    "status": "accepted",
    "users_count": 2,
    "raw": {}
  }
}
```

**Example**

```bash
$batch-cep trigger-events send-bulk '[
  { "id": "user_100", "events": [ { "name": "login", "label": "web" } ] },
  { "id": "user_101", "events": [ { "name": "login", "label": "mobile" } ] }
]'
```

→ Output:
```json
{
  "ok": true,
  "command": "trigger-events send-bulk",
  "platform": "mep",
  "result": {
    "status": "accepted",
    "users_count": 2,
    "raw": {}
  }
}
```

---

## Pitfalls

- **Event names are case-sensitive:** Dashboard automation references `cart_abandoned` (lowercase), not `CartAbandoned`.
- **Event names are strict regex:** `[a-z0-9_]{1,30}` — only lowercase letters, digits, underscores. No hyphens, spaces, or uppercase.
- **Custom IDs get URL-encoded:** Unusual characters are automatically percent-encoded. No extra quoting needed.
- **Bulk body is a top-level array:** NOT `{users: [...]}`. Just `[{id, events}, ...]`.
- **Total events limit:** 1000 events across all users in one bulk call. For larger batches, split into multiple calls.

## See also

- [overview](../overview.md) — when to use MEP vs CEP
- [identifiers](../identifiers.md) — `custom_id` field details
- [rate-limits](../rate-limits.md) — MEP rate limits
- [errors](../errors.md) — troubleshooting
