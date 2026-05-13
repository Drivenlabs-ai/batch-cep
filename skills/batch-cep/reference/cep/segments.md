# Segments (CEP)

Query predefined segments (built-in user cohorts) configured in your Batch project. Segments are read-only and managed via the Batch dashboard.

## Commands

### `$batch-cep segments list`

List all available predefined segments in the project.

**Arguments**

None.

**Output**

```json
{
  "ok": true,
  "command": "segments list",
  "platform": "cep",
  "result": {
    "segments": [
      {
        "segment_id": "seg_new",
        "name": "New Users",
        "description": "Users who installed the app in the last 7 days",
        "criteria": "install_date >= now - 7d"
      },
      {
        "segment_id": "seg_active",
        "name": "Active Users",
        "description": "Users with an event in the last 24 hours",
        "criteria": "last_event_date >= now - 1d"
      },
      {
        "segment_id": "seg_inactive",
        "name": "Inactive Users",
        "description": "Users with no events in the last 30 days",
        "criteria": "last_event_date < now - 30d"
      },
      {
        "segment_id": "seg_engaged",
        "name": "Engaged Users",
        "description": "Users who have completed a purchase",
        "criteria": "custom_event:purchase"
      }
    ]
  }
}
```

**Example**

```bash
$batch-cep segments list
```

→ Output:
```json
{
  "ok": true,
  "command": "segments list",
  "platform": "cep",
  "result": {
    "segments": [
      {
        "segment_id": "seg_new",
        "name": "New Users",
        "description": "Users who installed the app in the last 7 days",
        "criteria": "install_date >= now - 7d"
      },
      {
        "segment_id": "seg_active",
        "name": "Active Users",
        "description": "Users with an event in the last 24 hours",
        "criteria": "last_event_date >= now - 1d"
      },
      {
        "segment_id": "seg_engaged",
        "name": "Engaged Users",
        "description": "Users who have completed a purchase",
        "criteria": "custom_event:purchase"
      }
    ]
  }
}
```

**Use in campaigns**

Segments are referenced by name in campaign targeting:

```bash
$batch-cep campaigns create '{
  "name": "Welcome Offer",
  "targeting": { "segment": "New Users" },
  "channels": {
    "push": {
      "title": "Welcome!",
      "body": "Get 20% off your first purchase."
    }
  }
}'
```

**Pitfalls**

- Segments are **read-only** via this CLI — manage them in the Batch dashboard
- Segment criteria are pass-through from dashboard — refer to Batch docs for syntax
- Segment membership is dynamic — users enter/leave segments based on criteria
- Using a non-existent segment in a campaign will cause validation errors

---

## See also

- [campaigns](./campaigns.md) — use segments in campaign targeting
- [audiences](./audiences.md) — static audiences (vs dynamic segments)
- [overview](../overview.md) — audiences vs segments in CEP
- [errors](../errors.md) — troubleshooting segment-related errors
