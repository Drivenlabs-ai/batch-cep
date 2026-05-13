# Audience CSV membership sync

**Scenario:** "J'ai un CSV de 50,000 custom_ids à mettre dans une audience nommée 'premium_users'"

## Step-by-step

### 1. Create the empty audience

```bash
$batch-cep audiences create premium_users custom_ids "Premium Users Q2"
```

→ Output:
```json
{
  "ok": true,
  "command": "audiences create",
  "platform": "cep",
  "result": {
    "status": "accepted",
    "indexing_token": "idx_tok_create_abc123",
    "next_step": "Call `audiences view <indexing_token>` to poll indexing status."
  }
}
```

You can poll until ready, or proceed directly — an empty audience accepts update calls immediately.

### 2. Parse the CSV

Build an array of `custom_ids` from your CSV. See `examples/csv-sync.mjs` for a working Node.js parsing pattern (it targets `profiles mass-update`, but the CSV-to-array parsing logic is identical and reusable).

Quick one-liner for simple CSVs with `custom_id` as the first column:

```bash
# Skip header, extract first column
tail -n +2 users.csv | cut -d',' -f1 | jq -R . | jq -s . > ids.json
```

### 3. Add IDs in chunks

Batch accepts up to ~50,000 IDs per `audiences update` call reliably. For very large lists, prefer chunks of 10,000 for stable performance:

```bash
# Chunk example: first 10,000 IDs
$batch-cep audiences update premium_users '["u_0001","u_0002","u_0003"...]'
```

Each call **merges** (appends) — it does not overwrite existing members.

Each call returns its own `indexing_token`:

```json
{
  "ok": true,
  "command": "audiences update",
  "platform": "cep",
  "result": {
    "status": "accepted",
    "indexing_token": "idx_tok_upd_chunk1_xyz",
    "next_step": "Call `audiences view <indexing_token>` to poll indexing status."
  }
}
```

### 4. Poll each indexing token

```bash
$batch-cep audiences view idx_tok_upd_chunk1_xyz
```

→ Still indexing:
```json
{
  "ok": true,
  "result": { "status": "indexing", "indexing_token": "idx_tok_upd_chunk1_xyz", "progress_percent": 60 }
}
```

→ Complete:
```json
{
  "ok": true,
  "result": { "status": "complete", "audience": { "name": "premium_users", "size": 10000, ... } }
}
```

Repeat for each chunk token. Tokens are independent — you can poll them in parallel.

### 5. Full overwrite: use `replace` instead

If you want to **replace** the entire audience (remove current members not in the new list), use `audiences replace --confirm` in a single call with the full ID set:

```bash
$batch-cep audiences replace premium_users '["u_0001","u_0002",...]' --confirm
```

Call `replace` once with the complete list. For >50k IDs, use `update` in chunks instead — `replace` is most practical for audiences ≤50k.

### 6. Verify final state

```bash
$batch-cep audiences view premium_users
```

→ Returns current size, type, and status once all indexing is complete.

## Indexing time

Indexing time scales with **total audience membership**, not per-call size. A 500k-member audience can take several minutes to fully index after the last update. Plan accordingly before targeting this audience in a campaign.

## See also

- [audiences reference](../reference/cep/audiences.md) — full command docs + per-call limits
- [campaigns reference](../reference/cep/campaigns.md) — how to target this audience in a campaign
- [csv-sync.mjs](csv-sync.mjs) — CSV parsing pattern adapted for profile mass-update (same parsing logic applies here)
- [async-pattern](../reference/async-pattern.md) — indexing_token polling details
