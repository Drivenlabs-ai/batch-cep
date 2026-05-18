# batch-cep Skill — Implementation Design

**Status:** ✅ **Implemented in v0.1.0** (2026-05-15). Validation Phase 6 complete with 22 fixes applied. Awaiting live smoke test in Cowork.
**Author:** Alex Bouchez + Claude
**Date:** 2026-05-13 (spec drafted) → 2026-05-15 (impl shipped)
**Plugin location:** `/Users/alexbouchez/Code/driven-alex-plugins/batch-cep/`
**Current state & next steps:** see [`STATUS.md`](../../../STATUS.md)
**Release history:** see [`CHANGELOG.md`](../../../CHANGELOG.md)
**Reference (MCP server, source of truth for Batch API surface):** [`alexbouchez/batch-mcp`](https://github.com/alexbouchez/batch-mcp) (archived — TypeScript MCP Phase 1-3, 318 specs, 60 tools)

> **Note** : Cette spec a servi de blueprint pour l'implémentation. Les ~31 tasks du §11 ont toutes été exécutées via subagent-driven development. Tests target : 329 → réalité : 350 (sur-couverture due aux tests additionnels pour les fixes Phase 6). Pour les déviations finales vs spec et les choix faits en cours d'impl, voir le CHANGELOG.

---

## 1. Context

`batch-cep` is a Claude skill that wraps the Batch.com REST API (CEP v2.11 + MEP v1.1) via direct `fetch()` calls in Node.js. It exposes **60 commands** to Claude through a router pattern in `SKILL.md`, with each command backed by a small `.mjs` script that handles auth, HTTP, error mapping, and stdout JSON output.

The skill targets **Claude Cowork** (knowledge workers, non-tech) as primary surface, with secondary distribution via Claude Code plugin marketplace through `alexbouchez/driven-alex-plugins`. No MCP server, no OAuth, no SaaS — user credentials live locally in `${PROJECT_FOLDER}/batch-credentials.json` (per-customer pattern recommended by Batch).

The 60-command surface was modeled and tested during Phase 1-3 as a TypeScript MCP server in the `batch-mcp` repository (318 Vitest specs). Phase 5 ports that work to standalone `.mjs` scripts. **The Batch API surface, schema decisions, error patterns, and async semantics from Phase 1-3 are the source of truth — we port, we don't redesign.**

### 1.1 Aligned decisions recap (from brainstorming sessions)

| Decision | Choice |
|---|---|
| Format | Node.js `.mjs` scripts (no TypeScript build step, no bundling) |
| Distribution | Claude Code plugin marketplace (driven-alex-plugins) + Cowork .zip upload |
| Scope | CEP (26 commands) + MEP (34 commands) = 60 total |
| Credentials | Per-customer, server-side local file (`${PROJECT_FOLDER}/batch-credentials.json`), first-run setup auto via Claude chat prompt |
| Pattern | Impeccable-style router in SKILL.md + per-command `reference/<command>.md` loaded on-demand + per-resource `scripts/<platform>/<resource>.mjs` executed via bash |
| Validation | Manual JSON shape checks in scripts (no Zod, no pydantic). Reference Phase 1-3 Zod schemas for constraint values (regex, max lengths, enums). |
| Output | Each script prints JSON to stdout. Claude parses stdout and formats for user. |
| Errors | Each script exits 0 on success, 1+ on error. Error JSON shape: `{ ok: false, http_status, error_code?, error_message, hint, retryable, endpoint, platform }`. Claude reads stderr for additional context. |
| Confirm gate | Destructive commands (`*_delete`, `*_remove`, `audience replace`, `gdpr erasure-request`, `custom-data delete`, `app-data delete`, `custom-audience replace/remove`) require explicit `--confirm` flag on script + chat-level confirmation request to user. |
| Tests | Vitest mock-fetch pattern (like Phase 3). Tests live in `tests/` at plugin root. |

---

## 2. Goals & non-goals

### Goals

- **60 standalone .mjs scripts** under `scripts/{cep,mep}/<resource>.mjs`, each implementing the commands for that resource.
- **3 lib modules** : `lib/client.mjs` (HTTP + auth + error), `lib/config.mjs` (credentials loading + first-run), `lib/validate.mjs` (input validation helpers).
- **1 entry dispatcher** `bin/batch.mjs` that routes `node bin/batch.mjs <resource> <action> <args...>` to the right resource script.
- **22 reference markdown files** (per-resource + cross-cutting docs) loaded on-demand by Claude.
- **3 example workflows** in `examples/` (concrete usage scenarios).
- **TDD strict** : each script gets a `tests/scripts/<platform>/<resource>.test.mjs` written first (RED), then implementation (GREEN).
- **Reuse Phase 1-3** : every Zod schema, error mapping, async pattern, identifier rule is ported verbatim (just converted from Zod to plain JS validation).
- **Plain Node 18+** : zero transpilation, zero dependencies beyond Node stdlib + Vitest for tests. `fetch` is global in Node 18+.

### Non-goals

- TypeScript / build step / bundling.
- Zod / pydantic / runtime schema library — manual validation only.
- npm publish — distribution is GitHub (plugin marketplace + zip release).
- HTTP transport / Vercel hosting — strict local stdio model.
- Async indexing token poll loops baked into scripts — Claude orchestrates polling per CEP audiences pattern (script returns the token, user/Claude polls via `audiences view`).
- Cross-tool composition helpers — Claude composes via multiple script calls.
- i18n of CLI output — output is JSON only, Claude formats for user in their language.
- Skill tests via vitest in Cowork sandbox — tests are dev-time only, run with `pnpm vitest` locally before commit.

---

## 3. Architecture

### 3.1 File layout (final after Phase 5)

```
driven-alex-plugins/batch-cep/
├── .claude-plugin/
│   └── plugin.json                       (already done Phase 4)
├── README.md                              (already done Phase 4)
├── package.json                           NEW — name: batch-cep-plugin, vitest dev dep, scripts.test
├── vitest.config.mjs                      NEW — minimal config
├── biome.json                             NEW — match Dougs/impeccable conventions
├── .gitignore                             NEW — node_modules, *.local.*, batch-credentials.json
├── skills/batch-cep/
│   ├── SKILL.md                           (already done Phase 4)
│   ├── bin/
│   │   └── batch.mjs                      NEW — entry dispatcher, ~80 lines
│   ├── lib/
│   │   ├── client.mjs                     NEW — fetch wrapper + auth + error mapping
│   │   ├── config.mjs                     NEW — credentials loading + first-run setup
│   │   └── validate.mjs                   NEW — shared validation helpers (regex, enums, etc.)
│   ├── scripts/
│   │   ├── cep/
│   │   │   ├── profiles.mjs               NEW — 3 commands (update / mass-update / export)
│   │   │   ├── audiences.mjs              NEW — 6 commands
│   │   │   ├── campaigns.mjs              NEW — 3 commands
│   │   │   ├── catalogs.mjs               NEW — 6 commands
│   │   │   ├── orchestrations.mjs         NEW — 3 commands
│   │   │   ├── exports.mjs                NEW — 3 commands
│   │   │   └── segments.mjs               NEW — 1 command
│   │   └── mep/
│   │       ├── transactional.mjs          NEW — 2 commands
│   │       ├── trigger-events.mjs         NEW — 2 commands (path /1.0/)
│   │       ├── campaigns.mjs              NEW — 6 commands
│   │       ├── in-app-campaigns.mjs       NEW — 5 commands
│   │       ├── custom-audience.mjs        NEW — 6 commands (v1.1)
│   │       ├── custom-data.mjs            NEW — 2 commands
│   │       ├── app-data.mjs               NEW — 4 commands
│   │       ├── gdpr.mjs                   NEW — 4 commands
│   │       └── exports.mjs                NEW — 3 commands
│   ├── reference/
│   │   ├── overview.md                    NEW — CEP vs MEP
│   │   ├── setup.md                       NEW — first-run wizard detail
│   │   ├── identifiers.md                 NEW — custom_id, install_id, email, advertising_id
│   │   ├── rate-limits.md                 NEW — 300/s per Custom ID, mass-update semantics
│   │   ├── async-pattern.md               NEW — 202 + indexing_token poll loop
│   │   ├── errors.md                      NEW — 401/429/500 troubleshooting
│   │   ├── cep/
│   │   │   ├── profiles.md
│   │   │   ├── audiences.md
│   │   │   ├── campaigns.md
│   │   │   ├── catalogs.md
│   │   │   ├── orchestrations.md
│   │   │   ├── exports.md
│   │   │   └── segments.md
│   │   └── mep/
│   │       ├── transactional.md
│   │       ├── trigger-events.md
│   │       ├── campaigns.md
│   │       ├── in-app-campaigns.md
│   │       ├── custom-audience.md
│   │       ├── custom-data.md
│   │       ├── app-data.md
│   │       ├── gdpr.md
│   │       └── exports.md
│   └── examples/
│       ├── first-run-setup.md             NEW — walkthrough du setup auto credentials
│       ├── create-campaign.md             NEW — workflow exemple (CEP audience → campaign)
│       └── csv-sync.mjs                   NEW — script bulk CSV → /profiles/mass-update
└── tests/
    ├── helpers.mjs                         NEW — mockFetch, fakeCredentials, captureOutput
    ├── lib/
    │   ├── client.test.mjs                NEW — auth, fetch, error mapping
    │   ├── config.test.mjs                NEW — credentials loading, first-run
    │   └── validate.test.mjs              NEW — regex, enum, etc.
    └── scripts/
        ├── cep/
        │   ├── profiles.test.mjs
        │   ├── audiences.test.mjs
        │   ├── campaigns.test.mjs
        │   ├── catalogs.test.mjs
        │   ├── orchestrations.test.mjs
        │   ├── exports.test.mjs
        │   └── segments.test.mjs
        └── mep/
            ├── transactional.test.mjs
            ├── trigger-events.test.mjs
            ├── campaigns.test.mjs
            ├── in-app-campaigns.test.mjs
            ├── custom-audience.test.mjs
            ├── custom-data.test.mjs
            ├── app-data.test.mjs
            ├── gdpr.test.mjs
            └── exports.test.mjs
```

**File counts** :
- 3 lib files
- 1 dispatcher (`bin/batch.mjs`)
- 16 resource scripts (7 CEP + 9 MEP)
- 22 reference markdown files (6 cross-cutting + 7 CEP + 9 MEP)
- 3 examples
- 19 test files (3 lib + 16 resource)
- 4 config files (package.json, vitest.config.mjs, biome.json, .gitignore)
- **Total: ~68 new files**

### 3.2 Module responsibilities

| Module | Responsibility |
|---|---|
| `bin/batch.mjs` | Parse `argv`, dispatch to the appropriate resource script via dynamic import. Pass remaining args. Forward stdout. |
| `lib/client.mjs` | One function per HTTP verb (`get`, `post`, `patch`, `put`, `del`). Auth header construction (CEP `Authorization: Bearer` + `X-Batch-Project` ; MEP `X-Authorization` + path-embedded app key). URL builder with `apiVersion` param (default 2.11 CEP, default 1.1 MEP, but allow 1.0 for trigger-events). Response parsing. Error throw with structured shape. |
| `lib/config.mjs` | Load credentials from `${PROJECT_FOLDER:-.}/batch-credentials.json`. If missing or incomplete, throw a `ConfigMissingError` with explicit guidance — Claude catches and triggers the setup workflow. Helpers : `getCepConfig()`, `getMepConfig(appKeyRef)`, `resolveAppKey(ref)`. |
| `lib/validate.mjs` | Reusable validators ported from Phase 1-3 Zod schemas : `isCustomId(s)`, `isAppKeyAlias(s)`, `isEventName(s)`, `isAudienceName(s)`, etc. Each returns `{ ok: true }` or `{ ok: false, error: "..." }`. |
| `scripts/<platform>/<resource>.mjs` | Each file exports a `dispatch(action, args, opts)` function called by `bin/batch.mjs`. Internally maps `action` → handler function (e.g., `audiences.mjs` has `create`, `update`, `replace`, `remove`, `list`, `view`). Each handler validates input, calls `lib/client.mjs`, prints JSON to stdout, exits. |
| `reference/<name>.md` | Markdown documentation for one command or one cross-cutting topic. Loaded by Claude only when triggered. Format : usage, args, examples, pitfalls. |
| `examples/*.{md,mjs}` | Concrete workflows that demonstrate composing multiple commands. |
| `tests/scripts/<platform>/<resource>.test.mjs` | Vitest suites mocking `globalThis.fetch`. One `describe()` per action. Cover RED cases (validation), happy path (URL, headers, body assertion), error surfacing. |

### 3.3 Data flow per command

```
User: "list mes audiences batch"
    ↓
Claude (Cowork): reads system prompt → matches batch-cep description
    ↓
Claude: bash `cat skills/batch-cep/SKILL.md`
    → SKILL.md enters context (router table)
    ↓
Claude: identifies "audiences list" command
    ↓
Claude: bash `cat skills/batch-cep/reference/cep/audiences.md`
    → reference content enters context (~2K tokens)
    ↓
Claude: bash `test -f "${PROJECT_FOLDER:-.}/batch-credentials.json"`
    → if absent: run first-run setup workflow (ask user, write file)
    ↓
Claude: bash `node skills/batch-cep/bin/batch.mjs audiences list`
    → bin/batch.mjs imports scripts/cep/audiences.mjs
    → scripts/cep/audiences.mjs validates input, calls lib/client.mjs
    → lib/client.mjs fetches https://api.batch.com/2.11/audiences/list with proper headers
    → response parsed, JSON printed to stdout
    ↓
Claude: reads stdout, formats response for user in natural language
```

### 3.4 Cross-cutting concerns

**Auth resolution flow** :
1. Script imports `getCepConfig()` (or `getMepConfig(appKeyRef)`) from `lib/config.mjs`.
2. `config.mjs` reads `${PROJECT_FOLDER:-.}/batch-credentials.json`.
3. For CEP: returns `{ restKey, projectKey }` or throws `ConfigMissingError`.
4. For MEP: returns `{ restKey, appKey }` where `appKey` is resolved from `appKeyRef` (alias → env var lookup → raw key fallback).

**Error mapping** (from Phase 1-3 `client/errors.ts`) :
- HTTP 200/201/204 → success
- HTTP 202 + body has `indexing_token` → success, return `{ status: "accepted", indexing_token, next_step }`
- HTTP 400 → `{ ok: false, http_status: 400, error_code: ..., error_message, hint: "Fix request payload, don't retry.", retryable: false }`
- HTTP 401 → hint "Check BATCH_REST_KEY / BATCH_PROJECT_KEY in batch-credentials.json"
- HTTP 404 → hint "Resource not found. Check identifier."
- HTTP 429 → `retryable: true`, hint "Rate limited. Back off exponentially (2s → 5s → 10s)."
- HTTP 500/503 → `retryable: true`, hint "Server error. Retry with backoff."

**Stdout JSON contract** (every script):
```json
{
  "ok": true,                       // or false
  "command": "audiences list",
  "platform": "cep",                // "cep" | "mep" | "local"
  "result": { ... },                // present if ok=true
  "error": { ... },                 // present if ok=false (shape per §4.2)
  "raw": { ... }                    // optional Batch raw response (debug)
}
```

**Confirm gate flow** (destructive) :
1. Script requires `--confirm` CLI flag.
2. Without it, script exits with `{ ok: false, error: { code: "CONFIRM_REQUIRED", hint: "Destructive operation. Re-run with --confirm." } }`.
3. Claude reads this error, asks user "Confirmer la suppression de X ? (oui/non)".
4. On "oui" → re-runs with `--confirm`.

**App-key resolution** (MEP) :
- `appKeyRef` argument format : alias (`ios_live`, `ios_dev`, `android_live`, `android_dev`, `web`) OR raw key string OR omitted.
- If omitted : use `BATCH_DEFAULT_APP_KEY` from credentials file.
- If alias : look up `app_keys.<alias>` in credentials file, error if missing with explicit message naming which key.
- If raw : use as-is.

---

## 4. Conventions

### 4.1 Naming

- File names : kebab-case `.mjs` (e.g., `in-app-campaigns.mjs`).
- Command names : in SKILL.md table, format `<resource> <action>` with hyphens for multi-word (e.g., `mep-campaigns create`, `custom-audience replace`).
- Function names : camelCase JS (e.g., `audiencesCreate`, `customAudienceReplace`).
- Constants : SCREAMING_SNAKE_CASE.

### 4.2 Error shape

All scripts emit errors as :
```json
{
  "ok": false,
  "command": "<resource> <action>",
  "platform": "cep" | "mep" | "local",
  "error": {
    "http_status": 401,             // or null for local errors
    "error_code": "AUTH_ERROR",     // Batch's code or local (e.g., "CONFIRM_REQUIRED", "CONFIG_MISSING")
    "error_message": "...",
    "endpoint": "/audiences/list",  // or null
    "retryable": false,
    "hint": "Actionable guidance."
  }
}
```

Local error codes :
- `CONFIG_MISSING` — credentials file absent/incomplete (Claude triggers setup)
- `CONFIG_INVALID` — credentials present but malformed
- `APPKEY_UNRESOLVED` — MEP app key alias not in credentials
- `CONFIRM_REQUIRED` — destructive op without `--confirm`
- `VALIDATION_ERROR` — input failed local validation (regex, enum, range)
- `UNEXPECTED` — generic catch-all

### 4.3 Output format

Every script writes EXACTLY one JSON object to stdout. No extra prints, no `console.log` for debugging. Use `console.error` for warnings (Claude reads stderr too, but typically ignores).

Pretty-printed (2-space indent) so users can `jq`-style inspect output.

### 4.4 Tests structure

Each test file follows the pattern :
```js
// tests/scripts/cep/audiences.test.mjs
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { dispatch } from "../../../skills/batch-cep/scripts/cep/audiences.mjs";
import { mockFetch, captureOutput, fakeCredentials } from "../../helpers.mjs";

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe("audiences create", () => {
  it("validates name regex (no spaces)", async () => {
    const out = await captureOutput(() =>
      dispatch("create", ["bad name", "custom_ids"], { credentials: fakeCredentials() })
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("calls /2.11/audiences/create with Bearer auth and project header", async () => {
    const fetchMock = mockFetch({ indexing_token: "tok_1" }, 202);
    globalThis.fetch = fetchMock;
    const out = await captureOutput(() =>
      dispatch("create", ["my_audience", "custom_ids"], { credentials: fakeCredentials() })
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/audiences/create");
    expect(init.headers.Authorization).toBe("Bearer rk-test");
    expect(init.headers["X-Batch-Project"]).toBe("proj-test");
    expect(JSON.parse(init.body)).toMatchObject({ name: "my_audience", type: "custom_ids" });
    expect(out.ok).toBe(true);
    expect(out.result.indexing_token).toBe("tok_1");
  });
  // ... 4-6 more cases per action
});
```

**Helpers in `tests/helpers.mjs`** :
- `mockFetch(body, status = 200, headers = {})` — returns a `vi.fn()` returning a Response-like object
- `captureOutput(fn)` — runs `fn()` while capturing `console.log`, returns parsed JSON output
- `fakeCredentials({ overrides })` — returns a default test credentials object (`rest_key: "rk-test"`, `project_key: "proj-test"`, `app_keys.ios_live: "app-ios-test"`)

### 4.5 Documentation style for references

Each `reference/<topic>.md` follows :
```markdown
# <Resource> — <action> (one line summary)

## Usage

```bash
node bin/batch.mjs <resource> <action> [args...]
```

## Arguments

| Arg | Type | Required | Description |
|---|---|---|---|
| ... | ... | ... | ... |

## Output

```json
{ "ok": true, "result": { ... } }
```

## Examples

[2-3 concrete invocations with expected output]

## Pitfalls

- [Non-obvious gotcha 1]
- [Non-obvious gotcha 2]

## See also

- [Cross-references]
```

References should be < 200 lines each for token efficiency.

---

## 5. Specification — `lib/` foundation

### 5.1 `lib/client.mjs`

**Exports** :

```js
// CEP — high-level
export async function cepFetch({ method, endpoint, body, restKey, projectKey, apiVersion = "2.11" }) { ... }
// Throws ClientError on non-2xx. Returns { status, data } on success.

// MEP — high-level
export async function mepFetch({ method, endpoint, body, restKey, appKey, apiVersion = "1.1" }) { ... }

// Error class
export class ClientError extends Error {
  constructor({ httpStatus, errorCode, errorMessage, endpoint, platform, retryable, hint }) { ... }
  toErrorPayload() { /* returns the error object for stdout JSON */ }
}
```

**Internal** :
- Single `request()` function that builds URL + headers + body, calls `fetch`, parses response.
- Headers are set per-platform. CEP : `Authorization: Bearer ${restKey}`, `X-Batch-Project: ${projectKey}`, `Content-Type: application/json`. MEP : `X-Authorization: ${restKey}`, `Content-Type: application/json`.
- For MEP, the app key is in the URL path : `${BASE_URL}/${apiVersion}/${appKey}${endpoint}`. For CEP : `${BASE_URL}/${apiVersion}${endpoint}`.
- Base URL : `BATCH_API_BASE_URL` env var or `"https://api.batch.com"` default.
- Timeout : 30s default, abortable via `AbortController`.
- Response parsing : check `Content-Type: application/json`, parse, else return as text.
- 202 with `indexing_token` body → return `{ status: 202, data: { indexing_token, ... } }`. Caller (script) decides how to surface.

**Test coverage (`tests/lib/client.test.mjs`)** ~10 tests :
- CEP fetch builds URL with version, sets auth headers, body JSON-encoded.
- MEP fetch embeds appKey in path, sets X-Authorization header (not Bearer).
- 200 returns `{ status, data }`.
- 202 returns `{ status: 202, data }` with indexing_token intact.
- 401 throws ClientError with appropriate hint.
- 429 throws ClientError with `retryable: true`.
- 500/503 throws ClientError with `retryable: true`.
- Network error throws ClientError with `httpStatus: null`, `error_code: "NETWORK_ERROR"`.
- Timeout (AbortError) throws ClientError with `error_code: "TIMEOUT"`.
- Base URL override via env var.

### 5.2 `lib/config.mjs`

**Exports** :

```js
export const CREDS_FILENAME = "batch-credentials.json";

export class ConfigMissingError extends Error { /* code: "CONFIG_MISSING" */ }
export class ConfigInvalidError extends Error { /* code: "CONFIG_INVALID" */ }
export class AppKeyUnresolvedError extends Error { /* code: "APPKEY_UNRESOLVED" */ }

export function getCredentialsPath() { /* returns ${PROJECT_FOLDER:-.}/${CREDS_FILENAME} */ }

export function loadCredentials() {
  // Reads + parses + validates structure
  // Returns: { rest_key, project_key?, app_keys?, default_app_key?, api_base_url? }
  // Throws ConfigMissingError if file absent
  // Throws ConfigInvalidError if file malformed or rest_key missing
}

export function getCepConfig() {
  // Loads creds, ensures rest_key + project_key are present
  // Returns: { restKey, projectKey, apiBaseUrl }
}

export function getMepConfig(appKeyRef) {
  // Loads creds, resolves appKey from ref (alias / raw / default)
  // Returns: { restKey, appKey, apiBaseUrl }
  // Throws AppKeyUnresolvedError with clear naming if alias unresolvable
}

export function resolveAppKey(creds, ref) {
  // Pure helper: ref → key string
  // Aliases: ios_live, ios_dev, android_live, android_dev, web
}
```

**Credentials file format** (`batch-credentials.json`) :
```json
{
  "rest_key": "<account-wide REST API key>",
  "project_key": "<CEP project key>",
  "app_keys": {
    "ios_live": "<key>",
    "ios_dev": "<key>",
    "android_live": "<key>",
    "android_dev": "<key>",
    "web": "<key>"
  },
  "default_app_key": "ios_live",
  "api_base_url": "https://api.batch.com"
}
```

Only `rest_key` is strictly required at the structural level. `project_key` is required only when calling CEP. `app_keys` are required only when calling MEP (and only the ones the user has).

**Test coverage** ~12 tests :
- Loads valid file, returns parsed credentials.
- Throws ConfigMissingError when file absent.
- Throws ConfigInvalidError when JSON malformed.
- Throws ConfigInvalidError when `rest_key` missing.
- `getCepConfig()` throws ConfigInvalidError when `project_key` missing.
- `getMepConfig("ios_live")` resolves alias to key string.
- `getMepConfig()` (no arg) uses `default_app_key`.
- `getMepConfig("ios_live")` throws AppKeyUnresolvedError when alias unset, mentioning `BATCH_IOS_LIVE_KEY` field path.
- `getMepConfig("rawkey123")` treats raw key as-is when no alias match.
- `${PROJECT_FOLDER}` env var override for path.
- Default path is `${cwd}/batch-credentials.json`.
- `api_base_url` defaults to `"https://api.batch.com"`.

### 5.3 `lib/validate.mjs`

**Exports** :

```js
// Returns { ok: true } | { ok: false, error: string }
export function validateCustomId(s) { /* max 512 chars, non-empty */ }
export function validateAudienceName(s) { /* /^[A-Za-z0-9_-]{1,255}$/ */ }
export function validateEventName(s) { /* /^[a-z0-9_]{1,30}$/ */ }
export function validateAppKeyAlias(s) { /* ios_live|ios_dev|android_live|android_dev|web */ }
export function validateAudienceType(s) { /* custom_ids|emails|install_ids */ }
export function validateCampaignState(s) { /* DRAFT|RUNNING|STOPPED */ }
export function validatePriority(s) { /* normal|high */ }
export function validatePushType(s) { /* alert|background */ }
export function validateInAppPriority(s) { /* STANDARD|IMPORTANT|CRITICAL */ }
export function validateInAppSegment(s) { /* NEW|ONE_TIME|ENGAGED|DORMANT|IMPORTED */ }
export function validateGroupId(s) { /* /^[A-Za-z0-9_-]+$/, max 128 */ }
export function validateRfcTimestamp(s) { /* RFC 3339 with offset OR literal "now" */ }
export function validateEmail(s) { /* basic email regex */ }
export function validateRegion(s) { /* ISO 3166-1 alpha-2, 2 chars */ }
export function validateLanguage(s) { /* BCP-47 basic */ }
export function validateTopicPreference(s) { /* /^[a-z0-9_-]{1,300}$/ */ }

// Composite validators
export function validateProfileEdit(edit) { /* identifiers + attributes + events */ }
export function validateRecipients(r) { /* at least one of tokens/custom_ids/install_ids/advertising_ids */ }
export function validateBatchEvent(event) { /* name + optional label/data/time */ }
```

All validators are pure functions, no I/O.

**Test coverage** ~30 tests (one per validator, mix RED and happy path).

---

## 6. Specification — CEP scripts (26 commands)

> **General handler skeleton** for each command :
> ```js
> async function handleAction(args, { credentials }) {
>   // 1. Parse args (positional + flags)
>   // 2. Validate inputs locally (via lib/validate.mjs)
>   //    On validation fail: print error JSON, exit 1
>   // 3. Get CEP config (lib/config.mjs)
>   // 4. Call cepFetch({ method, endpoint, body, ...config })
>   // 5. On success: print success JSON, exit 0
>   // 6. On ClientError: print error JSON via err.toErrorPayload(), exit 1
> }
> ```

### 6.1 `scripts/cep/profiles.mjs` — 3 commands

| Command | HTTP | Body sketch |
|---|---|---|
| `update <edits-json>` | POST /profiles/update | `[{identifiers, attributes?, events?}, ...]` (≤200) |
| `mass-update <edits-json>` | POST /profiles/mass-update | same shape (≤10000) |
| `export <types-csv> [filter-json]` | POST /profiles/export | `{types: [...], filter?: {...}}` |

Validation : each edit must have `identifiers` (one of `custom_id` ≤512 chars OR `installation: {apikey, installation_id}`), `attributes` if present is a record, `events` if present is array ≤15 with each event validated by `validateBatchEvent`.

**Output examples** :
- `update`: `{ ok: true, result: { status: "applied", count: <N> } }`
- `mass-update`: same
- `export`: `{ ok: true, result: { status: "requested", export_id: "...", next_step: "Poll via cep_exports_view" } }`

**Test plan** (~16 tests, see Phase 3 spec §5.1 for the exhaustive list — port them).

### 6.2 `scripts/cep/audiences.mjs` — 6 commands

| Command | HTTP | Async 202? |
|---|---|---|
| `create <name> <type> [display-name]` | POST /audiences/create | ✅ yes — returns indexing_token |
| `update <name> <ids-json>` | POST /audiences/update | ✅ yes |
| `replace <name> <ids-json>` | POST /audiences/replace | ✅ yes |
| `remove <name> <ids-json> --confirm` | POST /audiences/remove | ✅ yes, **destructive** |
| `list [--limit N] [--cursor C]` | POST /audiences/list | no |
| `view <token-or-name>` | POST /audiences/view | no |

`view` accepts EITHER an indexing_token (to poll async indexing status) OR an audience name (to get metadata). Dispatch based on whether arg is an audience name (regex match) or token (heuristic: any other string).

**Async 202 success shape** :
```json
{
  "ok": true,
  "result": {
    "status": "accepted",
    "indexing_token": "abc123...",
    "next_step": "Call `audiences view <indexing_token>` to poll indexing status. Indexing typically completes in 30s-5min depending on size."
  }
}
```

**Test plan** (~31 tests, port from Phase 3 §5.2).

### 6.3 `scripts/cep/campaigns.mjs` — 3 commands

| Command | HTTP | Confirm? |
|---|---|---|
| `create <data-json>` | POST /campaigns/create | no |
| `update <token> <patch-json>` | POST /campaigns/update | no |
| `delete <token> --confirm` | POST /campaigns/delete | **destructive** |

`create` accepts a JSON object with `name` (required, ≤255 chars), `targeting` (record, pass-through), `channels` (object with at least one of `push`/`email`/`sms`/`in_app`), and any other Batch field passes through. Validation is loose : structural check only.

`update` patch is full pass-through.

`delete` requires `--confirm` flag.

**Test plan** (~15 tests, port from Phase 3 §5.3).

### 6.4 `scripts/cep/catalogs.mjs` — 6 commands

| Command | HTTP | Confirm? |
|---|---|---|
| `create <name> <schema-json> [display-name]` | POST /catalogs/create | no |
| `update <name> [patch-json]` | POST /catalogs/update | no |
| `remove <name> --confirm` | POST /catalogs/remove | **destructive** |
| `view <name>` | POST /catalogs/view | no |
| `list [--limit N] [--cursor C]` | POST /catalogs/list | no |
| `edit-items <name> <operations-json>` | POST /catalogs/edit-items | no (mixed upsert+delete) |

Name regex : `/^[a-z0-9_-]{1,64}$/` (validated via `lib/validate.mjs`).

`edit-items` operations : array of `{op:"upsert", item:{}}` or `{op:"delete", id:""}`. Min 1 op, Batch-side rate limit applies.

**Test plan** (~25 tests, port from Phase 3 §5.4).

### 6.5 `scripts/cep/orchestrations.mjs` — 3 commands (read-only)

| Command | HTTP |
|---|---|
| `list [--limit N] [--cursor C] [--kind campaign\|automation]` | POST /orchestrations/list |
| `stats <token>` | POST /orchestrations/stats |
| `view <token>` | POST /orchestrations/view |

**Test plan** (~10 tests, port from Phase 3 §5.5).

### 6.6 `scripts/cep/exports.mjs` — 3 commands

| Command | HTTP |
|---|---|
| `list [--limit N] [--cursor C]` | POST /exports/list |
| `view <export-id>` | POST /exports/view |
| `download <export-id>` | GET /exports/download?id= (with `redirect: "manual"`) |

`download` is special : follow Phase 3 §5.6 — use `redirect: "manual"`, surface `Location` header if 3xx, surface inline metadata if 2xx.

**Output for `download`** :
```json
{
  "ok": true,
  "result": {
    "status": "redirect" | "inline",
    "download_url": "https://...",
    "content_type": "text/csv",
    "size_bytes": 1234567,
    "expires_at": "2026-05-13T15:00:00Z",
    "hint": "Open download_url in browser to retrieve the file."
  }
}
```

**Test plan** (~12 tests, port from Phase 3 §5.6).

### 6.7 `scripts/cep/segments.mjs` — 1 command (read-only)

| Command | HTTP |
|---|---|
| `list` | POST /segments/list |

Simplest script. Mostly a sanity-check tool.

**Test plan** (~3 tests).

---

## 7. Specification — MEP scripts (34 commands)

### 7.1 `scripts/mep/transactional.mjs` — 2 commands

| Command | HTTP | Confirm? |
|---|---|---|
| `send <data-json> [--app-key ALIAS_OR_RAW]` | POST /transactional/send | no |
| `stats <group-id> [--app-key ALIAS_OR_RAW]` | GET /transactional/stats/{group_id} | no |

`send` payload validates :
- `group_id` regex `/^[A-Za-z0-9_-]+$/`, ≤128 chars (required)
- `recipients` is an object (pass-through, Batch validates structure)
- `message` (single-lang) XOR `messages` (multi-lang) — refine
- `push_type: "background"` disallows `message` and `media` — refine
- `deeplink` XOR `landing` — refine
- All other documented fields per Phase 3 §5.1 transactional

**Test plan** (~12 tests, port from Phase 3 §5.1).

### 7.2 `scripts/mep/trigger-events.mjs` — 2 commands (path `/1.0/`)

| Command | HTTP | apiVersion |
|---|---|---|
| `send <custom-id> <events-json> [--app-key ...]` | POST /1.0/<APP_KEY>/events/users/<custom_id> | `"1.0"` |
| `send-bulk <users-json> [--app-key ...]` | POST /1.0/<APP_KEY>/events/users | `"1.0"` |

Critical : these are the ONLY scripts that pass `apiVersion: "1.0"` to `mepFetch()`. All others use default `"1.1"`.

`send` body : `{events: [{name, label?, data?, time?}, ...]}`, 1-1000 events.
`send-bulk` body : `[{id, events: [...]}, ...]`, 1+ users (Batch enforces 1000-event total cap).

**Test plan** (~10 tests, port from Phase 3 §5.9).

### 7.3 `scripts/mep/campaigns.mjs` — 6 commands

| Command | HTTP | Confirm? |
|---|---|---|
| `create <data-json> [--app-key ...]` | POST /campaigns/create | no |
| `update <token> <patch-json> [--app-key ...]` | POST /campaigns/update | no |
| `delete <token> --confirm [--app-key ...]` | POST /campaigns/delete | **destructive** |
| `stats <token> [--app-key ...]` | GET /campaigns/stats/{token} | no |
| `view <token> [--app-key ...]` | GET /campaigns/{token} | no |
| `list [--limit N] [--cursor C] [--app-key ...]` | GET /campaigns/list?... | no |

`create` validates: `name` (1-255 chars), `state` enum, `when` (object with `start_time` valid RFC 3339 or `"now"`), `messages` array with each `channel_type` ∈ {email, push}.

**Test plan** (~30 tests, port from Phase 3 §5.2).

### 7.4 `scripts/mep/in-app-campaigns.mjs` — 5 commands

| Command | HTTP | Confirm? |
|---|---|---|
| `create <data-json> [--app-key ...]` | POST /in-app-campaigns/create | no |
| `update <token> <patch-json> [--app-key ...]` | POST /in-app-campaigns/update | no |
| `delete <token> --confirm [--app-key ...]` | POST /in-app-campaigns/delete | **destructive** |
| `view <token> [--app-key ...]` | GET /in-app-campaigns/{token} | no |
| `list [--limit N] [--cursor C] [--app-key ...]` | GET /in-app-campaigns/list?... | no |

`create` validates : `name` ≥3 chars, `trigger` object, `landing` with `theme` + non-empty `contents`. Refines : `start_date` XOR `local_start_date`, `end_date` XOR `local_end_date`. `labels` max 3.

**Test plan** (~26 tests, port from Phase 3 §5.3).

### 7.5 `scripts/mep/custom-audience.mjs` — 6 commands (v1.1)

| Command | HTTP | Confirm? |
|---|---|---|
| `create <name> [--display-name X] [--install-ids JSON] [--app-key ...]` | POST /custom-audiences/create | no |
| `update <name> <install-ids-json> [--app-key ...]` | PATCH /custom-audiences/update | no |
| `replace <name> <install-ids-json> --confirm [--app-key ...]` | PUT /custom-audiences/replace | **destructive** (overwrite) |
| `remove <name> --confirm [--app-key ...]` | DELETE /custom-audiences/remove | **destructive** |
| `list [--limit N] [--cursor C] [--app-key ...]` | GET /custom-audiences/list?... | no |
| `view <name> [--app-key ...]` | GET /custom-audiences/view?name=... | no |

Name regex : `/^[A-Za-z0-9_-]{1,255}$/`. Install IDs : array, 1-50000 entries, each non-empty string.

`replace` is destructive per Phase 3 decision (drops install_ids not in new list).

**Test plan** (~31 tests, port from Phase 3 §5.4 + the post-review tightening on `replace`).

### 7.6 `scripts/mep/custom-data.mjs` — 2 commands

| Command | HTTP | Confirm? |
|---|---|---|
| `set <custom-id> <attributes-json> [--overwrite] [--app-key ...]` | POST /data/users/{custom_id} | no |
| `delete <custom-id> --confirm [--app-key ...]` | DELETE /data/users/{custom_id} | **destructive** |

Custom ID URL-encoded in path. `set` body : `{attributes, overwrite?}`. `delete` body empty.

**Test plan** (~10 tests, port from Phase 3 §5.5).

### 7.7 `scripts/mep/app-data.mjs` — 4 commands

| Command | HTTP | Confirm? |
|---|---|---|
| `set <key> <value-json> [--app-key ...]` | POST /data/app | no |
| `list [--limit N] [--cursor C] [--app-key ...]` | GET /data/app?... | no |
| `update <key> <value-json> [--app-key ...]` | PATCH /data/app/{key} | no |
| `delete <key> --confirm [--app-key ...]` | DELETE /data/app/{key} | **destructive** |

Key regex : `/^[A-Za-z0-9_-]{1,255}$/`. Value : any JSON-serializable.

**Test plan** (~17 tests, port from Phase 3 §5.6).

### 7.8 `scripts/mep/gdpr.mjs` — 4 commands

| Command | HTTP | Confirm? |
|---|---|---|
| `access-request <identifier-json> <notification-email> [--app-key ...]` | POST /gdpr/requests (body type:"access") | no |
| `erasure-request <identifier-json> <notification-email> --confirm [--app-key ...]` | POST /gdpr/requests (body type:"erasure") | **destructive** |
| `requests-list [--limit N] [--cursor C] [--app-key ...]` | GET /gdpr/requests?... | no |
| `requests-view <request-id> [--app-key ...]` | GET /gdpr/requests/{id} | no |

Identifier JSON : exactly one of `{custom_id}`, `{install_id}`, `{email}`. Validation via `lib/validate.mjs`.

**Output for create** :
```json
{
  "ok": true,
  "result": {
    "status": "requested",
    "request_id": "...",
    "next_step": "Call `gdpr requests-view <request_id>` to track. Notification email when ready (access) or completed (erasure)."
  }
}
```

**Test plan** (~17 tests, port from Phase 3 §5.7).

### 7.9 `scripts/mep/exports.mjs` — 3 commands

| Command | HTTP |
|---|---|
| `create <type> [--filter JSON] [--app-key ...]` | POST /exports/create |
| `list [--limit N] [--cursor C] [--app-key ...]` | GET /exports/list?... |
| `view <export-id> [--app-key ...]` | GET /exports/{id} |

**Test plan** (~12 tests, port from Phase 3 §5.8).

---

## 8. Specification — references (22 markdown files)

### 8.1 Cross-cutting (6 files)

- **`overview.md`** (~80 lines) — CEP vs MEP decision tree, auth differences, when to use which platform. Pulls from batch-api skill global content.
- **`setup.md`** (~150 lines) — Full first-run setup workflow: how Claude asks user for credentials, validation, writing the file, security notes. Includes a one-pager for the user to gather their keys from Batch dashboard.
- **`identifiers.md`** (~120 lines) — custom_id, install_id, email, advertising_id distinctions. When to use which. Limits (custom_id ≤512 chars, etc.). Edge cases (install_id with $email_* silently dropped).
- **`rate-limits.md`** (~80 lines) — 300/s per Custom ID, mass-update 10000/s no burst, catalog edit-items custom limit. Retry strategy.
- **`async-pattern.md`** (~60 lines) — 202 + indexing_token + view poll. Backoff guidance. CEP only (MEP is sync).
- **`errors.md`** (~100 lines) — HTTP status codes, error_code mappings, troubleshooting per code. Retryable vs not.

### 8.2 Per-resource CEP (7 files)

Each (~120-200 lines) covers : usage, arguments, return shape, examples (3+ concrete), pitfalls, cross-references.

- `cep/profiles.md`
- `cep/audiences.md`
- `cep/campaigns.md`
- `cep/catalogs.md`
- `cep/orchestrations.md`
- `cep/exports.md`
- `cep/segments.md`

### 8.3 Per-resource MEP (9 files)

Same shape :
- `mep/transactional.md`
- `mep/trigger-events.md` — emphasizes the `/1.0/` path quirk and the dashboard-automation use case
- `mep/campaigns.md`
- `mep/in-app-campaigns.md`
- `mep/custom-audience.md` — emphasizes v1.1 install-id only, contrast with CEP audiences
- `mep/custom-data.md`
- `mep/app-data.md`
- `mep/gdpr.md` — emphasizes erasure irreversibility
- `mep/exports.md`

---

## 9. Specification — `bin/batch.mjs` (dispatcher) + SKILL.md routing

### 9.1 `bin/batch.mjs`

~80 lines. Parses `process.argv`, dispatches dynamically.

```js
#!/usr/bin/env node
// bin/batch.mjs

const [, , resource, action, ...rest] = process.argv;

if (!resource || resource === "help") {
  console.log(JSON.stringify({ ok: true, hint: "Run `node bin/batch.mjs <resource> <action>` — see SKILL.md for the command table." }, null, 2));
  process.exit(0);
}

const RESOURCE_MAP = {
  // CEP
  "profiles": "cep/profiles.mjs",
  "audiences": "cep/audiences.mjs",
  "campaigns": "cep/campaigns.mjs",
  "catalogs": "cep/catalogs.mjs",
  "orchestrations": "cep/orchestrations.mjs",
  "exports": "cep/exports.mjs",
  "segments": "cep/segments.mjs",
  // MEP — note disambiguation prefixes
  "transactional": "mep/transactional.mjs",
  "trigger-events": "mep/trigger-events.mjs",
  "mep-campaigns": "mep/campaigns.mjs",
  "in-app": "mep/in-app-campaigns.mjs",
  "custom-audience": "mep/custom-audience.mjs",
  "custom-data": "mep/custom-data.mjs",
  "app-data": "mep/app-data.mjs",
  "gdpr": "mep/gdpr.mjs",
  "mep-export": "mep/exports.mjs",
  // Meta
  "setup": "_setup.mjs"
};

const scriptPath = RESOURCE_MAP[resource];
if (!scriptPath) {
  console.error(JSON.stringify({ ok: false, error: { error_code: "UNKNOWN_RESOURCE", error_message: `Unknown resource: ${resource}`, hint: "Run `node bin/batch.mjs` for help." } }, null, 2));
  process.exit(1);
}

const mod = await import(new URL(`../scripts/${scriptPath}`, import.meta.url));
await mod.dispatch(action, rest);
```

### 9.2 SKILL.md routing (already done Phase 4)

The SKILL.md drafted Phase 4 contains the command table. The routing rules already documented:
1. No argument → render menu.
2. First word matches → load reference + execute.
3. No match → suggest closest.

---

## 10. Test plan summary

| Group | File | Test count |
|---|---|---|
| lib/client | tests/lib/client.test.mjs | 10 |
| lib/config | tests/lib/config.test.mjs | 12 |
| lib/validate | tests/lib/validate.test.mjs | 30 |
| cep/profiles | tests/scripts/cep/profiles.test.mjs | 16 |
| cep/audiences | tests/scripts/cep/audiences.test.mjs | 31 |
| cep/campaigns | tests/scripts/cep/campaigns.test.mjs | 15 |
| cep/catalogs | tests/scripts/cep/catalogs.test.mjs | 25 |
| cep/orchestrations | tests/scripts/cep/orchestrations.test.mjs | 10 |
| cep/exports | tests/scripts/cep/exports.test.mjs | 12 |
| cep/segments | tests/scripts/cep/segments.test.mjs | 3 |
| mep/transactional | tests/scripts/mep/transactional.test.mjs | 12 |
| mep/trigger-events | tests/scripts/mep/trigger-events.test.mjs | 10 |
| mep/campaigns | tests/scripts/mep/campaigns.test.mjs | 30 |
| mep/in-app-campaigns | tests/scripts/mep/in-app-campaigns.test.mjs | 26 |
| mep/custom-audience | tests/scripts/mep/custom-audience.test.mjs | 31 |
| mep/custom-data | tests/scripts/mep/custom-data.test.mjs | 10 |
| mep/app-data | tests/scripts/mep/app-data.test.mjs | 17 |
| mep/gdpr | tests/scripts/mep/gdpr.test.mjs | 17 |
| mep/exports | tests/scripts/mep/exports.test.mjs | 12 |
| **Total** | | **~329 tests** |

(Comparable to Phase 1-3's 318 specs — sanity check on coverage parity.)

### TDD enforcement

For each script, this is the exact loop :
1. Write the test file with all RED cases first (validation, error mapping, app_key resolution failure).
2. Run `pnpm vitest tests/scripts/<platform>/<resource>.test.mjs` → expect FAIL with "module not found".
3. Write the script (handlers + dispatcher).
4. Run vitest again → expect all GREEN.
5. Run `pnpm vitest` (full suite) → no regression.
6. Commit.

### Mock fetch pattern

`tests/helpers.mjs` provides :
```js
import { vi } from "vitest";

export function mockFetch(body, status = 200, headers = {}) {
  return vi.fn(async () => new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    { status, headers: { "Content-Type": "application/json", ...headers } }
  ));
}

export async function captureOutput(fn) {
  const logs = [];
  const orig = console.log;
  console.log = (s) => logs.push(s);
  try { await fn(); } finally { console.log = orig; }
  return JSON.parse(logs.join("\n"));
}

export function fakeCredentials(overrides = {}) {
  return {
    rest_key: "rk-test",
    project_key: "proj-test",
    app_keys: {
      ios_live: "app-ios-test",
      android_live: "app-android-test",
      web: "app-web-test"
    },
    default_app_key: "ios_live",
    api_base_url: "https://api.batch.com",
    ...overrides
  };
}
```

---

## 11. Implementation order

Recommended sequence for subagent dispatch (each = 1 subagent task, RED→GREEN→commit) :

**Foundation** (must be done first, others depend on it) :
1. `package.json` + `vitest.config.mjs` + `biome.json` + `.gitignore` (config files, 1 commit)
2. `tests/helpers.mjs` (test infrastructure, no separate tests)
3. `lib/validate.mjs` + tests (~30 tests)
4. `lib/client.mjs` + tests (~10 tests)
5. `lib/config.mjs` + tests (~12 tests)
6. `bin/batch.mjs` (dispatcher skeleton, no tests — sanity-tested via resource scripts)

**CEP** (can be parallelized once foundation is done) :
7. `scripts/cep/segments.mjs` + tests (simplest, validates pattern)
8. `scripts/cep/profiles.mjs` + tests
9. `scripts/cep/audiences.mjs` + tests (first async 202 pattern)
10. `scripts/cep/campaigns.mjs` + tests
11. `scripts/cep/catalogs.mjs` + tests (catches edit-items composite pattern)
12. `scripts/cep/orchestrations.mjs` + tests
13. `scripts/cep/exports.mjs` + tests (special download redirect)

**MEP** :
14. `scripts/mep/transactional.mjs` + tests (first MEP, validates app_key pattern)
15. `scripts/mep/trigger-events.mjs` + tests (first /1.0/ apiVersion override)
16. `scripts/mep/custom-data.mjs` + tests (simplest MEP after transactional)
17. `scripts/mep/app-data.mjs` + tests
18. `scripts/mep/custom-audience.mjs` + tests (v1.1, multiple HTTP verbs)
19. `scripts/mep/exports.mjs` + tests
20. `scripts/mep/gdpr.mjs` + tests
21. `scripts/mep/campaigns.mjs` + tests (large schema)
22. `scripts/mep/in-app-campaigns.mjs` + tests (large schema with refines)

**Documentation** (can be done in parallel by separate subagents) :
23. `reference/overview.md` + 5 other cross-cutting docs
24. `reference/cep/*.md` (7 files)
25. `reference/mep/*.md` (9 files)
26. `examples/first-run-setup.md` + `create-campaign.md` + `csv-sync.mjs`

**Finalization** :
27. Run full test suite, validate ~329 tests pass
28. Sanity-test full `bin/batch.mjs` paths via a smoke script
29. Update SKILL.md if any deviation from the Phase 4 draft
30. Update plugin.json version + commit
31. PR if applicable

After each task: `pnpm vitest && pnpm biome check .` must be green.

---

## 12. Open questions deferred to implementation

These will be resolved by writing failing tests first :

1. **Cowork sandbox file path mounts** — actual paths for `${PROJECT_FOLDER}` and skill files when running in Cowork. Test by writing a debug script that prints `process.cwd()`, `__dirname`, env vars. First impl of `lib/config.mjs` probes this.
2. **Network access constraints** — Cowork may restrict `fetch` to certain domains. Confirmed at first script execution.
3. **vitest in Cowork sandbox** — likely NOT needed (we test dev-time on the developer's machine, not in Cowork). But if someone runs `pnpm test` from inside Cowork, do we want a graceful skip?
4. **package install in Cowork sandbox** — Cowork claude.ai can install from npm; do we want to lock vitest version? Probably yes via `package-lock.json` or `pnpm-lock.yaml` committed.
5. **The `_setup.mjs` script for first-run** — may be a real script (interactive readline) or just instructions in SKILL.md telling Claude to ask the user and write the file. Decision deferred to impl Task 6.

---

## 13. Acceptance criteria

- [ ] All 60 commands implemented across 16 scripts.
- [ ] Foundation : `lib/{client,config,validate}.mjs` + `bin/batch.mjs` complete and tested.
- [ ] 22 reference markdown files written.
- [ ] 3 examples written.
- [ ] `pnpm vitest` passes ~329 tests.
- [ ] `pnpm biome check .` clean (no lint/format issues).
- [ ] `node bin/batch.mjs help` returns the help JSON.
- [ ] `node bin/batch.mjs audiences list` works against a real Batch test project (smoke test with real credentials, manual).
- [ ] Skill loads in Cowork (manual upload test) and Claude responds correctly to "list mes audiences batch" by executing the expected bash command and parsing the output.
- [ ] PR opened on `driven-alex-plugins`, code-review run, merged.

---

## 14. Alignment decisions recap (consolidated)

| Decision | Choice | Rationale |
|---|---|---|
| Format | Plain `.mjs`, no TS, no bundle | Pragma, Dougs-aligned, port-friendly from TS reference |
| Validation | Manual helpers in `lib/validate.mjs` | No Zod (ESM/bundle overhead). Reuse regex/enum values from Phase 3 Zod schemas. |
| Auth | Per-customer local `batch-credentials.json` | Batch official recommendation. Server-side from Claude's pov (local to Project). |
| Setup | Auto first-run via Claude chat → writes file | Aligned Cowork "codify this" UX. Zero manual upload of credentials.json. |
| Errors | Standard shape `{ok, command, platform, error:{...}}`, exit code 1 | Predictable for Claude, structured for output JSON parsing. |
| Confirm gate | `--confirm` flag required on destructive commands + Claude asks user before invoking | Mirror Phase 3 confirm gate, prevent accidents. |
| Async 202 | Script returns `indexing_token`, Claude polls via `audiences view <token>` | Same as Phase 3 — no auto-polling in scripts. |
| Tests | Vitest, mock fetch | Same as Phase 3, parity in test coverage. |
| Lint | Biome | Match Dougs/impeccable conventions. |
| Distribution | Plugin marketplace (`driven-alex-plugins`) + .zip release (skills/batch-cep/) for Cowork upload | Both channels cohabit. |
| Repo `batch-mcp` | Stays as Phase 1-3 reference, no merge of PR #2 yet | Used as source of truth during port. Archive after Phase 5 mature. |
| MEP scope | Included (34 tools) despite plugin name being "batch-cep" | Naming = positioning (CEP modern). Code = full coverage. |
| Trigger events | Included (path /1.0/ via apiVersion override) | Critical per Alex's brainstorming feedback. |
| Custom audience | v1.1 only (install-id) | Phase 3 decision : v1.0 superseded by CEP for profile-level. |
| GDPR | Split access vs erasure (2 separate commands) | Phase 3 decision : erasure is destructive, access is not. |
| Recipients model | Pass-through validation | Phase 3 decision. |
| Strict Zod scope (now → manual validation) | Strict on transactional + campaigns + in-app top-level fields | Phase 3 decision: preserve type safety for high-traffic tools. |

---

**End of spec.** Total file count target : ~68 new files. Test count target : ~329. Estimated subagent-time : ~5-7 days for sequential execution, ~2-3 days with parallel dispatch on independent resources.
