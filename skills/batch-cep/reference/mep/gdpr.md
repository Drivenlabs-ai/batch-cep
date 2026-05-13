# GDPR (MEP)

Create and manage GDPR access and erasure requests. Identify the subject by exactly one of `custom_id`, `install_id`, or `email`. Erasure is destructive and irreversible on Batch's side — your own systems must be cleaned separately.

## Commands

### `$batch-cep gdpr access-request <identifier-type> <identifier-value> <notification_email> [--app-key]`

Create a GDPR data access request. Batch exports the user's data and sends a download link to the email address.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `identifier-type` | enum | Yes | One of: `custom_id`, `install_id`, `email`. |
| `identifier-value` | string | Yes | The user's identifier. |
| `notification_email` | string | Yes | Email where Batch sends the download link. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Schema**

Identify the subject by exactly ONE of:
- `custom_id` (string, 1-512 chars): User's business identifier.
- `install_id` (string): Batch SDK–generated mobile install ID.
- `email` (string): User's email address.

**Output**

```json
{
  "ok": true,
  "command": "gdpr access-request",
  "platform": "mep",
  "result": {
    "status": "requested",
    "request_id": "req_abc123def456"
  }
}
```

**Example**

```bash
$batch-cep gdpr access-request custom_id user_123 data-request@example.com --app-key ios-live
```

→ Output:
```json
{
  "ok": true,
  "command": "gdpr access-request",
  "platform": "mep",
  "result": {
    "status": "requested",
    "request_id": "req_xyz789"
  }
}
```

---

### `$batch-cep gdpr erasure-request <identifier-type> <identifier-value> --confirm [--app-key]`

Create a GDPR data erasure request. **DESTRUCTIVE & IRREVERSIBLE** on Batch's side — requires `--confirm`. Your own systems must be cleaned separately.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `identifier-type` | enum | Yes | One of: `custom_id`, `install_id`, `email`. |
| `identifier-value` | string | Yes | The user's identifier. |
| `--confirm` | flag | Yes | Destructive gate. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "gdpr erasure-request",
  "platform": "mep",
  "result": {
    "status": "requested",
    "request_id": "req_abc123def456"
  }
}
```

**Example**

```bash
$batch-cep gdpr erasure-request custom_id user_123 --confirm --app-key ios-live
```

→ Output:
```json
{
  "ok": true,
  "command": "gdpr erasure-request",
  "platform": "mep",
  "result": {
    "status": "requested",
    "request_id": "req_xyz789"
  }
}
```

---

### `$batch-cep gdpr requests-list [status] [limit] [--app-key]`

List all GDPR requests (optionally filtered by status).

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `status` | enum | No | Filter by status: `pending`, `processing`, `completed`, `failed`. |
| `limit` | int | No | Max results per page (default: 50). |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "gdpr requests-list",
  "platform": "mep",
  "result": {
    "raw": [
      {
        "id": "req_abc123",
        "type": "access",
        "status": "completed",
        "identifier_type": "custom_id",
        "created_at": "2026-05-13T09:00:00Z"
      },
      {
        "id": "req_xyz789",
        "type": "erasure",
        "status": "pending",
        "identifier_type": "email",
        "created_at": "2026-05-13T10:00:00Z"
      }
    ]
  }
}
```

**Example**

```bash
$batch-cep gdpr requests-list completed 10
```

---

### `$batch-cep gdpr requests-view <request_id> [--app-key]`

Retrieve full details of a single GDPR request.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `request_id` | string | Yes | Request ID from `access-request`, `erasure-request`, or `requests-list`. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "gdpr requests-view",
  "platform": "mep",
  "result": {
    "raw": {
      "id": "req_abc123",
      "type": "access",
      "status": "completed",
      "identifier_type": "custom_id",
      "identifier_value": "user_123",
      "created_at": "2026-05-13T09:00:00Z",
      "completed_at": "2026-05-13T09:30:00Z",
      "download_url": "https://batch-exports.s3.amazonaws.com/req_abc123.zip?sig=...",
      "expires_at": "2026-05-20T09:30:00Z"
    }
  }
}
```

**Example**

```bash
$batch-cep gdpr requests-view req_abc123
```

---

## Pitfalls

- **Exactly one identifier:** You must provide exactly one of `custom_id`, `install_id`, or `email`. Mixed or missing identifiers are rejected.
- **Erasure is final on Batch's side:** The user's data is purged from Batch and cannot be recovered. You remain responsible for cleaning your own systems.
- **Download link expires:** Access request exports are signed URLs with an expiration window (typically 7 days). Save the download link or data promptly.
- **GDPR compliance:** Batch handles compliance on its side; you are responsible for:
  - Verifying the requester's identity (out of scope for this API).
  - Deleting the user's data in your own systems.
  - Documenting the request for audit trails.

## See also

- [overview](../overview.md) — when to use MEP vs CEP
- [identifiers](../identifiers.md) — identifier types and formats
- [rate-limits](../rate-limits.md) — MEP rate limits
- [errors](../errors.md) — troubleshooting
