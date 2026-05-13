# Cross-platform fanout — iOS + Android + Web

**Scenario:** "Envoie une push à tous mes utilisateurs actifs sur iOS, Android et Web"

## The Batch reality

Each MEP call targets **one app key**, which maps to one platform. There is no "send to all platforms" in a single API call. Cross-platform = repeat the call per platform, each with its own `--app-key`.

## Transactional fanout

Same payload, 3 calls with 3 different `--app-key` values:

```bash
# iOS live
$batch-cep transactional send '{
  "group_id": "promo_may_fanout",
  "recipients": { "custom_ids": ["u_001", "u_002", "u_003"] },
  "message": { "title": "Offre exclusive", "body": "Valable 24h uniquement." },
  "priority": "high"
}' --app-key ios_live

# Android live
$batch-cep transactional send '{
  "group_id": "promo_may_fanout",
  "recipients": { "custom_ids": ["u_001", "u_002", "u_003"] },
  "message": { "title": "Offre exclusive", "body": "Valable 24h uniquement." },
  "priority": "high"
}' --app-key android_live

# Web push
$batch-cep transactional send '{
  "group_id": "promo_may_fanout",
  "recipients": { "custom_ids": ["u_001", "u_002", "u_003"] },
  "message": { "title": "Offre exclusive", "body": "Valable 24h uniquement." }
}' --app-key web
```

## Using a shared `group_id` for analytics

Pass the same `group_id` across all 3 calls. Batch rolls up stats per `group_id` within each app key, so you can compare delivery per platform:

```bash
# Check stats per platform after sending
$batch-cep transactional stats promo_may_fanout --app-key ios_live
$batch-cep transactional stats promo_may_fanout --app-key android_live
$batch-cep transactional stats promo_may_fanout --app-key web
```

Each call returns independent delivery numbers for that platform.

## Mass campaign fanout

Same pattern for `mep-campaigns`. Each `campaigns create` call produces its own `campaign_token`. 3 platforms = 3 distinct tokens.

```bash
# Step 1 — create draft campaign for each platform
$batch-cep campaigns create '{
  "name": "promo_may_ios",
  "state": "DRAFT",
  "when": { "once_at": "2026-05-14T10:00:00Z" },
  "targeting": { "segments": ["ENGAGED"] },
  "messages": [{ "channel": "push", "title": "Offre exclusive", "body": "Valable 24h." }]
}' --app-key ios_live
# → campaign_token: tok_ios_abc

$batch-cep campaigns create '{
  "name": "promo_may_android",
  "state": "DRAFT",
  "when": { "once_at": "2026-05-14T10:00:00Z" },
  "targeting": { "segments": ["ENGAGED"] },
  "messages": [{ "channel": "push", "title": "Offre exclusive", "body": "Valable 24h." }]
}' --app-key android_live
# → campaign_token: tok_and_xyz

$batch-cep campaigns create '{
  "name": "promo_may_web",
  "state": "DRAFT",
  "when": { "once_at": "2026-05-14T10:00:00Z" },
  "targeting": { "segments": ["ENGAGED"] },
  "messages": [{ "channel": "push", "title": "Offre exclusive", "body": "Valable 24h." }]
}' --app-key web
# → campaign_token: tok_web_def

# Step 2 — launch all 3
$batch-cep campaigns update tok_ios_abc '{ "state": "RUNNING" }' --app-key ios_live
$batch-cep campaigns update tok_and_xyz '{ "state": "RUNNING" }' --app-key android_live
$batch-cep campaigns update tok_web_def '{ "state": "RUNNING" }' --app-key web

# Step 3 — track each token independently
$batch-cep campaigns stats tok_ios_abc --app-key ios_live
$batch-cep campaigns stats tok_and_xyz --app-key android_live
$batch-cep campaigns stats tok_web_def --app-key web
```

## Pitfall — users counted per install, not per person

Different `app_keys` mean different recipient pools. A user who has both iOS and Android installs appears in **both** pools. If you target `custom_ids`, they will receive the push on each device where they are registered. This is by design for push, but factor it into your analytics — unique reach across platforms requires deduplication on your side.

## See also

- [transactional](../reference/mep/transactional.md) — full `transactional send` schema
- [campaigns (MEP)](../reference/mep/campaigns.md) — mass campaign creation and update
- [identifiers](../reference/identifiers.md) — recipient types and app key mapping
