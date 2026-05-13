# In-App Campaigns (MEP)

Create and manage in-app messages (modals, banners, cards) displayed inside your mobile app. Trigger on app session, specific events, or on immediate show. Different from push campaigns — this targets the app UI, not the notification center.

## Commands

### `$batch-cep in-app-campaigns create <payload-json> [--app-key]`

Create a new in-app campaign.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `payload-json` | JSON object | Yes | Campaign definition with `name`, `trigger`, `landing`, `start_date`/`local_start_date`, `end_date`/`local_end_date`. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Schema**

- `name` (string, 1-255 chars, required): Campaign name.
- `trigger` (object, required): When to show. Keys:
  - `type` (enum): `"NOW"` (show immediately), `"NEXT_SESSION"` (show on next app open), or `"EVENT"` (on specific event).
  - `event` (string, required if type=EVENT): Event name (e.g., `"viewed_product"`).
  - `label` (string, optional): Event label filter.
- `landing` (object, required): What to show. Keys:
  - `theme` (object): Styling (background, text colors, corner radius, etc.).
  - `image` (object, optional): Image URL, orientation (portrait/landscape).
  - `header` (string, optional): Header text.
  - `title` (string, optional): Title.
  - `body` (string): Body text (required).
  - `actions` (array, optional): CTA buttons (label, action, deeplink, etc.).
- `start_date` (ISO 8601, optional): UTC start time. XOR with `local_start_date`.
- `local_start_date` (ISO 8601, optional): User's local timezone start. XOR with `start_date`.
- `end_date` (ISO 8601, optional): UTC end time. XOR with `local_end_date`.
- `local_end_date` (ISO 8601, optional): User's local timezone end. XOR with `end_date`.
- `targeting` (object, optional): Segmentation (segments, cohorts, custom audiences).
- `labels` (array, optional): Up to 3 frequency-capping labels.

**Output**

```json
{
  "ok": true,
  "command": "in-app-campaigns create",
  "platform": "mep",
  "result": {
    "campaign_token": "iap_abc123def456",
    "raw": {
      "campaign_token": "iap_abc123def456"
    }
  }
}
```

**Example**

```bash
$batch-cep in-app-campaigns create '{
  "name": "Onboarding Banner",
  "trigger": { "type": "NEXT_SESSION" },
  "landing": {
    "theme": { "background_color": "#ffffff" },
    "title": "Welcome!",
    "body": "Complete your profile to unlock features.",
    "actions": [ { "label": "Get Started", "deeplink": "app://profile/edit" } ]
  },
  "start_date": "2026-05-13T00:00:00Z",
  "end_date": "2026-05-20T23:59:59Z",
  "targeting": { "segments": ["NEW"] }
}' --app-key ios-live
```

→ Output:
```json
{
  "ok": true,
  "command": "in-app-campaigns create",
  "platform": "mep",
  "result": {
    "campaign_token": "iap_xyz789",
    "raw": {
      "campaign_token": "iap_xyz789"
    }
  }
}
```

---

### `$batch-cep in-app-campaigns update <campaign_token> <patch-json> [--app-key]`

Update an existing in-app campaign (idempotent).

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `campaign_token` | string | Yes | Token from `in-app-campaigns create`. |
| `patch-json` | JSON object | Yes | Fields to update. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "in-app-campaigns update",
  "platform": "mep",
  "result": {
    "raw": {}
  }
}
```

**Example**

```bash
$batch-cep in-app-campaigns update iap_xyz789 '{ "name": "Onboarding Banner (Extended)" }'
```

---

### `$batch-cep in-app-campaigns delete <campaign_token> --confirm [--app-key]`

Permanently delete an in-app campaign. **DESTRUCTIVE** — requires `--confirm`.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `campaign_token` | string | Yes | Token from `in-app-campaigns create`. |
| `--confirm` | flag | Yes | Destructive gate. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "in-app-campaigns delete",
  "platform": "mep",
  "result": {
    "status": "deleted",
    "campaign_token": "iap_xyz789"
  }
}
```

**Example**

```bash
$batch-cep in-app-campaigns delete iap_xyz789 --confirm
```

---

### `$batch-cep in-app-campaigns view <campaign_token> [--app-key]`

Retrieve full in-app campaign details.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `campaign_token` | string | Yes | Token from `in-app-campaigns create`. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "in-app-campaigns view",
  "platform": "mep",
  "result": {
    "raw": {
      "campaign_token": "iap_xyz789",
      "name": "Onboarding Banner (Extended)",
      "trigger": { "type": "NEXT_SESSION" },
      "landing": {
        "theme": { "background_color": "#ffffff" },
        "title": "Welcome!",
        "body": "Complete your profile to unlock features."
      }
    }
  }
}
```

**Example**

```bash
$batch-cep in-app-campaigns view iap_xyz789
```

---

### `$batch-cep in-app-campaigns list [limit] [--app-key]`

List all in-app campaigns (optionally paginated).

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `limit` | int | No | Max results per page (default: 50). |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "in-app-campaigns list",
  "platform": "mep",
  "result": {
    "raw": [
      {
        "campaign_token": "iap_abc123",
        "name": "Campaign 1",
        "trigger": { "type": "NEXT_SESSION" }
      }
    ]
  }
}
```

**Example**

```bash
$batch-cep in-app-campaigns list 20
```

---

## Pitfalls

- **Mutually exclusive date fields:** Use EITHER `start_date` + `end_date` (UTC) OR `local_start_date` + `local_end_date` (user's local time). Never mix.
- **Max 3 labels:** Frequency capping via `labels` has a hard limit of 3 per campaign.
- **Targeting schema is pass-through:** Refer to Batch API docs for valid segments (NEW, ONE_TIME, ENGAGED, DORMANT, IMPORTED) and cohort syntax.
- **Landing must have `body`:** The message body is required; title, header, and image are optional.
- **Trigger event names:** If using `trigger.type = "EVENT"`, the event name must match what your app sends. Case-sensitive.

## See also

- [overview](../overview.md) — when to use MEP vs CEP
- [campaigns](campaigns.md) — mass push campaigns (different from in-app)
- [rate-limits](../rate-limits.md) — MEP rate limits
- [errors](../errors.md) — troubleshooting
