# Custom Audience (MEP)

Build install-ID-scoped audiences for MEP (mobile app installations). **v1.1 install-ID only** — for profile-level / cross-channel audiences, use CEP [audiences](../cep/audiences.md) instead.

## Commands

### `$batch-cep custom-audience create <name> <install_ids-json> [--app-key]`

Create a new custom audience from a list of install IDs.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Audience name (1-255 chars, no special chars). |
| `install_ids-json` | JSON array | Yes | Array of install IDs (strings, max 50,000 per call). |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Schema**

- `name` (string, 1-255 chars, no special chars): Audience identifier.
- `install_ids` (array): Install IDs (1-255 chars each). Max 50,000 per call.

**Output**

```json
{
  "ok": true,
  "command": "custom-audience create",
  "platform": "mep",
  "result": {
    "audience_id": "aud_abc123def456",
    "raw": {
      "id": "aud_abc123def456"
    }
  }
}
```

**Example**

```bash
$batch-cep custom-audience create my_segment '["install_1", "install_2", "install_3"]' --app-key ios-live
```

→ Output:
```json
{
  "ok": true,
  "command": "custom-audience create",
  "platform": "mep",
  "result": {
    "audience_id": "aud_xyz789",
    "raw": {
      "id": "aud_xyz789"
    }
  }
}
```

---

### `$batch-cep custom-audience update <audience_id> <install_ids-json> [--app-key]`

Add or update install IDs in an existing audience (merge semantics).

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `audience_id` | string | Yes | ID from `custom-audience create`. |
| `install_ids-json` | JSON array | Yes | Install IDs to add/merge (max 50,000 per call). |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "custom-audience update",
  "platform": "mep",
  "result": {
    "raw": {}
  }
}
```

**Example**

```bash
$batch-cep custom-audience update aud_xyz789 '["install_4", "install_5"]'
```

---

### `$batch-cep custom-audience replace <audience_id> <install_ids-json> --confirm [--app-key]`

Replace all install IDs in an audience with a new list (overwrites existing). **DESTRUCTIVE** — requires `--confirm`.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `audience_id` | string | Yes | ID from `custom-audience create`. |
| `install_ids-json` | JSON array | Yes | New install IDs list (max 50,000). |
| `--confirm` | flag | Yes | Destructive gate. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "custom-audience replace",
  "platform": "mep",
  "result": {
    "status": "replaced",
    "audience_id": "aud_xyz789"
  }
}
```

**Example**

```bash
$batch-cep custom-audience replace aud_xyz789 '["install_100", "install_101"]' --confirm
```

---

### `$batch-cep custom-audience remove <audience_id> --confirm [--app-key]`

Permanently delete an audience. **DESTRUCTIVE** — requires `--confirm`.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `audience_id` | string | Yes | ID from `custom-audience create`. |
| `--confirm` | flag | Yes | Destructive gate. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "custom-audience remove",
  "platform": "mep",
  "result": {
    "status": "deleted",
    "audience_id": "aud_xyz789"
  }
}
```

**Example**

```bash
$batch-cep custom-audience remove aud_xyz789 --confirm
```

---

### `$batch-cep custom-audience list [limit] [--app-key]`

List all custom audiences (optionally paginated).

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `limit` | int | No | Max results per page (default: 50). |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "custom-audience list",
  "platform": "mep",
  "result": {
    "raw": [
      {
        "id": "aud_abc123",
        "name": "my_segment",
        "size": 3
      }
    ]
  }
}
```

**Example**

```bash
$batch-cep custom-audience list
```

---

### `$batch-cep custom-audience view <audience_id> [--app-key]`

Retrieve full audience details.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `audience_id` | string | Yes | ID from `custom-audience create`. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "custom-audience view",
  "platform": "mep",
  "result": {
    "raw": {
      "id": "aud_xyz789",
      "name": "my_segment",
      "size": 5,
      "created_at": "2026-05-13T10:00:00Z"
    }
  }
}
```

**Example**

```bash
$batch-cep custom-audience view aud_xyz789
```

---

## Pitfalls

- **Install ID only (v1.1):** This endpoint works ONLY with install IDs (from the Batch SDK). For profile-level audiences (custom_id, email), use CEP [audiences](../cep/audiences.md).
- **Max 50,000 per call:** For larger audiences, split into multiple calls.
- **`replace` is destructive:** Install IDs not in the new list are removed. Requires `--confirm`.
- **Audience name no special chars:** Use alphanumeric and underscore only (e.g., `my_segment`, not `my-segment!`).
- **Installation-ID identifiers silently dropped:** If you send `custom_id` or email to MEP endpoints, they are silently ignored. Use the correct API for the identifier type.

## See also

- [overview](../overview.md) — CEP vs MEP audience distinctions
- [cep/audiences](../cep/audiences.md) — profile-level audiences (custom_id, email)
- [identifiers](../identifiers.md) — install_id vs custom_id
- [rate-limits](../rate-limits.md) — MEP rate limits
- [errors](../errors.md) — troubleshooting
