# Setup: Credentials & First Run

To use batch-cep, you need to store Batch API credentials locally on your machine. This guide explains why and how.

## Why local credentials

The batch-cep skill makes HTTP calls to api.batch.com on your behalf. To authenticate those calls, you need:

1. Your **REST API key** (account-wide, keeps your account secure)
2. Your **project key** (CEP project-specific)
3. Your **app keys** (one per mobile app platform/environment)

These are **secrets**. They should never be committed to Git, sent over email, or shared. Batch-cep stores them locally in a file on your machine that Claude has permission to read.

## Credentials file location

```
${PROJECT_FOLDER:-.}/batch-credentials.json
```

If you don't specify `PROJECT_FOLDER`, it defaults to the current working directory (`.`).

**Never commit this file to Git.** It's in `.gitignore` by default.

## Credentials file format

```json
{
  "rest_key": "YOUR_ACCOUNT_REST_API_KEY",
  "project_key": "YOUR_CEP_PROJECT_KEY",
  "app_keys": {
    "ios_live": "YOUR_IOS_LIVE_APP_KEY",
    "ios_dev": "YOUR_IOS_DEV_APP_KEY",
    "android_live": "YOUR_ANDROID_LIVE_APP_KEY",
    "android_dev": "YOUR_ANDROID_DEV_APP_KEY",
    "web": "YOUR_WEB_APP_KEY"
  },
  "default_app_key": "ios_live",
  "api_base_url": "https://api.batch.com"
}
```

All fields are **optional except `rest_key` and `project_key`**.

- `rest_key` — account-wide REST API key (required for CEP and MEP)
- `project_key` — CEP project key (required for CEP commands)
- `app_keys` — object of platform aliases (optional, required if you use MEP)
- `default_app_key` — which app key alias to use if none specified (optional, defaults to `ios_live`)
- `api_base_url` — override API endpoint (optional, defaults to `https://api.batch.com`)

## How to get the keys

### REST API key

1. Log in to Batch.com dashboard
2. Go to ⚙ **Settings** → **General**
3. Look for "API Keys" or "REST API Key" section
4. Copy the key (manager-only permission)
5. **Keep it secret** — it controls your entire account

### Project key (CEP)

1. In dashboard, go to your **CEP project**
2. ⚙ **Settings** → **General**
3. Look for "Project Key" or "Batch Project Key"
4. Copy it

### App keys (MEP)

1. In dashboard, go to your **CEP project**
2. Select an **app** (iOS, Android, Web, etc.)
3. ⚙ **Settings** → **General**
4. Look for "App Key" or "SDK API Key"
5. Copy it
6. Repeat for each app/platform you need

**Important:** Each platform (iOS dev/live, Android dev/live, Web) has a **separate key**. Store them all if you use MEP.

## First-run setup workflow

When you run a batch-cep command for the first time:

1. Claude checks if `batch-credentials.json` exists and is valid
2. If absent or incomplete:
   - Claude asks you: "I need your Batch API credentials. What's your REST key?"
   - You paste the key
   - Claude asks: "What's your CEP project key?"
   - You paste it
   - Claude optionally asks: "Do you want to store app keys for MEP? (yes/no)"
3. If yes, Claude asks for each app key alias (ios_live, ios_dev, etc.)
4. Claude writes the JSON file to disk
5. You're ready to use batch-cep commands

**You only do this once.** After setup, Claude reads the file automatically on each command.

## Updating credentials

To add or change a credential:

**Option A: Edit the file directly**

```bash
$EDITOR batch-credentials.json
```

**Option B: Re-run setup**

Ask Claude to "re-run setup" or "update my batch credentials". Claude will walk you through the prompts again and overwrite the file.

## Security best practices

- **Never commit** `batch-credentials.json` to Git (already in `.gitignore`)
- **Never paste** your keys in shared documents, Slack, email, or forums
- **Rotate your keys** if you suspect they're compromised:
  - Log into Batch.com
  - Settings → General
  - Regenerate the REST API key
  - Update `batch-credentials.json` on your machine
- **Keep it local** — don't sync credentials to cloud storage (Google Drive, Dropbox, iCloud, etc.)
- **Use strong permissions** — on Linux/Mac, `batch-credentials.json` should be readable only by you:
  ```bash
  chmod 600 batch-credentials.json
  ```

## Troubleshooting setup

### "CONFIG_MISSING" error

You don't have a `batch-credentials.json` file yet. Run first-run setup: ask Claude "Set up my batch credentials" or similar.

### "CONFIG_INVALID" error

The file exists but is malformed JSON. Check that:
- File is valid JSON (no trailing commas, quotes matched)
- `rest_key` and `project_key` are present
- File is not corrupted (try `cat batch-credentials.json | jq .`)

### "APPKEY_UNRESOLVED" error

You tried to use an app key alias (e.g., `ios_live`) that's not in `app_keys` in your credentials file. Either:
- Edit the file to add the missing key
- Use a raw app key string instead of an alias

### "AUTH_ERROR" / 401 response

Your keys are wrong or expired. Verify in Batch.com dashboard that the keys are correct and haven't been rotated since you saved them.

## What's next

Once credentials are set up, you can start using batch-cep commands. See [overview.md](overview.md) to pick the right platform (CEP vs MEP), then explore the relevant reference guides:

- **CEP workflows:** [cep/profiles.md](cep/profiles.md), [cep/audiences.md](cep/audiences.md), [cep/campaigns.md](cep/campaigns.md)
- **MEP workflows:** [mep/transactional.md](mep/transactional.md), [mep/campaigns.md](mep/campaigns.md)
- **Troubleshooting:** [errors.md](errors.md)
