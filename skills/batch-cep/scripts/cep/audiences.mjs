// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, cepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";

// Audience name regex: [A-Za-z0-9_-], 1-255 chars
const AUDIENCE_NAME_RE = /^[A-Za-z0-9_-]{1,255}$/;
const VALID_TYPES = new Set(["custom_ids", "emails", "install_ids"]);

// Heuristic: strings longer than 64 chars are treated as indexing_token
// Short strings matching the audience name regex are treated as audience names
const NAME_MAX_LEN_HEURISTIC = 64;

const ASYNC_NEXT_STEP =
  "Call `audiences view <indexing_token>` to poll indexing status. " +
  "Indexing typically completes in 30s-5min depending on size.";

const ACTIONS = {
  create: handleCreate,
  update: handleUpdate,
  replace: handleReplace,
  remove: handleRemove,
  list: handleList,
  view: handleView,
};

/**
 * Testable entry point — returns output object, does NOT call process.exit.
 */
export async function runAction(action, args) {
  const handler = ACTIONS[action];
  if (!handler) {
    return emitError({
      error_code: "UNKNOWN_ACTION",
      error_message: `Unknown action: ${action}`,
      hint: `Valid actions: ${Object.keys(ACTIONS).join(", ")}`,
    });
  }
  try {
    const result = await handler(args);
    return emitSuccess(`audiences ${action}`, result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return emitError({
        error_code: "VALIDATION_ERROR",
        error_message: err.message,
        hint: err.hint ?? "Fix the input and retry.",
      });
    }
    if (err instanceof ConfirmError) {
      return emitConfirmError(`audiences ${action}`);
    }
    // Check ClientError before config checks — ClientError messages may contain
    // substrings like "not found" which would otherwise match isConfigMissing.
    if (err instanceof ClientError) {
      const payload = err.toErrorPayload();
      const out = {
        ok: false,
        command: `audiences ${action}`,
        platform: "cep",
        error: payload,
      };
      console.log(JSON.stringify(out, null, 2));
      return out;
    }
    if (isConfigMissing(err)) {
      return emitError({
        error_code: "CONFIG_MISSING",
        error_message: err.message,
        hint: "Run `node bin/batch.mjs setup` first or write batch-credentials.json manually.",
      });
    }
    if (isConfigInvalid(err)) {
      return emitError({
        error_code: "CONFIG_INVALID",
        error_message: err.message,
        hint: "Check batch-credentials.json structure.",
      });
    }
    return emitError({
      error_code: "UNEXPECTED",
      error_message: err.message,
      hint: "Unexpected error.",
    });
  }
}

/**
 * CLI entry point — calls runAction, then process.exit on error.
 */
export async function dispatch(action, args) {
  const out = await runAction(action, args);
  if (!out.ok) process.exit(1);
}

// ---------------------------------------------------------------------------
// Internal error classes
// ---------------------------------------------------------------------------

class ValidationError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = "ValidationError";
    this.hint = hint;
  }
}

class ConfirmError extends Error {
  constructor() {
    super("Destructive operation requires --confirm flag.");
    this.name = "ConfirmError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emitSuccess(command, result) {
  const out = { ok: true, command, platform: "cep", result };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function emitError(error) {
  const out = {
    ok: false,
    command: error.command || "unknown",
    platform: error.platform || "local",
    error: {
      http_status: null,
      error_code: error.error_code,
      error_message: error.error_message,
      endpoint: null,
      retryable: false,
      hint: error.hint,
    },
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function emitConfirmError(command) {
  const out = {
    ok: false,
    command,
    platform: "local",
    error: {
      http_status: null,
      error_code: "CONFIRM_REQUIRED",
      error_message: "Destructive operation requires --confirm flag.",
      endpoint: null,
      retryable: false,
      hint: "Re-run with --confirm to proceed. This removes ids from the audience permanently.",
    },
  };
  console.log(JSON.stringify(out, null, 2));
  return out;
}

function isConfigMissing(err) {
  return (
    err instanceof Error && (err.message.includes("not found") || err.message.includes("ENOENT"))
  );
}

function isConfigInvalid(err) {
  return (
    err instanceof Error &&
    (err.message.includes("invalid JSON") ||
      err.message.includes("is required") ||
      err.message.includes("must have"))
  );
}

function getCredentials() {
  const folder = process.env.PROJECT_FOLDER;
  const credPath = folder ? `${folder}/batch-credentials.json` : undefined;
  return loadConfig(credPath);
}

/**
 * Validate audience name against [A-Za-z0-9_-]{1,255}.
 */
function validateName(name) {
  if (!name || !AUDIENCE_NAME_RE.test(name)) {
    throw new ValidationError(
      `Invalid audience name: "${name}". Must match [A-Za-z0-9_-], 1-255 chars.`,
      "Audience names are case-sensitive and immutable after creation.",
    );
  }
}

/**
 * Parse and validate ids JSON arg (array, min 1 element).
 */
function parseIds(raw) {
  if (!raw) {
    throw new ValidationError(
      "Missing ids argument. Pass a JSON array of IDs.",
      'Example: \'["user_1","user_2"]\'',
    );
  }
  let ids;
  try {
    ids = JSON.parse(raw);
  } catch {
    throw new ValidationError(
      "ids argument is not valid JSON.",
      "Pass a JSON array of string IDs.",
    );
  }
  if (!Array.isArray(ids)) {
    throw new ValidationError("ids must be a JSON array.");
  }
  if (ids.length === 0) {
    throw new ValidationError(
      "ids must contain at least one element.",
      "Pass a non-empty array of IDs.",
    );
  }
  return ids;
}

/**
 * Build the accepted (202) result object.
 */
function acceptedResult(indexing_token) {
  return {
    status: "accepted",
    indexing_token,
    next_step: ASYNC_NEXT_STEP,
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * create <name> <type> [display_name]
 * POST /audiences/create → 202
 */
async function handleCreate(args) {
  const [name, type, display_name] = args;

  validateName(name);

  if (!type || !VALID_TYPES.has(type)) {
    throw new ValidationError(
      `Invalid audience type: "${type}". Must be one of: ${Array.from(VALID_TYPES).join(", ")}.`,
    );
  }

  const body = { name, type };
  if (display_name) body.display_name = display_name;

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/audiences/create", body);

  return acceptedResult(response.data.indexing_token);
}

/**
 * update <name> <ids-json>
 * POST /audiences/update → 202
 */
async function handleUpdate(args) {
  const [name, idsRaw] = args;

  validateName(name);
  const ids = parseIds(idsRaw);

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/audiences/update", { name, ids });

  return acceptedResult(response.data.indexing_token);
}

/**
 * replace <name> <ids-json>
 * POST /audiences/replace → 202 (full overwrite)
 */
async function handleReplace(args) {
  const [name, idsRaw] = args;

  validateName(name);
  const ids = parseIds(idsRaw);

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/audiences/replace", { name, ids });

  return acceptedResult(response.data.indexing_token);
}

/**
 * remove <name> <ids-json> [--confirm]
 * POST /audiences/remove → 202 — DESTRUCTIVE
 */
async function handleRemove(args) {
  const [name, idsRaw, ...rest] = args;

  // Confirm gate: --confirm must be present as a positional arg
  if (!rest.includes("--confirm")) {
    throw new ConfirmError();
  }

  validateName(name);
  const ids = parseIds(idsRaw);

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/audiences/remove", { name, ids });

  return acceptedResult(response.data.indexing_token);
}

/**
 * list [--limit N] [--cursor C]
 * POST /audiences/list — sync
 */
async function handleList(args) {
  // Parse --limit and --cursor flags
  const body = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      const limit = Number.parseInt(args[i + 1], 10);
      if (!Number.isNaN(limit)) body.limit = limit;
      i++;
    } else if (args[i] === "--cursor" && args[i + 1]) {
      body.cursor = args[i + 1];
      i++;
    }
  }

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/audiences/list", body);

  const result = { audiences: response.data?.audiences ?? [] };
  if (response.data?.next_cursor) result.next_cursor = response.data.next_cursor;

  return result;
}

/**
 * view <token-or-name>
 * POST /audiences/view — sync
 * Discriminates between indexing_token and audience name by length heuristic:
 * - If arg matches the name regex AND length <= 64 → treat as name
 * - Otherwise → treat as indexing_token
 */
async function handleView(args) {
  const arg = args[0];

  if (!arg) {
    throw new ValidationError(
      "Missing argument. Provide either an audience name or an indexing_token.",
      "Usage: audiences view <name-or-token>",
    );
  }

  const isName = AUDIENCE_NAME_RE.test(arg) && arg.length <= NAME_MAX_LEN_HEURISTIC;
  const body = isName ? { name: arg } : { indexing_token: arg };

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/audiences/view", body);

  return { audience: response.data };
}
