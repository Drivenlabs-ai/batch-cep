# Transactional (MEP)

Send 1-to-1 push notifications triggered by user actions. Use for order confirmations, password resets, new message alerts, and any notification that fires in response to something a user did—not mass campaigns.

## Commands

### `$batch-cep transactional send <payload-json>`

Fire a transactional push notification to a specific list of recipients.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `payload-json` | JSON object | Yes | Push payload with `group_id`, `recipients`, and `message`. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Schema**

Each push requires:
- `group_id` (string, 1-128 chars, `[A-Za-z0-9_-]`): Analytics grouping key. Multiple sends with the same group_id roll up in stats.
- `recipients` (object): At least one of `tokens` (raw push tokens), `custom_ids`, `install_ids`, or `advertising_ids`. Max 10,000 recipients per call.
- `message` (object, XOR with `messages`): `title` (string) and `body` (string, required).
- `messages` (object, XOR with `message`): Localized messages, e.g., `{"en": {...}, "fr": {...}}`.
- `priority` (enum): `"normal"` | `"high"` (iOS default high; Android default normal).
- `time_to_live` (int): Seconds, 0 < ttl ≤ 28 days.
- `push_type` (enum): `"alert"` (default) | `"background"` (silent push; disallows `message` + `media`).
- `labels` (array): Up to 3 frequency-capping labels (ignored for raw tokens).
- `sandbox` (bool): iOS APNS sandbox mode (no effect on Android or Custom IDs).
- `media` (object): `icon`, `picture`, `audio`, `video` URLs (HTTPS, HEAD-supporting).
- `deeplink` (string, XOR with `landing`): Deep link target.
- `landing` (object, XOR with `deeplink`): Mobile landing page (theme, image, header, title, body, actions).
- `custom_payload` (string): JSON string for custom data (paid plans only; reserved keys like `com.batch` silently dropped).
- `gcm_collapse_key` (object): Android offline coalescing (up to 3).
- `skip_media_check` (bool): Skip HEAD probe on media URLs.
- `wp_template` (enum): Windows 8.1 (`"legacy"`) | UWP (`"generic"`).

**Output**

```json
{
  "ok": true,
  "command": "transactional send",
  "platform": "mep",
  "result": {
    "status": "sent",
    "notification_id": "notif_abc123def456",
    "raw": {
      "notification_id": "notif_abc123def456"
    }
  }
}
```

**Example**

```bash
$batch-cep transactional send '{
  "group_id": "order_confirmed",
  "recipients": { "custom_ids": ["user_123"] },
  "message": { "title": "Order Confirmed", "body": "Your order #5678 is confirmed!" },
  "priority": "high"
}' --app-key ios-live
```

→ Output:
```json
{
  "ok": true,
  "command": "transactional send",
  "platform": "mep",
  "result": {
    "status": "sent",
    "notification_id": "notif_xyz789",
    "raw": {
      "notification_id": "notif_xyz789"
    }
  }
}
```

---

### `$batch-cep transactional stats <group_id> [--app-key]`

Fetch delivery stats for a transactional send group.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `group_id` | string | Yes | Analytics key from the original send. |
| `--app-key` | string | No | App key alias (default: `default_app_key` from credentials). |

**Output**

```json
{
  "ok": true,
  "command": "transactional stats",
  "platform": "mep",
  "result": {
    "raw": {
      "sent": 5,
      "error": 0,
      "delivered": 4
    }
  }
}
```

**Example**

```bash
$batch-cep transactional stats order_confirmed
```

→ Output:
```json
{
  "ok": true,
  "command": "transactional stats",
  "platform": "mep",
  "result": {
    "raw": {
      "sent": 5,
      "error": 0,
      "delivered": 4
    }
  }
}
```

---

## Pitfalls

- **iOS silent push:** `push_type: "background"` (iOS 13+) disallows `message` and `media` — send only the deeplink or landing.
- **`labels` on raw tokens:** Frequency capping via `labels` is ignored if you target raw push tokens. Use `custom_ids` or `install_ids` instead.
- **`custom_payload` is paid-only:** On non-paid plans, reserved keys like `com.batch` and FCM-forbidden keys are silently dropped. Ask Batch support if unsure.
- **Recipients limit:** Max 10,000 per call. For larger audiences, split into multiple calls or use mass campaigns instead.
- **XOR fields:** Exactly one of `message` or `messages`; exactly one of `deeplink` or `landing` (or neither).

## See also

- [overview](../overview.md) — when to use MEP vs CEP
- [identifiers](../identifiers.md) — recipient types (`tokens`, `custom_ids`, etc.)
- [rate-limits](../rate-limits.md) — MEP rate limits
- [errors](../errors.md) — troubleshooting
