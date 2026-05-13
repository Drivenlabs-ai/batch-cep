# First-Run Setup: Credentials & Initial Command

This walkthrough shows what happens when you use batch-cep for the first time and don't yet have credentials configured.

## Scenario

You've just set up the batch-cep skill and want to ask Claude to list your audiences:

> "List my Batch audiences"

## Step-by-Step: What Claude Does

### 1. Skill Triggered

Claude recognizes "Batch audiences" as a trigger for the batch-cep skill and loads the skill description and SKILL.md.

### 2. Setup Gate Check

Before executing any command, Claude checks for credentials:

```bash
test -f "${PROJECT_FOLDER:-.}/batch-credentials.json" && \
  cat "${PROJECT_FOLDER:-.}/batch-credentials.json" | jq . > /dev/null 2>&1
```

Since the file doesn't exist (first run), the check fails.

### 3. Claude Asks for Credentials

Claude responds:

> **Before I can access Batch, I need your API credentials.**
>
> These are kept locally on your machine (never sent anywhere except to api.batch.com). Your credentials include:
>
> 1. **REST API Key** — account-wide authorization
> 2. **Project Key** — specific to your CEP project
> 3. **App Keys (optional)** — for Mobile Engagement Platform features
>
> **Where to find them:**
>
> - Log into [Batch.com dashboard](https://dashboard.batch.com)
> - Go to ⚙ **Settings** → **General**
> - Under "API Keys", copy your **REST API Key** and **Project Key**
> - For app keys (iOS, Android, etc.), go to each app's settings
>
> **What's your REST API Key?** (starts with `rk_`)

### 4. User Provides REST Key

You paste your REST API key:

```
rk_live_abc123def456...
```

### 5. Claude Asks for Project Key

> **Thanks. Now, what's your CEP Project Key?** (starts with `proj_`)

You paste your project key:

```
proj_live_xyz789...
```

### 6. Claude Asks About App Keys

> **Do you need to use MEP (Mobile Engagement Platform) features like transactional push, in-app campaigns, or trigger events?** (yes/no)

You respond: `yes`

### 7. Claude Collects App Keys

> **Great. I'll store app key aliases so you don't have to repeat them.** Enter each platform's app key. Press Enter to skip.
>
> **iOS Live app key:** (or leave blank to skip)

You paste your iOS Live key:

```
iosk_live_123...
```

> **iOS Dev app key:** (or leave blank to skip)

You press Enter (no dev key needed).

> **Android Live app key:**

You paste your Android Live key:

```
andk_live_456...
```

> **Android Dev app key:**

Press Enter (skip).

> **Web app key:**

Press Enter (skip).

> **Which app key should be the default?** (ios_live / android_live / etc.)

You type: `ios_live`

### 8. Claude Writes Credentials File

Claude creates `./batch-credentials.json` (or `${PROJECT_FOLDER}/batch-credentials.json`) with your credentials:

```bash
cat > ./batch-credentials.json << 'EOF'
{
  "rest_key": "rk_live_abc123def456...",
  "project_key": "proj_live_xyz789...",
  "app_keys": {
    "ios_live": "iosk_live_123...",
    "android_live": "andk_live_456..."
  },
  "default_app_key": "ios_live",
  "api_base_url": "https://api.batch.com"
}
EOF

chmod 600 ./batch-credentials.json
```

### 9. Claude Confirms Setup Success

> **Credentials saved to `./batch-credentials.json` (gitignored, local only).** You're now authenticated with Batch.
>
> Now executing your original request: listing audiences...

### 10. Original Command Proceeds

Claude now runs:

```bash
node ${SKILL_PATH}/scripts/cep/audiences.mjs list
```

Output:

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
      },
      {
        "id": "aud_456",
        "name": "inactive_30d",
        "type": "custom_ids",
        "display_name": "Inactive (30+ days)",
        "size": 12000,
        "created_at": "2026-04-15T09:15:00Z",
        "updated_at": "2026-05-10T14:22:00Z"
      }
    ],
    "next_cursor": null
  }
}
```

Claude formats the response:

> **Your audiences:**
>
> 1. **premium_users** (custom_ids) — 5,000 users
> 2. **inactive_30d** (custom_ids) — 12,000 users
>
> You can now use any batch-cep command without re-authenticating.

## What Happens Next Time

Next time you run a batch-cep command, Claude automatically reads `batch-credentials.json` and proceeds directly — no prompts, no setup. The credentials stay on your machine, in `.gitignore`.

## Updating Credentials Later

If you need to change a credential:

**Option A: Ask Claude**

> "Update my Batch credentials"

Claude will re-run the setup flow.

**Option B: Edit directly**

```bash
$EDITOR batch-credentials.json
```

Add or update any field (rest_key, project_key, app_keys, default_app_key, api_base_url).

## Security Notes

- **Never commit** `batch-credentials.json` to Git (it's gitignored)
- **Never paste** keys in shared chats, Slack, email, or forums
- **Keep it local** — don't sync to cloud storage (Google Drive, iCloud, Dropbox)
- **Rotate keys** if you suspect they're compromised:
  - Log into Batch.com dashboard
  - Settings → General → Regenerate REST API Key
  - Update `batch-credentials.json` locally
  - Notify your team if the old key was shared

## Troubleshooting

### Error: "CONFIG_MISSING"

You don't have a credentials file yet. Run `$batch-cep setup` to create one, or ask Claude: "Set up my Batch credentials."

### Error: "CONFIG_INVALID"

The JSON file is malformed. Check:

```bash
cat batch-credentials.json | jq .
```

Fix any syntax errors (trailing commas, mismatched quotes, etc.) or delete it and re-run setup.

### Error: "AUTH_ERROR" / 401 response

Your credentials are wrong or expired. Verify in the Batch dashboard that your REST key and project key are correct.

## Next Steps

Once credentials are set up, you can:

- **Sync users** — `$batch-cep profiles update <data>`
- **Create audiences** — `$batch-cep audiences create <name> <type>`
- **Run campaigns** — `$batch-cep campaigns create <data>`
- **Send push notifications** — `$batch-cep transactional send <data>`
- See [reference/overview.md](../reference/overview.md) for platform choice (CEP vs MEP)
