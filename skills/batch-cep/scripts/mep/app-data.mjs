// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, mepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";

// App data key regex: [A-Za-z0-9_-], 1-255 chars
const KEY_RE = /^[A-Za-z0-9_-]{1,255}$/;

const ACTIONS = {
  set: handleSet,
  list: handleList,
  update: handleUpdate,
  delete: handleDelete,
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
    return emitSuccess(`app-data ${action}`, result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return emitError({
        error_code: "VALIDATION_ERROR",
        error_message: err.message,
        hint: err.hint ?? "Fix the input and retry.",
      });
    }
    if (err instanceof ConfirmError) {
      return emitConfirmError(`app-data ${action}`);
    }
    if (err instanceof ClientError) {
      const payload = err.toErrorPayload();
      const out = {
        ok: false,
        command: `app-data ${action}`,
        platform: "mep",
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
  const out = { ok: true, command, platform: "mep", result };
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
      hint: "Re-run with --confirm to proceed. This permanently deletes the app data key.",
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
 * Validate key against /^[A-Za-z0-9_-]{1,255}$/.
 */
function validateKey(key) {
  if (!key || !KEY_RE.test(key)) {
    throw new ValidationError(
      `Invalid app-data key: "${key}". Must match [A-Za-z0-9_-], 1-255 chars.`,
      "Keys can contain lowercase/uppercase letters, digits, underscores, and hyphens only.",
    );
  }
}

/**
 * Parse a JSON string argument.
 */
function parseJsonArg(raw, argName = "value") {
  if (!raw) {
    throw new ValidationError(
      `Missing ${argName} argument. Pass a JSON value.`,
      `Example: '{"count":5}' or '"string_value"' or '123' or 'true'`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError(`${argName} argument is not valid JSON.`, "Pass a valid JSON value.");
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * set <key> <value-json> [--app-key ...]
 * POST /data/app
 */
async function handleSet(args) {
  const [key, valueRaw, ...rest] = args;

  validateKey(key);
  const value = parseJsonArg(valueRaw, "value");

  // Parse optional --app-key flag
  let appKeyRef;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--app-key" && rest[i + 1]) {
      appKeyRef = rest[i + 1];
      i++;
    }
  }

  const creds = getCredentials();
  const appKey = appKeyRef || creds.default_app_key;

  await mepFetch(creds, "POST", `1.1/${appKey}/data/app`, { key, value });

  return { status: "created", key };
}

/**
 * list [--limit N] [--cursor C] [--app-key ...]
 * GET /data/app?limit=...&cursor=...
 */
async function handleList(args) {
  const query = {};
  let appKeyRef;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      const limit = Number.parseInt(args[i + 1], 10);
      if (!Number.isNaN(limit)) query.limit = limit;
      i++;
    } else if (args[i] === "--cursor" && args[i + 1]) {
      query.cursor = args[i + 1];
      i++;
    } else if (args[i] === "--app-key" && args[i + 1]) {
      appKeyRef = args[i + 1];
      i++;
    }
  }

  const creds = getCredentials();
  const appKey = appKeyRef || creds.default_app_key;

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    qs.set(k, String(v));
  }
  const path = `1.1/${appKey}/data/app${qs.toString() ? `?${qs.toString()}` : ""}`;

  const response = await mepFetch(creds, "GET", path);

  const result = {
    data: response.data?.data ?? [],
  };
  if (response.data?.next_cursor) {
    result.next_cursor = response.data.next_cursor;
  }

  return result;
}

/**
 * update <key> <value-json> [--app-key ...]
 * PATCH /data/app/{key}
 */
async function handleUpdate(args) {
  const [key, valueRaw, ...rest] = args;

  validateKey(key);
  const value = parseJsonArg(valueRaw, "value");

  let appKeyRef;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--app-key" && rest[i + 1]) {
      appKeyRef = rest[i + 1];
      i++;
    }
  }

  const creds = getCredentials();
  const appKey = appKeyRef || creds.default_app_key;
  const encodedKey = encodeURIComponent(key);

  await mepFetch(creds, "PATCH", `1.1/${appKey}/data/app/${encodedKey}`, { value });

  return { status: "updated", key };
}

/**
 * delete <key> --confirm [--app-key ...]
 * DELETE /data/app/{key}
 */
async function handleDelete(args) {
  const [key, ...rest] = args;

  // Confirm gate must come before key validation
  if (!rest.includes("--confirm")) {
    throw new ConfirmError();
  }

  validateKey(key);

  let appKeyRef;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--app-key" && rest[i + 1]) {
      appKeyRef = rest[i + 1];
      i++;
    }
  }

  const creds = getCredentials();
  const appKey = appKeyRef || creds.default_app_key;
  const encodedKey = encodeURIComponent(key);

  await mepFetch(creds, "DELETE", `1.1/${appKey}/data/app/${encodedKey}`, undefined);

  return { status: "deleted", key };
}
