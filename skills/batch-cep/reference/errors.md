# Errors: Codes, Messages & Troubleshooting

When something goes wrong, batch-cep returns a structured error JSON with actionable guidance.

## HTTP status codes & what to do

### 200 / 201 / 204

Success. No action needed.

### 202

Accepted, processing async. Not an error. See [async-pattern.md](async-pattern.md).

### 400 (Bad Request)

Malformed payload. Check:
- JSON syntax (valid JSON? closing braces?)
- Required fields present (e.g., `name` for audience creation)
- Field types correct (string vs number, array vs object)
- Field values valid (length, regex, enum)

**Action:** Fix the request. Don't retry.

### 401 (Unauthorized)

Bad or missing authentication.

**Common causes:**
- `rest_key` is wrong or expired
- `project_key` (CEP) is wrong
- `app_key` (MEP) is wrong

**Action:** Check `batch-credentials.json`:
```bash
cat batch-credentials.json | jq .
```

Verify in Batch.com dashboard that the keys match. If rotated recently, update the file.

### 403 (Forbidden)

You don't have permission, or the resource belongs to a different project.

**Common causes:**
- Using the wrong project key
- Trying to access a CEP resource with MEP auth (or vice versa)
- Account doesn't have permission (contact Batch support)

**Action:** Check that you're using the right project key for CEP, or the right app key for MEP.

### 404 (Not Found)

Resource doesn't exist.

**Common causes:**
- Audience ID is wrong or already deleted
- Campaign ID is typo'd
- Profile doesn't exist (you can't view a profile that was never created)

**Action:** Check the identifier. List existing resources first:
```
$batch-cep audiences list
```

### 409 (Conflict)

Usually "resource already exists."

**Common causes:**
- Audience name already in use
- Trying to create a duplicate

**Action:** Use a unique name, or update the existing resource instead of creating.

### 422 (Unprocessable Entity)

Validation error in the request body.

Example response:
```json
{
  "error_code": "VALIDATION_ERROR",
  "error_message": "Field 'size' must be > 0 and <= 1000"
}
```

**Action:** Read the `error_message` and fix the field. Check documentation for constraints.

### 429 (Too Many Requests)

Rate limit exceeded.

**Action:** Back off exponentially. See [rate-limits.md](rate-limits.md).

### 500 (Internal Server Error)

Batch server error. Not your fault.

**Action:** Retry with exponential backoff (2s → 5s → 10s). If persistent, contact Batch support.

### 503 (Service Unavailable)

Batch is under maintenance or temporarily overloaded.

**Action:** Retry later (minutes to hours). Check Batch status page.

## Local error codes (batch-cep–specific)

### CONFIG_MISSING

You haven't set up credentials yet.

**Message:** "batch-credentials.json not found or incomplete."

**Action:** Run setup:
```
I need to set up batch-cep. Can you help me configure my credentials?
```

Claude will walk you through it.

### CONFIG_INVALID

Credentials file exists but is malformed.

**Message:** "batch-credentials.json is invalid JSON" or "Missing required fields: rest_key, project_key"

**Action:** Check the file:
```bash
cat batch-credentials.json | jq .
```

Fix JSON syntax, or delete and re-run setup.

### APPKEY_UNRESOLVED

You referenced an MEP app key alias that's not in credentials.

**Message:** "App key alias 'ios_live' not found in batch-credentials.json"

**Action:** Either:
1. Add the alias to `app_keys` in the file, or
2. Use a raw app key string instead of an alias

### CONFIRM_REQUIRED

Destructive operation without explicit confirmation.

**Message:** "This operation is destructive. Re-run with `--confirm` to proceed."

**Affected commands:** `audiences remove`, `campaigns delete`, `custom-data delete`, and other destructive ops.

**Action:** Claude will ask you to confirm. Reply yes, and Claude re-runs with `--confirm`.

### VALIDATION_ERROR

Input failed local validation (not from Batch API).

**Message:** "Field 'custom_id' must match regex: [a-z0-9_.-]{1,512}"

**Examples:**
- custom_id with invalid characters
- email not in email format
- number out of range

**Action:** Check the `error_message` for the constraint. Fix the input.

### UNEXPECTED

Generic catch-all for unhandled errors.

**Action:** Check stderr for details. If you can't figure it out, contact support with:
- The command you ran
- The full error JSON
- The stderr output

## Error response shape

Every error from batch-cep follows this JSON structure:

```json
{
  "ok": false,
  "command": "audiences create",
  "platform": "cep",
  "error": {
    "http_status": 401,
    "error_code": "AUTH_ERROR",
    "error_message": "Invalid REST API key",
    "endpoint": "/audiences/create",
    "retryable": false,
    "hint": "Check BATCH_REST_KEY in batch-credentials.json. Keys are manager-only visible."
  }
}
```

Fields:
- `ok` — false (always, for errors)
- `command` — what you tried to do
- `platform` — "cep" | "mep" | "local"
- `error.http_status` — HTTP code from Batch (or null for local errors)
- `error.error_code` — Batch error code or local code
- `error.error_message` — human-readable description
- `error.endpoint` — API endpoint that failed (or null)
- `error.retryable` — true if safe to retry, false if it won't help
- `error.hint` — actionable guidance

## Common troubleshooting scenarios

### "I keep getting 429"

Rate limit. You're sending requests too fast.

**Solution:**
1. Reduce batch sizes (send fewer profiles per request)
2. Add delays between requests (1-2 seconds)
3. Use `/profiles/mass-update` instead of `/profiles/update` for bulk work

See [rate-limits.md](rate-limits.md).

### "401 even though my keys are correct"

Keys might be expired or rotated.

**Solution:**
1. Log into Batch.com dashboard
2. Go to Settings → General
3. Regenerate REST API key
4. Update `batch-credentials.json` with the new key
5. Retry

### "Audience creation returns 202 but never finishes"

Stuck in `indexing` status.

**Solution:**
1. Wait longer (try 5-10 minutes)
2. If still stuck after 30 minutes, contact Batch support with the token
3. In the meantime, try a smaller audience (may index faster)

See [async-pattern.md](async-pattern.md).

### "404 on a resource I just created"

Operation may still be indexing.

**Solution:**
1. If it's a 202 operation (audiences, campaigns), poll with the token until `status: ready`
2. Then try again
3. If you didn't capture the token, contact Batch support

### "409 Conflict — audience name already exists"

Self-explanatory.

**Solution:**
- Use a different name, or
- `audiences replace` to overwrite the existing one

## Getting help

If you're stuck:

1. **Run the command again and capture the full error JSON** — copy the entire error response
2. **Check this guide** for your error code
3. **If not listed,** contact Batch support with:
   - Full error JSON
   - Command you ran
   - Approximate timestamp
   - Batch project ID

## See also

- [overview.md](overview.md) — platform intro
- [rate-limits.md](rate-limits.md) — 429 handling
- [async-pattern.md](async-pattern.md) — 202 polling
- [setup.md](setup.md) — credential errors
