# Exports (MEP)

Request and manage data exports from MEP. Similar 3-command flow to CEP exports, but uses MEP authentication and app keys.

## Commands

### `$batch-cep exports create <export-type> [filter-json] [--app-key]`

Request an export of MEP data (async). Returns an export ID to poll via `exports view`.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `export-type` | string | Yes | Type of data to export (e.g., `"users"`, `"events"`, `"interactions"`). |
| `filter-json` | JSON object | No | Optional filters for the export. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Schema**

- `export_type` (string): Data category to export. Refer to Batch MEP docs for valid types.
- `filter` (object, optional): Export filters (pass-through to Batch schema).

**Output**

```json
{
  "ok": true,
  "command": "exports create",
  "platform": "mep",
  "result": {
    "status": "requested",
    "export_id": "exp_abc123def456",
    "next_step": "Call exports view with this export_id to poll status. Once status is 'ready', call exports view again to get the download_url."
  }
}
```

**Example**

```bash
$batch-cep exports create users --app-key ios-live
```

→ Output:
```json
{
  "ok": true,
  "command": "exports create",
  "platform": "mep",
  "result": {
    "status": "requested",
    "export_id": "exp_xyz789",
    "next_step": "Call exports view with this export_id to poll status. Once status is 'ready', call exports view again to get the download_url."
  }
}
```

With filter:

```bash
$batch-cep exports create users '{"segment":"engaged_users"}' --app-key ios-live
```

---

### `$batch-cep exports list [limit] [--app-key]`

List all export requests (optionally paginated).

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `limit` | int | No | Max results per page (default: 50). |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "exports list",
  "platform": "mep",
  "result": {
    "raw": [
      {
        "export_id": "exp_abc123",
        "export_type": "users",
        "status": "ready",
        "created_at": "2026-05-13T10:00:00Z"
      },
      {
        "export_id": "exp_xyz789",
        "export_type": "users",
        "status": "pending",
        "created_at": "2026-05-13T11:00:00Z"
      }
    ]
  }
}
```

**Example**

```bash
$batch-cep exports list 20
```

---

### `$batch-cep exports view <export_id> [--app-key]`

Check the status of an export. Once status is `"ready"`, the response includes a `download_url`.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `export_id` | string | Yes | Export ID from `exports create`. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output (pending)**

```json
{
  "ok": true,
  "command": "exports view",
  "platform": "mep",
  "result": {
    "status": "pending",
    "export_id": "exp_xyz789",
    "export_type": "users",
    "created_at": "2026-05-13T11:00:00Z"
  }
}
```

**Output (ready)**

```json
{
  "ok": true,
  "command": "exports view",
  "platform": "mep",
  "result": {
    "status": "ready",
    "export_id": "exp_xyz789",
    "export_type": "users",
    "created_at": "2026-05-13T11:00:00Z",
    "download_url": "https://batch-exports.s3.amazonaws.com/exp_xyz789.csv?sig=...",
    "expires_at": "2026-05-20T11:00:00Z"
  }
}
```

**Output (failed)**

```json
{
  "ok": true,
  "command": "exports view",
  "platform": "mep",
  "result": {
    "status": "failed",
    "export_id": "exp_xyz789",
    "error": "Invalid filter format"
  }
}
```

**Example**

```bash
$batch-cep exports view exp_xyz789
```

---

## Polling Workflow

Typical export flow:

```bash
# 1. Request export
$batch-cep exports create users --app-key ios-live
# Output: export_id = "exp_xyz789"

# 2. Poll status every 5-10 seconds until ready
$batch-cep exports view exp_xyz789 --app-key ios-live
# Output: status = "pending" → wait and retry

# 3. Once status = "ready", extract download_url
$batch-cep exports view exp_xyz789 --app-key ios-live
# Output: status = "ready", download_url = "https://..."

# 4. Download the file
curl -o export.csv "https://..."
```

---

## Pitfalls

- **Export is asynchronous:** You must poll `exports view` to check status. Typical export time: 30 seconds to several minutes depending on data volume.
- **Download URL expires:** Signed URLs typically have a 7-day expiration window. Save the file or data promptly.
- **Filter format is pass-through:** Refer to Batch MEP API documentation for valid filter shapes for each export type.
- **Export type determines fields:** Different export types (users, events, interactions) return different columns. Check Batch docs.

## See also

- [overview](../overview.md) — when to use MEP vs CEP
- [cep/exports](../cep/exports.md) — CEP exports (similar flow, different endpoint)
- [async-pattern](../async-pattern.md) — general async polling patterns
- [rate-limits](../rate-limits.md) — MEP rate limits
- [errors](../errors.md) — troubleshooting
