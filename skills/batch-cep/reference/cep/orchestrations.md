# Orchestrations (CEP)

Query campaigns and automations (orchestrations) for monitoring and analytics. Orchestrations are **read-only** — use `campaigns` resource for creating/updating campaigns.

## Commands

### `$batch-cep orchestrations list [--kind campaign|automation]`

List all campaigns and automations (orchestrations) in the project, with optional filtering by kind.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `--kind` | String | No | Filter by `campaign` or `automation` (omit for both) |

**Output**

```json
{
  "ok": true,
  "command": "orchestrations list",
  "platform": "cep",
  "result": {
    "orchestrations": [
      {
        "id": "orch_abc123",
        "name": "Summer Sale",
        "kind": "campaign",
        "state": "RUNNING",
        "created_at": "2026-05-01T12:00:00Z",
        "updated_at": "2026-05-13T10:30:00Z"
      },
      {
        "id": "orch_def456",
        "name": "Welcome Flow",
        "kind": "automation",
        "state": "ACTIVE",
        "created_at": "2026-04-15T08:00:00Z",
        "updated_at": "2026-05-10T15:00:00Z"
      }
    ]
  }
}
```

**Example (all orchestrations)**

```bash
$batch-cep orchestrations list
```

**Example (campaigns only)**

```bash
$batch-cep orchestrations list --kind campaign
```

**Example (automations only)**

```bash
$batch-cep orchestrations list --kind automation
```

**Pitfalls**

- This is a read-only view — use `campaigns create/update/delete` to manage campaigns
- Automations are listed but cannot be created via this CLI (managed in Batch dashboard)

---

### `$batch-cep orchestrations view <orchestration-id>`

Get detailed information about a single campaign or automation.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `orchestration-id` | String | Yes | Orchestration ID from `list` response |

**Output**

```json
{
  "ok": true,
  "command": "orchestrations view",
  "platform": "cep",
  "result": {
    "orchestration": {
      "id": "orch_abc123",
      "name": "Summer Sale",
      "kind": "campaign",
      "state": "RUNNING",
      "targeting": { "segment": "active_users" },
      "channels": {
        "push": {
          "title": "Summer Sale!",
          "body": "Get 20% off this week."
        }
      },
      "created_at": "2026-05-01T12:00:00Z",
      "updated_at": "2026-05-13T10:30:00Z",
      "statistics": {
        "sent_count": 12500,
        "open_count": 3750,
        "click_count": 1250
      }
    }
  }
}
```

**Example**

```bash
$batch-cep orchestrations view "orch_abc123"
```

→ Output:
```json
{
  "ok": true,
  "command": "orchestrations view",
  "platform": "cep",
  "result": {
    "orchestration": {
      "id": "orch_abc123",
      "name": "Summer Sale",
      "kind": "campaign",
      "state": "RUNNING",
      "targeting": { "segment": "active_users" },
      "channels": { "push": { "title": "Summer Sale!", "body": "Get 20% off this week." } },
      "created_at": "2026-05-01T12:00:00Z",
      "updated_at": "2026-05-13T10:30:00Z",
      "statistics": {
        "sent_count": 12500,
        "open_count": 3750,
        "click_count": 1250
      }
    }
  }
}
```

**Pitfalls**

- Returned object structure varies between campaigns and automations
- `statistics` field may be populated after the orchestration has been running for a while

---

### `$batch-cep orchestrations stats <orchestration-id>`

Get analytics and performance metrics for a campaign or automation.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `orchestration-id` | String | Yes | Orchestration ID |

**Output**

```json
{
  "ok": true,
  "command": "orchestrations stats",
  "platform": "cep",
  "result": {
    "stats": {
      "orchestration_id": "orch_abc123",
      "orchestration_name": "Summer Sale",
      "kind": "campaign",
      "metrics": {
        "sent": 12500,
        "delivered": 12450,
        "opened": 3750,
        "clicked": 1250,
        "bounced": 50,
        "unsubscribed": 25,
        "conversion_count": 375,
        "revenue": 18750.00
      },
      "by_channel": {
        "push": {
          "sent": 10000,
          "opened": 3000,
          "clicked": 1000
        },
        "email": {
          "sent": 2500,
          "opened": 750,
          "clicked": 250
        }
      },
      "as_of": "2026-05-13T10:00:00Z"
    }
  }
}
```

**Example**

```bash
$batch-cep orchestrations stats "orch_abc123"
```

→ Output:
```json
{
  "ok": true,
  "command": "orchestrations stats",
  "platform": "cep",
  "result": {
    "stats": {
      "orchestration_id": "orch_abc123",
      "orchestration_name": "Summer Sale",
      "kind": "campaign",
      "metrics": {
        "sent": 12500,
        "delivered": 12450,
        "opened": 3750,
        "clicked": 1250,
        "bounced": 50,
        "unsubscribed": 25
      },
      "by_channel": {
        "push": {
          "sent": 10000,
          "opened": 3000,
          "clicked": 1000
        },
        "email": {
          "sent": 2500,
          "opened": 750,
          "clicked": 250
        }
      },
      "as_of": "2026-05-13T10:00:00Z"
    }
  }
}
```

**Pitfalls**

- Statistics are typically updated every few minutes — may not be real-time
- Campaigns must have been running for some time to have meaningful stats
- Conversion and revenue tracking depends on Batch SDK integration

---

## See also

- [campaigns](./campaigns.md) — create, update, delete campaigns (orchestrations are read-only)
- [overview](../overview.md) — CEP campaigns vs automations vs MEP campaigns
- [rate-limits](../rate-limits.md) — rate limiting for read-only queries
- [errors](../errors.md) — troubleshooting 404 and other errors
