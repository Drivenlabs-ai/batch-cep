# Exports (CEP)

Poll and download profile exports initiated by `profiles export`. Exports are asynchronous — you create an export, poll its status, then download when ready.

## Commands

### `$batch-cep exports list [--limit N] [--cursor C]`

List all profile exports with pagination.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `--limit` | Number | No | Max exports per page (default: server decides) |
| `--cursor` | String | No | Pagination cursor from previous response |

**Output**

```json
{
  "ok": true,
  "command": "exports list",
  "platform": "cep",
  "result": {
    "exports": [
      {
        "export_id": "exp_abc123",
        "status": "ready",
        "format": "csv",
        "types": ["attributes", "identifiers"],
        "row_count": 5000,
        "created_at": "2026-05-13T09:00:00Z",
        "completed_at": "2026-05-13T09:05:00Z"
      },
      {
        "export_id": "exp_def456",
        "status": "processing",
        "format": "csv",
        "types": ["attributes", "events"],
        "row_count": null,
        "created_at": "2026-05-13T10:00:00Z",
        "completed_at": null
      }
    ],
    "next_cursor": "cur_xyz789..."
  }
}
```

**Example**

```bash
$batch-cep exports list --limit 50
```

**Pitfalls**

- Exports are paginated — use `next_cursor` for more results
- `row_count` is null while export is processing
- Completed exports are retained for a limited time before deletion

---

### `$batch-cep exports view <export-id>`

Get detailed information about a single export, including status and progress.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `export-id` | String | Yes | Export ID from `profiles export` or `list` response |

**Output (processing)**

```json
{
  "ok": true,
  "command": "exports view",
  "platform": "cep",
  "result": {
    "export": {
      "export_id": "exp_abc123",
      "status": "processing",
      "format": "csv",
      "types": ["attributes", "identifiers"],
      "row_count": null,
      "progress_percent": 45,
      "created_at": "2026-05-13T10:00:00Z",
      "completed_at": null
    }
  }
}
```

**Output (ready)**

```json
{
  "ok": true,
  "command": "exports view",
  "platform": "cep",
  "result": {
    "export": {
      "export_id": "exp_abc123",
      "status": "ready",
      "format": "csv",
      "types": ["attributes", "identifiers"],
      "row_count": 5000,
      "download_url": "https://s3.batch.com/...",
      "created_at": "2026-05-13T10:00:00Z",
      "completed_at": "2026-05-13T10:05:00Z"
    }
  }
}
```

**Output (failed)**

```json
{
  "ok": true,
  "command": "exports view",
  "platform": "cep",
  "result": {
    "export": {
      "export_id": "exp_abc123",
      "status": "failed",
      "error": "Too many profiles — export exceeds size limit.",
      "created_at": "2026-05-13T10:00:00Z",
      "failed_at": "2026-05-13T10:30:00Z"
    }
  }
}
```

**Example**

```bash
$batch-cep exports view "exp_abc123"
```

**Polling loop example**

```bash
# Check status in a loop until ready
EXPORT_ID="exp_abc123"
while true; do
  $batch-cep exports view "$EXPORT_ID" > export_status.json
  STATUS=$(jq -r '.result.export.status' export_status.json)
  
  if [ "$STATUS" = "ready" ]; then
    echo "Export ready! Download with: \$batch-cep exports download $EXPORT_ID"
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Export failed!"
    break
  fi
  
  PROGRESS=$(jq -r '.result.export.progress_percent // empty' export_status.json)
  echo "Processing... ${PROGRESS}% complete"
  
  sleep 5
done
```

**Pitfalls**

- Status values: `processing`, `ready`, `failed`, `expired`
- Exports time out after a few hours — download within that window
- `progress_percent` is available only during processing

---

### `$batch-cep exports download <export-id>`

Download the export file. Returns a redirect URL to the signed S3 download link.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `export-id` | String | Yes | Export ID with `status: "ready"` |

**Output (redirect)**

```json
{
  "ok": true,
  "command": "exports download",
  "platform": "cep",
  "result": {
    "status": "redirect",
    "export_id": "exp_abc123",
    "download_url": "https://s3.batch.com/exports/exp_abc123/data.csv?X-Amz-Signature=...",
    "expires_at": "2026-05-13T11:00:00Z",
    "format": "csv"
  }
}
```

**Output (inline, if served directly)**

```json
{
  "ok": true,
  "command": "exports download",
  "platform": "cep",
  "result": {
    "status": "inline",
    "export_id": "exp_abc123",
    "body": "custom_id,attribute1,attribute2\nuser_1,value_a,value_b\n...",
    "format": "csv"
  }
}
```

**Example**

```bash
$batch-cep exports download "exp_abc123"
```

→ Output:
```json
{
  "ok": true,
  "command": "exports download",
  "platform": "cep",
  "result": {
    "status": "redirect",
    "export_id": "exp_abc123",
    "download_url": "https://s3.batch.com/exports/exp_abc123/data.csv?X-Amz-Signature=...",
    "expires_at": "2026-05-13T11:00:00Z",
    "format": "csv"
  }
}
```

**Manual download using the URL**

```bash
DOWNLOAD_URL=$(jq -r '.result.download_url' export_download.json)
curl -o profile_export.csv "$DOWNLOAD_URL"
```

**Pitfalls**

- Export must be in `ready` status first — call `exports view` to check
- Signed URLs expire within 1 hour — download immediately
- If status is `inline`, the CSV body is in the JSON response (not a redirect)
- Empty exports may return different format — check `result.format`

---

## See also

- [profiles](./profiles.md) — `profiles export` initiates the async export process
- [async-pattern](../async-pattern.md) — polling exports with status checks
- [rate-limits](../rate-limits.md) — rate limiting for export operations
- [errors](../errors.md) — troubleshooting 404 "export not found" and other errors
