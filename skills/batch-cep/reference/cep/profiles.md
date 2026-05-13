# Profiles (CEP)

Manage user profiles and their attributes, identifiers, and events. Profiles represent individual users in your customer engagement platform, identified by either a Custom ID or an Installation ID.

## Commands

### `$batch-cep profiles update <edits-json>`

Update profiles incrementally. The body is **always an array**, even for a single profile update.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `edits-json` | JSON array | Yes | Array of profile edits with `identifiers`, `attributes`, and/or `events`. |

**Schema (per edit object)**

Each edit must have:
- `identifiers` (required): Object with exactly ONE of:
  - `custom_id` (string): User's unique identifier in your system
  - `installation` (object): `{ apikey, installation_id }` for in-app users
- `attributes` (optional): Plain object of custom attributes (e.g., `{ tier: "gold", location: "NYC" }`)
- `events` (optional): Array of events (max 15 per edit), each with `name` (string), `value` (number, optional), and `label` (string, optional)

**Limits**

- Max 200 edits per call
- Max 15 events per edit
- Rate limit: 300 requests per second **per Custom ID processed**

**Output**

```json
{
  "ok": true,
  "command": "profiles update",
  "platform": "cep",
  "result": {
    "status": "applied",
    "count": 2
  }
}
```

**Example**

```bash
$batch-cep profiles update '[
  {
    "identifiers": { "custom_id": "user_123" },
    "attributes": { "tier": "premium", "language": "en" },
    "events": [ { "name": "login", "label": "mobile" } ]
  },
  {
    "identifiers": { "custom_id": "user_456" },
    "attributes": { "last_purchase_date": "2026-05-13" }
  }
]'
```

→ Output:
```json
{
  "ok": true,
  "command": "profiles update",
  "platform": "cep",
  "result": {
    "status": "applied",
    "count": 2
  }
}
```

**Pitfalls**

- Body must always be a JSON array, even for 1 profile — `[{...}]`, not `{...}`
- Rate limit is **per Custom ID**, not per request — batch edits for different IDs together
- Installation IDs and email identifiers are silently dropped if you include them — use `custom_id` for Primary CEP flow
- Event names must match `[a-z0-9_]`, max 30 chars

---

### `$batch-cep profiles mass-update <edits-json>`

Mass update profiles for daily syncs and large-scale changes. Same schema as `update`, but allows up to 10,000 edits per call and is optimized for off-peak bulk operations.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `edits-json` | JSON array | Yes | Array of profile edits (same schema as `update`). |

**Limits**

- Max 10,000 edits per call (vs 200 for `update`)
- Same 15 events per edit limit
- Rate limit: 300 requests per second **per Custom ID processed**

**Output**

```json
{
  "ok": true,
  "command": "profiles mass-update",
  "platform": "cep",
  "result": {
    "status": "applied",
    "count": 5000
  }
}
```

**Example**

Use for CSV import or daily sync workflows:

```bash
$batch-cep profiles mass-update '[
  { "identifiers": { "custom_id": "user_1" }, "attributes": { "synced_at": "2026-05-13T10:00:00Z" } },
  { "identifiers": { "custom_id": "user_2" }, "attributes": { "synced_at": "2026-05-13T10:00:00Z" } }
]' # ... (continue for up to 10,000)
```

**Pitfalls**

- Use `mass-update` for daily syncs and batch imports; use `update` for real-time individual changes
- Still respects the same rate limit as `update` — Batch throttles by Custom ID processed
- Not recommended for streaming workflows — there is no async pattern here, call completes synchronously

---

### `$batch-cep profiles export <types> [filter-json]`

Export profile data asynchronously. Returns an export ID that you poll via `$batch-cep exports view` to track status.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `types` | Comma-separated string | Yes | One or more of: `attributes`, `custom_attributes`, `identifiers`, `events` |
| `filter-json` | JSON object | No | Filter by segment, cohort, or custom criteria (pass-through to Batch schema) |

**Output**

```json
{
  "ok": true,
  "command": "profiles export",
  "platform": "cep",
  "result": {
    "status": "requested",
    "export_id": "exp_abc123def456",
    "next_step": "Call cep_exports_view with this export_id to poll status. Once status is 'ready', call cep_exports_download to retrieve the signed URL."
  }
}
```

**Example**

```bash
$batch-cep profiles export "attributes,identifiers"
```

→ Output:
```json
{
  "ok": true,
  "command": "profiles export",
  "platform": "cep",
  "result": {
    "status": "requested",
    "export_id": "exp_12345abcde",
    "next_step": "Call cep_exports_view with this export_id to poll status. Once status is 'ready', call cep_exports_download to retrieve the signed URL."
  }
}
```

With filter:

```bash
$batch-cep profiles export "attributes,events" '{"segment":"premium_users"}'
```

**Pitfalls**

- Export is asynchronous — you must poll `$batch-cep exports view <export_id>` to check status
- Typical export time: 30 seconds to several minutes depending on user count
- Valid types: `attributes`, `custom_attributes`, `identifiers`, `events` — any other value raises a validation error
- Filter format is pass-through — refer to [Batch CEP documentation](https://developer.batch.com) for valid filter shapes

---

## Event date-range filter for exports

When using `$batch-cep profiles export "events"` to export event history (e.g., for an annual GDPR audit), you can filter by date range via the `filter-json` arg:

```bash
$batch-cep profiles export "events" '{
  "events": {
    "after": "2025-05-13T00:00:00Z",
    "before": "2026-05-13T00:00:00Z"
  }
}'
```

The exact filter shape is determined by Batch's export API — the plugin passes the filter through verbatim. Consult Batch developer docs for the full filter schema (segment filtering, attribute filtering, etc.).

## See also

- [overview](../overview.md) — when to use CEP vs MEP
- [identifiers](../identifiers.md) — details on `custom_id` vs `installation_id` vs native attributes
- [rate-limits](../rate-limits.md) — rate limiting by Custom ID processed, not by request
- [async-pattern](../async-pattern.md) — polling exports and audience indexing with `indexing_token`
- [errors](../errors.md) — troubleshooting common validation and auth errors
