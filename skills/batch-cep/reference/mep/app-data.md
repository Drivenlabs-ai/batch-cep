# App Data (MEP)

Store and manage app-wide key/value pairs on the MEP platform. Use for global settings, feature flags, analytics counters, etc. that live in Batch, not your database.

## Commands

### `$batch-cep app-data set <key> <value-json> [--app-key]`

Create a new app-data key (fails if exists). For idempotent set-or-update, use `update` instead.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | Key name (1-255 chars, `[A-Za-z0-9_-]`). |
| `value-json` | JSON | Yes | Any JSON-serializable value (string, number, object, array, null). |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Schema**

- `key` (string, 1-255 chars, `[A-Za-z0-9_-]`): Unique key identifier.
- `value` (JSON): Any value — string, number, boolean, object, array, null.

**Output**

```json
{
  "ok": true,
  "command": "app-data set",
  "platform": "mep",
  "result": {
    "status": "set",
    "key": "feature_flag_dark_mode"
  }
}
```

**Example**

```bash
$batch-cep app-data set feature_flag_dark_mode '{"enabled": true, "rollout_pct": 50}'
```

→ Output:
```json
{
  "ok": true,
  "command": "app-data set",
  "platform": "mep",
  "result": {
    "status": "set",
    "key": "feature_flag_dark_mode"
  }
}
```

---

### `$batch-cep app-data update <key> <value-json> [--app-key]`

Update an existing app-data key (patch semantics if value is object). Idempotent.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | Key name. |
| `value-json` | JSON | Yes | New value (replaces old value). |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "app-data update",
  "platform": "mep",
  "result": {
    "status": "updated",
    "key": "feature_flag_dark_mode"
  }
}
```

**Example**

```bash
$batch-cep app-data update feature_flag_dark_mode '{"enabled": false, "rollout_pct": 0}'
```

---

### `$batch-cep app-data list [--app-key]`

Retrieve all app-data key/value pairs.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "app-data list",
  "platform": "mep",
  "result": {
    "raw": [
      {
        "key": "feature_flag_dark_mode",
        "value": { "enabled": false, "rollout_pct": 0 }
      },
      {
        "key": "maintenance_mode",
        "value": false
      }
    ]
  }
}
```

**Example**

```bash
$batch-cep app-data list
```

---

### `$batch-cep app-data delete <key> --confirm [--app-key]`

Delete an app-data key. **DESTRUCTIVE** — requires `--confirm`.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | Key name. |
| `--confirm` | flag | Yes | Destructive gate. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "app-data delete",
  "platform": "mep",
  "result": {
    "status": "deleted",
    "key": "feature_flag_dark_mode"
  }
}
```

**Example**

```bash
$batch-cep app-data delete feature_flag_dark_mode --confirm
```

---

## Pitfalls

- **`set` fails if key exists:** Use `update` for idempotent upsert. Use `set` only when you need to enforce key uniqueness.
- **Key regex `[A-Za-z0-9_-]`:** Only alphanumeric, underscore, hyphen. No spaces or special chars.
- **Value is replaced, not merged:** Unlike `set`, if the value is an object and you call `update`, the entire object is replaced (not shallow-merged).
- **No size limits documented:** Batch may have limits on total app-data size — contact support if needed.

## See also

- [overview](../overview.md) — when to use MEP vs CEP
- [custom-data](custom-data.md) — per-user attributes (different from app-wide)
- [rate-limits](../rate-limits.md) — MEP rate limits
- [errors](../errors.md) — troubleshooting
