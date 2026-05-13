# Custom Data (MEP)

Store and manage custom attributes per Custom ID on the MEP platform. Use for app-specific metadata (preferences, scores, segments, etc.) that live in Batch, not your database.

## Commands

### `$batch-cep custom-data set <custom_id> <attributes-json> [--overwrite] [--app-key]`

Set or merge custom attributes for a user (idempotent).

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `custom_id` | string | Yes | User's unique ID (1-512 chars). |
| `attributes-json` | JSON object | Yes | Key/value pairs to set (e.g., `{"tier": "gold", "score": 100}`). |
| `--overwrite` | flag | No | Replace entire attribute set instead of merge. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Schema**

- `custom_id` (string, 1-512 chars): User identifier.
- `attributes` (object): Plain JSON object with any keys/values. To delete specific keys, pass `{key: null}`.

**Output**

```json
{
  "ok": true,
  "command": "custom-data set",
  "platform": "mep",
  "result": {
    "status": "set",
    "custom_id": "user_123"
  }
}
```

**Example (merge)**

```bash
$batch-cep custom-data set user_123 '{"tier": "gold", "loyalty_points": 500}'
```

→ Output:
```json
{
  "ok": true,
  "command": "custom-data set",
  "platform": "mep",
  "result": {
    "status": "set",
    "custom_id": "user_123"
  }
}
```

**Example (replace entire set with --overwrite)**

```bash
$batch-cep custom-data set user_123 '{"vip_status": true, "last_seen": "2026-05-13"}' --overwrite
```

**Example (delete specific keys)**

```bash
$batch-cep custom-data set user_123 '{"deprecated_key": null}'
```

---

### `$batch-cep custom-data delete <custom_id> --confirm [--app-key]`

Delete **all** custom attributes for a user. **DESTRUCTIVE & IRREVERSIBLE** — requires `--confirm`.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `custom_id` | string | Yes | User's unique ID. |
| `--confirm` | flag | Yes | Destructive gate. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "custom-data delete",
  "platform": "mep",
  "result": {
    "status": "deleted",
    "custom_id": "user_123"
  }
}
```

**Example**

```bash
$batch-cep custom-data delete user_123 --confirm
```

---

## Pitfalls

- **`set` is idempotent:** Calling `set` multiple times with the same payload produces the same end state — safe to retry.
- **`delete` is irreversible:** Removes all attributes for the user at once. For selective deletion, use `set {key: null}` instead.
- **No `--overwrite` by default:** `set` merges keys by default. Use `--overwrite` to replace the entire set.
- **Custom ID max 512 chars:** Longer IDs are rejected.
- **No structured validation:** Attributes are stored as-is (any JSON value). Batch doesn't validate schema.

## See also

- [overview](../overview.md) — when to use MEP vs CEP
- [app-data](app-data.md) — app-wide key/value store (different from per-user)
- [identifiers](../identifiers.md) — custom_id field
- [rate-limits](../rate-limits.md) — MEP rate limits
- [errors](../errors.md) — troubleshooting
