# Example: Create an Abandoned Cart Campaign

A realistic workflow showing how to create and launch an omnichannel campaign targeting users who abandoned their carts in the last 24 hours.

## User Request

> "Crée une campagne push pour les utilisateurs qui ont abandonné leur panier dans les 24h"

Translation: "Create a push campaign for users who abandoned their cart in the last 24 hours"

## Step-by-Step: What Claude Does

### 1. Understand Intent

Claude recognizes:
- **Action:** Create a marketing campaign
- **Channel:** Push notifications
- **Audience:** Abandoned cart users (last 24h)
- **Platform:** CEP (Customer Engagement Platform) — profile-centric, not install-based

### 2. Check Prerequisites

Claude verifies:
- ✅ Credentials exist (`batch-credentials.json`)
- ✅ CEP has the audience or we need to create it

### 3. Option A: Audience Already Exists

Claude asks: "Do you have an audience in Batch for 'abandoned_cart_24h'?"

If **yes**, skip to Step 5.

### 4. Option B: Create Audience First

If **no**, Claude creates a new audience:

```bash
$batch-cep audiences create "abandoned_cart_24h" "custom_ids" "Abandoned Cart (24h)"
```

**Output:**

```json
{
  "ok": true,
  "command": "audiences create",
  "platform": "cep",
  "result": {
    "status": "accepted",
    "indexing_token": "idx_tok_abc123xyz789...",
    "next_step": "Call `audiences view <indexing_token>` to poll indexing status. Indexing typically completes in 30s-5min depending on size."
  }
}
```

Claude reports:

> **Audience created.** Token: `idx_tok_abc123xyz789...`
>
> The audience is now indexing. It will be ready in 30 seconds to 5 minutes depending on how many users are in it.
> Polling status now...

### 5. Poll Audience Indexing (if just created)

Claude polls the indexing status:

```bash
$batch-cep audiences view "idx_tok_abc123xyz789..."
```

Responses during indexing:

```json
{
  "ok": true,
  "command": "audiences view",
  "platform": "cep",
  "result": {
    "status": "indexing",
    "indexing_token": "idx_tok_abc123xyz789...",
    "progress_percent": 45
  }
}
```

Claude waits and polls again (every 3-5 seconds):

```json
{
  "ok": true,
  "command": "audiences view",
  "platform": "cep",
  "result": {
    "status": "complete",
    "audience": {
      "id": "aud_456",
      "name": "abandoned_cart_24h",
      "type": "custom_ids",
      "display_name": "Abandoned Cart (24h)",
      "size": 3421,
      "created_at": "2026-05-13T14:30:00Z",
      "updated_at": "2026-05-13T14:35:00Z"
    }
  }
}
```

Claude confirms:

> **Audience ready!** 3,421 users in "abandoned_cart_24h". Proceeding with campaign...

### 6. Create Campaign

Claude creates the campaign:

```bash
$batch-cep campaigns create '{
  "name": "Abandoned Cart 24h Reminder",
  "display_name": "Abandoned Cart (24h) - Push Reminder",
  "targeting": {
    "audiences": ["abandoned_cart_24h"]
  },
  "channels": {
    "push": {
      "title": "Reviens finaliser ta commande",
      "body": "Tes articles t'attendent ! 🛍️"
    }
  },
  "state": "DRAFT"
}'
```

**Output:**

```json
{
  "ok": true,
  "command": "campaigns create",
  "platform": "cep",
  "result": {
    "campaign_token": "camp_def456ghi789...",
    "name": "Abandoned Cart 24h Reminder",
    "state": "DRAFT",
    "created_at": "2026-05-13T14:36:00Z"
  }
}
```

Claude reports:

> **Campaign created in DRAFT state.**
>
> - **Token:** `camp_def456ghi789...`
> - **Name:** Abandoned Cart 24h Reminder
> - **State:** DRAFT (not yet live)
> - **Target audience:** abandoned_cart_24h (3,421 users)
> - **Channel:** Push with title "Reviens finaliser ta commande"

### 7. Verify Campaign Details

Claude pulls the full campaign to show you:

```bash
$batch-cep campaigns view "camp_def456ghi789..."
```

**Output:**

```json
{
  "ok": true,
  "command": "campaigns view",
  "platform": "cep",
  "result": {
    "campaign": {
      "id": "camp_def456ghi789...",
      "name": "Abandoned Cart 24h Reminder",
      "display_name": "Abandoned Cart (24h) - Push Reminder",
      "state": "DRAFT",
      "targeting": {
        "audiences": ["abandoned_cart_24h"]
      },
      "channels": {
        "push": {
          "title": "Reviens finaliser ta commande",
          "body": "Tes articles t'attendent ! 🛍️"
        },
        "email": null,
        "sms": null,
        "in_app": null
      },
      "created_at": "2026-05-13T14:36:00Z",
      "updated_at": "2026-05-13T14:36:00Z"
    }
  }
}
```

Claude displays:

> **Campaign Details**
>
> | Field | Value |
> |---|---|
> | Token | `camp_def456ghi789...` |
> | Name | Abandoned Cart 24h Reminder |
> | State | DRAFT |
> | Target Audience | abandoned_cart_24h (3,421 users) |
> | Channel | Push |
> | Title | Reviens finaliser ta commande |
> | Body | Tes articles t'attendent ! 🛍️ |
>
> **Next steps:**
>
> 1. Review the campaign above
> 2. Ask me to "launch the campaign" if it looks good, or request changes
> 3. Once launched, push notifications will start sending to the 3,421 users in the audience

### 8. User Asks to Launch

You respond: "Launch it!"

Claude asks for confirmation (since this is a consequential action):

> **Ready to launch?** This will start sending push notifications to 3,421 users in the abandoned_cart_24h audience. The campaign **cannot be paused once running** but can be updated or deleted.
>
> **Confirm launch? (yes/no)**

You respond: `yes`

### 9. Update Campaign to Running

Claude updates the campaign state:

```bash
$batch-cep campaigns update "camp_def456ghi789..." '{
  "state": "RUNNING"
}'
```

**Output:**

```json
{
  "ok": true,
  "command": "campaigns update",
  "platform": "cep",
  "result": {
    "campaign_token": "camp_def456ghi789...",
    "name": "Abandoned Cart 24h Reminder",
    "state": "RUNNING",
    "updated_at": "2026-05-13T14:37:00Z"
  }
}
```

Claude confirms:

> **Campaign launched!** ✅
>
> Push notifications are now being sent to the 3,421 users in abandoned_cart_24h.
>
> **Monitor performance:**
> ```
> $batch-cep orchestrations stats camp_def456ghi789...
> ```
>
> You can check delivery stats, open rates, conversion tracking, etc. at any time.

## Advanced: Add More Targeting Criteria

Instead of just the audience, you could add more targeting logic:

```bash
$batch-cep campaigns create '{
  "name": "Abandoned Cart 24h Reminder",
  "targeting": {
    "audiences": ["abandoned_cart_24h"],
    "criteria": {
      "events": [
        {
          "name": "cart_abandoned",
          "timeframe_days": 1,
          "operator": "within_last"
        }
      ],
      "attributes": {
        "tier": ["premium", "pro"]
      }
    }
  },
  "channels": {
    "push": {
      "title": "Reviens finaliser ta commande",
      "body": "Tu as 20% de remise en tant que premium! 💎"
    }
  },
  "state": "DRAFT"
}'
```

This targets only premium/pro users in the abandoned_cart audience who triggered a cart_abandoned event in the last 24 hours.

## Alternative: Start in DRAFT, Test, Then Launch

If you want to be extra cautious:

1. Create campaign with `"state": "DRAFT"` (done in Step 6)
2. Review it (Step 7)
3. Ask Claude to "send a test to my email" (transactional preview)
4. Then launch when satisfied (Step 9)

## Notes

- **Destructive operation:** Deleting the campaign cannot be undone. Ask for explicit confirmation.
- **State change:** You can go from DRAFT → RUNNING, but not RUNNING → DRAFT (once live, only delete or let it run).
- **Audience size:** The 3,421 users are snapshotted when the campaign launches. New users joining the audience after launch won't receive it (unless you add them explicitly).
- **Rate limits:** Batch applies 300/s per Custom ID. A campaign targeting 3,421 users will send within seconds (no backoff needed).
- **Multi-channel:** You could add email, SMS, or in-app as well by populating those keys in `channels`.

## See Also

- [reference/cep/campaigns.md](../reference/cep/campaigns.md) — full campaign schema and commands
- [reference/cep/audiences.md](../reference/cep/audiences.md) — audience management
- [reference/cep/orchestrations.md](../reference/cep/orchestrations.md) — stats and analytics
- [reference/async-pattern.md](../reference/async-pattern.md) — understanding indexing_token polling
