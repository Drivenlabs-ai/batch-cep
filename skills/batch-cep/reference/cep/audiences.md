# Audiences (CEP)

Create, update, and manage audiences (segments of users) for targeting campaigns and analytics. Audiences are indexed asynchronously — all mutation operations return a 202 status with an `indexing_token` for polling progress.

## Commands

### `$batch-cep audiences create <name> <type> [display-name]`

Create a new audience with a given type (the identifier set the audience will hold).

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `name` | String | Yes | Audience name: `[A-Za-z0-9_-]{1,255}`. Case-sensitive, immutable. |
| `type` | String | Yes | One of: `custom_ids`, `emails`, `install_ids` |
| `display-name` | String | No | Human-readable name for dashboards (can be changed later) |

**Output**

```json
{
  "ok": true,
  "command": "audiences create",
  "platform": "cep",
  "result": {
    "status": "accepted",
    "indexing_token": "idx_tok_abc123...",
    "next_step": "Call `audiences view <indexing_token>` to poll indexing status. Indexing typically completes in 30s-5min depending on size."
  }
}
```

**Example**

```bash
$batch-cep audiences create "premium_users" "custom_ids" "Premium Tier Users"
```

→ Output:
```json
{
  "ok": true,
  "command": "audiences create",
  "platform": "cep",
  "result": {
    "status": "accepted",
    "indexing_token": "idx_tok_xyz789",
    "next_step": "Call `audiences view <indexing_token>` to poll indexing status. Indexing typically completes in 30s-5min depending on size."
  }
}
```

**Pitfalls**

- Audience name is **immutable** after creation — choose carefully
- Name must match `[A-Za-z0-9_-]`, no spaces or special characters
- For MEP (Mobile Engagement Platform) audiences, use `mep-custom-audience` instead
- Indexing is async — use the returned `indexing_token` to poll status

---

### `$batch-cep audiences update <name> <ids-json>`

Add IDs to an existing audience. IDs are merged (appended).

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `name` | String | Yes | Target audience name (must exist) |
| `ids-json` | JSON array | Yes | Array of ID strings to add: `["id1", "id2", ...]` |

**Output**

```json
{
  "ok": true,
  "command": "audiences update",
  "platform": "cep",
  "result": {
    "status": "accepted",
    "indexing_token": "idx_tok_...",
    "next_step": "Call `audiences view <indexing_token>` to poll indexing status. Indexing typically completes in 30s-5min depending on size."
  }
}
```

**Example**

```bash
$batch-cep audiences update "premium_users" '["user_789", "user_790", "user_791"]'
```

→ Output:
```json
{
  "ok": true,
  "command": "audiences update",
  "platform": "cep",
  "result": {
    "status": "accepted",
    "indexing_token": "idx_tok_def456",
    "next_step": "Call `audiences view <indexing_token>` to poll indexing status. Indexing typically completes in 30s-5min depending on size."
  }
}
```

**Pitfalls**

- This **merges** IDs — does not overwrite. Use `replace` for full overwrite
- Indexing is async — poll with `audiences view <token>`
- Each update incurs a rate limit per Custom ID — batch adds together if possible

---

### `$batch-cep audiences replace <name> <ids-json> --confirm`

Replace all IDs in an audience. Non-listed IDs are removed (full overwrite). **Destructive** — requires `--confirm` flag because it can drop members not in the new list.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `name` | String | Yes | Target audience name (must exist) |
| `ids-json` | JSON array | Yes | Complete list of IDs: `["id1", "id2", ...]` (all others removed) |
| `--confirm` | Flag | Yes | Confirms destructive overwrite |

**Output**

```json
{
  "ok": true,
  "command": "audiences replace",
  "platform": "cep",
  "result": {
    "status": "accepted",
    "indexing_token": "idx_tok_...",
    "next_step": "Call `audiences view <indexing_token>` to poll indexing status. Indexing typically completes in 30s-5min depending on size."
  }
}
```

**Error (without --confirm)**

```json
{
  "ok": false,
  "command": "audiences replace",
  "platform": "local",
  "error": {
    "http_status": null,
    "error_code": "CONFIRM_REQUIRED",
    "error_message": "Destructive operation requires --confirm flag.",
    "endpoint": null,
    "retryable": false,
    "hint": "Re-run with --confirm to proceed. This removes ids from the audience permanently."
  }
}
```

**Example**

```bash
$batch-cep audiences replace "premium_users" '["new_user_1", "new_user_2"]' --confirm
```

→ After indexing completes, the audience contains **only** `new_user_1` and `new_user_2`. Any previous members are removed.

**Pitfalls**

- This is a **full overwrite** — requires `--confirm` because any ID not in the list is removed from the audience
- Use `update` if you want to append instead

---

### `$batch-cep audiences remove <name> <ids-json> --confirm`

Remove IDs from an audience. **Destructive operation** — requires `--confirm` flag.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `name` | String | Yes | Target audience name (must exist) |
| `ids-json` | JSON array | Yes | Array of IDs to remove: `["id1", "id2", ...]` |
| `--confirm` | Flag | Yes | Confirms destructive operation |

**Output**

```json
{
  "ok": true,
  "command": "audiences remove",
  "platform": "cep",
  "result": {
    "status": "accepted",
    "indexing_token": "idx_tok_...",
    "next_step": "Call `audiences view <indexing_token>` to poll indexing status. Indexing typically completes in 30s-5min depending on size."
  }
}
```

**Error (without --confirm)**

```json
{
  "ok": false,
  "command": "audiences remove",
  "platform": "local",
  "error": {
    "http_status": null,
    "error_code": "CONFIRM_REQUIRED",
    "error_message": "Destructive operation requires --confirm flag.",
    "endpoint": null,
    "retryable": false,
    "hint": "Re-run with --confirm to proceed. This removes ids from the audience permanently."
  }
}
```

**Example**

```bash
$batch-cep audiences remove "premium_users" '["user_789"]' --confirm
```

**Pitfalls**

- Requires `--confirm` flag — script exits with error without it
- Removal is async — use `audiences view <token>` to poll completion
- Removed IDs can be re-added with `update` or `replace`

---

### `$batch-cep audiences list [--limit N] [--cursor C]`

List all audiences in the project with pagination support.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `--limit` | Number | No | Max audiences per page (default: server decides) |
| `--cursor` | String | No | Pagination cursor from previous response |

**Output**

```json
{
  "ok": true,
  "command": "audiences list",
  "platform": "cep",
  "result": {
    "audiences": [
      {
        "id": "aud_123",
        "name": "premium_users",
        "type": "custom_ids",
        "display_name": "Premium Tier Users",
        "size": 5000,
        "created_at": "2026-05-01T12:00:00Z",
        "updated_at": "2026-05-13T10:30:00Z"
      }
    ],
    "next_cursor": "cur_abc123..."
  }
}
```

**Example**

```bash
$batch-cep audiences list --limit 50
```

**Pitfalls**

- Results are paginated — use `next_cursor` to fetch more
- Audience sizes may be stale (cached) — use `view` for real-time count

---

### `$batch-cep audiences view <name-or-token>`

Get details of a single audience. Accepts either an audience name (for completed audiences) or an `indexing_token` (to poll async indexing progress).

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `name-or-token` | String | Yes | Audience name (e.g., `premium_users`) OR `indexing_token` from a create/update/replace/remove call |

**Output (audience view)**

```json
{
  "ok": true,
  "command": "audiences view",
  "platform": "cep",
  "result": {
    "audience": {
      "id": "aud_123",
      "name": "premium_users",
      "type": "custom_ids",
      "display_name": "Premium Tier Users",
      "size": 5000,
      "created_at": "2026-05-01T12:00:00Z",
      "updated_at": "2026-05-13T10:30:00Z"
    }
  }
}
```

**Output (indexing_token poll)**

```json
{
  "ok": true,
  "command": "audiences view",
  "platform": "cep",
  "result": {
    "status": "indexing",
    "indexing_token": "idx_tok_abc123",
    "progress_percent": 45
  }
}
```

Or when complete:

```json
{
  "ok": true,
  "command": "audiences view",
  "platform": "cep",
  "result": {
    "status": "complete",
    "audience": { /* full audience object */ }
  }
}
```

**Example (by name)**

```bash
$batch-cep audiences view "premium_users"
```

**Example (by token — polling)**

```bash
$batch-cep audiences view "idx_tok_abc123"
```

→ If still indexing:
```json
{
  "ok": true,
  "command": "audiences view",
  "platform": "cep",
  "result": {
    "status": "indexing",
    "indexing_token": "idx_tok_abc123",
    "progress_percent": 75
  }
}
```

**Pitfalls**

- Length heuristic: tokens > 64 chars are treated as `indexing_token`; shorter names as `audience name`
- Indexing time varies: typically 30s–5min, can be longer for large audiences
- Once indexing completes, you can use the audience name for subsequent calls

---

## Per-call limits

The CEP audiences API accepts a large but bounded number of IDs per call. Empirically:

- `audiences update` and `audiences replace` accept up to ~50,000 IDs per call reliably. Beyond that, expect 413 (payload too large) or 422 (validation).
- For audiences > 50k IDs, chunk into multiple `update` calls (each adds members; `replace` overwrites — call it once with the full set).
- Each call returns its own `indexing_token`. Poll each separately.
- The audience's indexing time scales with total membership, not per-call size. A 500k-member audience takes minutes to index.

See `examples/audience-csv-membership.md` for a complete walkthrough of syncing a large CSV of IDs into an audience.

## See also

- [overview](../overview.md) — when to use CEP audiences vs MEP custom-audiences
- [async-pattern](../async-pattern.md) — detailed explanation of 202 responses and indexing_token polling
- [rate-limits](../rate-limits.md) — how audience mutations interact with rate limits
- [errors](../errors.md) — troubleshooting 401, 404, 429 responses
