# Catalogs (CEP)

Manage product catalogs for personalization, recommendations, and dynamic content in campaigns. Catalogs store product metadata and items that can be referenced in campaigns.

## Commands

### `$batch-cep catalogs create <name> <schema-json>`

Create a new catalog with a JSON Schema defining product attributes.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `name` | String | Yes | Catalog name: `[a-z0-9_-]{1,64}` (lowercase only, immutable) |
| `schema-json` | JSON object | Yes | JSON Schema fragment for product items (e.g., `{ "price": "number", "title": "string" }`) |

**Output**

```json
{
  "ok": true,
  "command": "catalogs create",
  "platform": "cep",
  "result": {
    "catalog_id": "cat_abc123def456",
    "name": "products",
    "schema": { "price": "number", "title": "string", "sku": "string" },
    "created_at": "2026-05-13T10:00:00Z"
  }
}
```

**Example**

```bash
$batch-cep catalogs create "products" '{
  "sku": "string",
  "title": "string",
  "price": "number",
  "category": "string"
}'
```

→ Output:
```json
{
  "ok": true,
  "command": "catalogs create",
  "platform": "cep",
  "result": {
    "catalog_id": "cat_xyz789",
    "name": "products",
    "schema": { "sku": "string", "title": "string", "price": "number", "category": "string" },
    "created_at": "2026-05-13T10:00:00Z"
  }
}
```

**Pitfalls**

- Catalog name must be **lowercase** `[a-z0-9_-]` — unlike audience names
- Name is immutable after creation
- Schema is pass-through JSON Schema — ensure it matches your data model

---

### `$batch-cep catalogs update <name> <patch-json>`

Update catalog metadata (schema, display_name, etc.).

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `name` | String | Yes | Catalog name (lowercase `[a-z0-9_-]{1,64}`) |
| `patch-json` | JSON object | Yes | Fields to update (e.g., `{ "schema": { ... } }`) |

**Output**

```json
{
  "ok": true,
  "command": "catalogs update",
  "platform": "cep",
  "result": {
    "catalog_id": "cat_abc123def456",
    "name": "products",
    "schema": { /* updated schema */ },
    "updated_at": "2026-05-13T10:30:00Z"
  }
}
```

**Example**

```bash
$batch-cep catalogs update "products" '{
  "schema": {
    "sku": "string",
    "title": "string",
    "price": "number",
    "category": "string",
    "discount_percentage": "number"
  }
}'
```

**Pitfalls**

- Schema changes apply only to **new items** — existing items are not revalidated

---

### `$batch-cep catalogs remove <name> --confirm`

Delete a catalog and all its items. **Destructive operation** — requires `--confirm` flag.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `name` | String | Yes | Catalog name to delete |
| `--confirm` | Flag | Yes | Confirms destructive operation |

**Output**

```json
{
  "ok": true,
  "command": "catalogs remove",
  "platform": "cep",
  "result": {
    "catalog_id": "cat_abc123def456",
    "status": "deleted"
  }
}
```

**Error (without --confirm)**

```json
{
  "ok": false,
  "command": "catalogs remove",
  "platform": "local",
  "error": {
    "http_status": null,
    "error_code": "CONFIRM_REQUIRED",
    "error_message": "Destructive operation requires --confirm flag.",
    "endpoint": null,
    "retryable": false,
    "hint": "Re-run with --confirm to proceed. This permanently deletes the catalog and all its items."
  }
}
```

**Example**

```bash
$batch-cep catalogs remove "products" --confirm
```

**Pitfalls**

- Requires `--confirm` flag
- Deletion is permanent — all items are lost
- Campaigns referencing this catalog will fail if they try to use it

---

### `$batch-cep catalogs view <name>`

Get catalog details including schema and item count.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `name` | String | Yes | Catalog name |

**Output**

```json
{
  "ok": true,
  "command": "catalogs view",
  "platform": "cep",
  "result": {
    "catalog": {
      "catalog_id": "cat_abc123def456",
      "name": "products",
      "schema": { "sku": "string", "title": "string", "price": "number" },
      "item_count": 1250,
      "created_at": "2026-05-01T12:00:00Z",
      "updated_at": "2026-05-13T10:30:00Z"
    }
  }
}
```

**Example**

```bash
$batch-cep catalogs view "products"
```

---

### `$batch-cep catalogs list [--limit N]`

List all catalogs in the project.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `--limit` | Number | No | Max catalogs to return (default: server decides) |

**Output**

```json
{
  "ok": true,
  "command": "catalogs list",
  "platform": "cep",
  "result": {
    "catalogs": [
      {
        "catalog_id": "cat_abc123",
        "name": "products",
        "item_count": 1250,
        "created_at": "2026-05-01T12:00:00Z"
      },
      {
        "catalog_id": "cat_def456",
        "name": "articles",
        "item_count": 500,
        "created_at": "2026-05-02T08:00:00Z"
      }
    ]
  }
}
```

**Example**

```bash
$batch-cep catalogs list --limit 25
```

---

### `$batch-cep catalogs edit-items <name> <operations-json>`

Upsert or delete catalog items in a single call. Operations are applied in order.

**Arguments**

| Arg | Type | Required | Description |
|---|---|---|---|
| `name` | String | Yes | Catalog name |
| `operations-json` | JSON object | Yes | `{ "upsert": [...], "delete": [...] }` or `{ "upsert": [...] }` |

**Schema**

```json
{
  "upsert": [
    {
      "item_id": "string (unique within catalog)",
      "attributes": "object matching catalog schema"
    }
  ],
  "delete": [
    "item_id1",
    "item_id2"
  ]
}
```

**Output**

```json
{
  "ok": true,
  "command": "catalogs edit-items",
  "platform": "cep",
  "result": {
    "catalog_name": "products",
    "upserted_count": 2,
    "deleted_count": 1,
    "total_items": 1251
  }
}
```

**Example (mixed upsert and delete)**

```bash
$batch-cep catalogs edit-items "products" '{
  "upsert": [
    {
      "item_id": "sku_123",
      "attributes": {
        "sku": "SKU-123",
        "title": "Blue Shirt",
        "price": 49.99,
        "category": "Apparel"
      }
    },
    {
      "item_id": "sku_124",
      "attributes": {
        "sku": "SKU-124",
        "title": "Red Pants",
        "price": 69.99,
        "category": "Apparel"
      }
    }
  ],
  "delete": ["sku_old"]
}'
```

→ Output:
```json
{
  "ok": true,
  "command": "catalogs edit-items",
  "platform": "cep",
  "result": {
    "catalog_name": "products",
    "upserted_count": 2,
    "deleted_count": 1,
    "total_items": 1251
  }
}
```

**Example (upsert only)**

```bash
$batch-cep catalogs edit-items "products" '{
  "upsert": [
    {
      "item_id": "sku_200",
      "attributes": {
        "sku": "SKU-200",
        "title": "Green Hat",
        "price": 29.99,
        "category": "Accessories"
      }
    }
  ]
}'
```

**Pitfalls**

- `item_id` must be unique within the catalog
- Upsert creates or updates; delete removes permanently
- Attributes must conform to the catalog schema
- Rate limit applies — check [rate-limits](../rate-limits.md) for catalog-specific limits

---

## See also

- [overview](../overview.md) — catalogs as CEP feature
- [rate-limits](../rate-limits.md) — rate limiting for catalog item operations
- [errors](../errors.md) — troubleshooting validation and schema errors
