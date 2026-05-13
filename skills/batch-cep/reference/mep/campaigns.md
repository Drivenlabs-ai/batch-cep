# Campaigns (MEP)

Create and manage mass push campaigns targeting users by criteria or pre-defined custom audiences. For 1-to-1 action-triggered sends, use [transactional](transactional.md) instead.

## Commands

### `$batch-cep campaigns create <payload-json> [--app-key]`

Create a new mass push campaign.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `payload-json` | JSON object | Yes | Campaign definition with `name`, `state`, `when`, `targeting`, `messages`. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Schema**

- `name` (string, 1-255 chars, required): Human-readable campaign name.
- `state` (enum, required): `"DRAFT"` (paused) or `"RUNNING"` (launches immediately).
- `send_rate` (int, optional): Sends per second (default: unlimited).
- `when` (object, required): Scheduling. Keys: `once_at` (ISO 8601 timestamp), `between` (time window), `local_between` (user's local time).
- `targeting` (object, optional): Segmentation criteria (segments, cohorts, custom audiences). Pass-through to Batch schema.
- `labels` (array, optional): Up to 3 frequency-capping labels.
- `messages` (array, required): Push message definitions (channel, title, body, media, etc.).

**Output**

```json
{
  "ok": true,
  "command": "campaigns create",
  "platform": "mep",
  "result": {
    "campaign_token": "tok_abc123def456",
    "raw": {
      "campaign_token": "tok_abc123def456"
    }
  }
}
```

**Example**

```bash
$batch-cep campaigns create '{
  "name": "Flash Sale - 24h",
  "state": "DRAFT",
  "when": { "once_at": "2026-05-14T10:00:00Z" },
  "targeting": { "segments": ["ENGAGED"] },
  "messages": [ { "channel": "push", "title": "Flash Sale!", "body": "50% off for 24h" } ]
}' --app-key ios-live
```

→ Output:
```json
{
  "ok": true,
  "command": "campaigns create",
  "platform": "mep",
  "result": {
    "campaign_token": "tok_xyz789",
    "raw": {
      "campaign_token": "tok_xyz789"
    }
  }
}
```

---

### `$batch-cep campaigns update <campaign_token> <patch-json> [--app-key]`

Update an existing campaign (idempotent on identical patches).

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `campaign_token` | string | Yes | Token from `campaigns create`. |
| `patch-json` | JSON object | Yes | Fields to update (any campaign schema fields). |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "campaigns update",
  "platform": "mep",
  "result": {
    "raw": {}
  }
}
```

**Example**

```bash
$batch-cep campaigns update tok_xyz789 '{ "name": "Flash Sale Extended - 48h" }'
```

---

### `$batch-cep campaigns delete <campaign_token> --confirm [--app-key]`

Permanently delete a campaign. **DESTRUCTIVE** — requires `--confirm`.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `campaign_token` | string | Yes | Token from `campaigns create`. |
| `--confirm` | flag | Yes | Destructive gate. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "campaigns delete",
  "platform": "mep",
  "result": {
    "status": "deleted",
    "campaign_token": "tok_xyz789"
  }
}
```

**Example**

```bash
$batch-cep campaigns delete tok_xyz789 --confirm
```

---

### `$batch-cep campaigns stats <campaign_token> [--app-key]`

Fetch delivery and engagement stats for a campaign.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `campaign_token` | string | Yes | Token from `campaigns create`. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "campaigns stats",
  "platform": "mep",
  "result": {
    "raw": {
      "sent": 10000,
      "delivered": 9500,
      "error": 100,
      "opened": 4200
    }
  }
}
```

**Example**

```bash
$batch-cep campaigns stats tok_xyz789
```

---

### `$batch-cep campaigns view <campaign_token> [--app-key]`

Retrieve full campaign details.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `campaign_token` | string | Yes | Token from `campaigns create`. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "campaigns view",
  "platform": "mep",
  "result": {
    "raw": {
      "campaign_token": "tok_xyz789",
      "name": "Flash Sale Extended - 48h",
      "state": "RUNNING",
      "when": { "once_at": "2026-05-14T10:00:00Z" },
      "targeting": { "segments": ["ENGAGED"] },
      "messages": [ { "channel": "push", "title": "Flash Sale!", "body": "50% off for 48h" } ]
    }
  }
}
```

**Example**

```bash
$batch-cep campaigns view tok_xyz789
```

---

### `$batch-cep campaigns list [limit] [--app-key]`

List all campaigns (optionally paginated).

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `limit` | int | No | Max results per page (default: 50). |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "campaigns list",
  "platform": "mep",
  "result": {
    "raw": [
      {
        "campaign_token": "tok_abc123",
        "name": "Campaign 1",
        "state": "RUNNING"
      },
      {
        "campaign_token": "tok_xyz789",
        "name": "Campaign 2",
        "state": "DRAFT"
      }
    ]
  }
}
```

**Example**

```bash
$batch-cep campaigns list 20
```

---

## Pitfalls

- **`state: "RUNNING"` launches immediately:** When you set this state, the campaign goes live right away. Always warn the user before launching.
- **Targeting schema is pass-through:** Refer to Batch API documentation for valid `targeting` shapes (segments enum, cohort syntax, etc.).
- **Campaign token required for updates:** You cannot update a campaign without the token from creation.
- **Idempotent updates:** Calling `update` multiple times with the same patch has no side effects.

## See also

- [overview](../overview.md) — when to use MEP vs CEP
- [transactional](transactional.md) — 1-to-1 action-triggered sends
- [rate-limits](../rate-limits.md) — MEP rate limits
- [errors](../errors.md) — troubleshooting
