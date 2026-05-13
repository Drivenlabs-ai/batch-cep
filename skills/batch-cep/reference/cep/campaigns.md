# Campaigns (CEP)

Create, update, and manage omnichannel campaigns. A single campaign can target multiple channels (push, email, SMS, in-app) simultaneously.

## Commands

### `$batch-cep campaigns create <data-json>`

Create a new campaign. The campaign is created in draft state. Set `state: "RUNNING"` in the data to launch immediately.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `data-json` | JSON object | Yes | Campaign definition with `name`, `targeting`, and `channels` |

**Schema**

```json
{
  "name": "string (1-255 chars, required)",
  "targeting": "object (required, can be empty {} for all users)",
  "channels": {
    "push": "object or null",
    "email": "object or null",
    "sms": "object or null",
    "in_app": "object or null"
  },
  "state": "string, optional (DRAFT | RUNNING — default DRAFT)",
  "display_name": "string, optional"
}
```

**Output**

```json
{
  "ok": true,
  "command": "campaigns create",
  "platform": "cep",
  "result": {
    "campaign_token": "cmp_abc123def456",
    "name": "Summer Sale",
    "state": "DRAFT",
    "created_at": "2026-05-13T10:00:00Z"
  }
}
```

**Example**

```bash
$batch-cep campaigns create '{
  "name": "Summer Sale",
  "targeting": { "segment": "active_users" },
  "channels": {
    "push": {
      "title": "Summer Sale!",
      "body": "Get 20% off this week."
    }
  }
}'
```

→ Output:
```json
{
  "ok": true,
  "command": "campaigns create",
  "platform": "cep",
  "result": {
    "campaign_token": "cmp_xyz789",
    "name": "Summer Sale",
    "state": "DRAFT",
    "created_at": "2026-05-13T10:00:00Z"
  }
}
```

**Launch immediately with state**

```bash
$batch-cep campaigns create '{
  "name": "Flash Deal",
  "targeting": {},
  "channels": {
    "push": { "title": "Flash Deal!", "body": "Limited time offer." }
  },
  "state": "RUNNING"
}'
```

**Pitfalls**

- `state: "RUNNING"` launches immediately — be sure targeting is correct before setting it
- `targeting` is pass-through — refer to [Batch CEP documentation](https://developer.batch.com) for advanced targeting schema
- At least one channel (push, email, sms, or in_app) must have a non-null value
- Campaign name must be 1–255 characters

---

### `$batch-cep campaigns update <campaign-token> [patch-json]`

Update campaign fields after creation. Can modify targeting, channels, state, display_name, etc.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `campaign-token` | String | Yes | Campaign token from `create` response |
| `patch-json` | JSON object | No | Partial update (e.g., `{ "state": "RUNNING" }`) |

**Output**

```json
{
  "ok": true,
  "command": "campaigns update",
  "platform": "cep",
  "result": {
    "campaign_token": "cmp_abc123def456",
    "name": "Summer Sale",
    "state": "RUNNING",
    "updated_at": "2026-05-13T10:30:00Z"
  }
}
```

**Example (launch a draft campaign)**

```bash
$batch-cep campaigns update "cmp_xyz789" '{ "state": "RUNNING" }'
```

**Example (update channels)**

```bash
$batch-cep campaigns update "cmp_xyz789" '{
  "channels": {
    "push": {
      "title": "Updated: Summer Sale!",
      "body": "Now 30% off!"
    }
  }
}'
```

**Pitfalls**

- Once a campaign is paused (`state: "PAUSED"` or stopped), resuming may not be supported — check Batch docs
- Modifying `targeting` after campaign is running may not apply retroactively to already-sent messages

---

### `$batch-cep campaigns delete <campaign-token> --confirm`

Delete a campaign. **Destructive operation** — requires `--confirm` flag.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `campaign-token` | String | Yes | Campaign token to delete |
| `--confirm` | Flag | Yes | Confirms destructive operation |

**Output**

```json
{
  "ok": true,
  "command": "campaigns delete",
  "platform": "cep",
  "result": {
    "campaign_token": "cmp_abc123def456",
    "status": "deleted"
  }
}
```

**Error (without --confirm)**

```json
{
  "ok": false,
  "command": "campaigns delete",
  "platform": "local",
  "error": {
    "http_status": null,
    "error_code": "CONFIRM_REQUIRED",
    "error_message": "Destructive operation requires --confirm flag.",
    "endpoint": null,
    "retryable": false,
    "hint": "Re-run with --confirm to proceed. This permanently deletes the campaign."
  }
}
```

**Example**

```bash
$batch-cep campaigns delete "cmp_xyz789" --confirm
```

**Pitfalls**

- Requires `--confirm` flag — script exits with error without it
- Deletion is permanent — deleted campaigns cannot be recovered
- Running campaigns can be deleted (if Batch allows) — consider pausing first

---

## See also

- [overview](../overview.md) — CEP campaigns vs MEP campaigns
- [rate-limits](../rate-limits.md) — campaign creation rate limits
- [errors](../errors.md) — troubleshooting 400/401/404 errors
