// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, mepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";

// Audience name regex: [A-Za-z0-9_-], 1-255 chars
const NAME_RE = /^[A-Za-z0-9_-]{1,255}$/;

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
    return emitSuccess(`custom-audience ${action}`, result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return emitError({
        error_code: "VALIDATION_ERROR",
        error_message: err.message,
        hint: err.hint ?? "Fix the input and retry.",
      });
    }
    if (err instanceof ConfirmError) {
      return emitConfirmError(`custom-audience ${action}`);
    }
    if (err instanceof ClientError) {
      const out = {
        ok: false,
        command: `custom-audience ${action}`,
        platform: "mep",
        error: {
          http_status: err.httpStatus,
          error_code: err.errorCode ?? null,
          error_message: err.errorMessage,
          endpoint: err.endpoint,
          retryable: err.retryable,
          hint: err.hint,
        },
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
// Error classes
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
      hint: "Re-run with --confirm to proceed.",
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
 * Validate audience name against /^[A-Za-z0-9_-]{1,255}$/.
 */
function validateName(name) {
  if (!name || !NAME_RE.test(name)) {
    throw new ValidationError(
      `Invalid audience name: "${name}". Must match [A-Za-z0-9_-], 1-255 chars.`,
      "Names can contain letters, digits, underscores, and hyphens only.",
    );
  }
}

/**
 * Parse a JSON string argument as an install_ids array.
 * Validates: non-empty array, 1-50000 items, each a non-empty string.
 */
function parseInstallIds(raw, argName = "install_ids") {
  let ids;
  try {
    ids = JSON.parse(raw);
  } catch {
    throw new ValidationError(`${argName} is not valid JSON.`, "Pass a JSON array of strings.");
  }
  if (!Array.isArray(ids)) {
    throw new ValidationError(`${argName} must be a JSON array.`);
  }
  if (ids.length === 0) {
    throw new ValidationError(`${argName} must contain at least 1 element.`);
  }
  if (ids.length > 50_000) {
    throw new ValidationError(`${argName} must contain at most 50000 elements.`);
  }
  for (let i = 0; i < ids.length; i++) {
    if (typeof ids[i] !== "string" || ids[i].length === 0) {
      throw new ValidationError(`${argName}[${i}] must be a non-empty string.`);
    }
  }
  return ids;
}

/**
 * Resolve app key alias to actual key value from credentials.
 * Falls back to default_app_key if not specified.
 */
function resolveAppKey(credentials, alias) {
  const keyToUse = alias ?? credentials.default_app_key;
  if (!credentials.app_keys || !credentials.app_keys[keyToUse]) {
    throw new ValidationError(
      `App key alias "${keyToUse}" not found in batch-credentials.json`,
      `Valid aliases: ${Object.keys(credentials.app_keys ?? {}).join(", ")}`,
    );
  }
  return credentials.app_keys[keyToUse];
}

/**
 * Parse a common flag from args: --flag value.
 * Returns the value or undefined if not present.
 */
function parseFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return undefined;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * create <name> [--display-name X] [--install-ids JSON] [--app-key ...]
 * POST /1.1/<app_key>/custom-audiences/create
 */
async function handleCreate(args) {
  const name = args[0];
  if (!name) {
    throw new ValidationError("Missing name (first positional argument).");
  }
  validateName(name);

  const displayName = parseFlag(args, "--display-name");
  const installIdsRaw = parseFlag(args, "--install-ids");
  const appKeyAlias = parseFlag(args, "--app-key");

  const install_ids = installIdsRaw ? parseInstallIds(installIdsRaw) : undefined;

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyAlias);

  const body = { name };
  if (displayName !== undefined) body.display_name = displayName;
  if (install_ids !== undefined) body.install_ids = install_ids;

  const response = await mepFetch(
    creds,
    "POST",
    `1.1/${appKeyValue}/custom-audiences/create`,
    body,
  );

  return { raw: response.data ?? {} };
}

/**
 * update <name> <install-ids-json> [--app-key ...]
 * PATCH /1.1/<app_key>/custom-audiences/update
 */
async function handleUpdate(args) {
  const name = args[0];
  if (!name) {
    throw new ValidationError("Missing name (first positional argument).");
  }
  validateName(name);

  const installIdsRaw = args[1];
  if (!installIdsRaw) {
    throw new ValidationError("Missing install_ids argument. Pass a JSON array of install IDs.");
  }
  const install_ids = parseInstallIds(installIdsRaw);

  const appKeyAlias = parseFlag(args, "--app-key");

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyAlias);

  const response = await mepFetch(creds, "PATCH", `1.1/${appKeyValue}/custom-audiences/update`, {
    name,
    install_ids,
  });

  return { raw: response.data ?? {} };
}

/**
 * replace <name> <install-ids-json> --confirm [--app-key ...]
 * PUT /1.1/<app_key>/custom-audiences/replace
 * DESTRUCTIVE — confirm gate required.
 */
async function handleReplace(args) {
  if (!args.includes("--confirm")) {
    throw new ConfirmError();
  }

  const name = args[0];
  if (!name) {
    throw new ValidationError("Missing name (first positional argument).");
  }
  validateName(name);

  const installIdsRaw = args[1];
  if (!installIdsRaw) {
    throw new ValidationError("Missing install_ids argument. Pass a JSON array of install IDs.");
  }
  const install_ids = parseInstallIds(installIdsRaw);

  const appKeyAlias = parseFlag(args, "--app-key");

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyAlias);

  const response = await mepFetch(creds, "PUT", `1.1/${appKeyValue}/custom-audiences/replace`, {
    name,
    install_ids,
  });

  return { raw: response.data ?? {} };
}

/**
 * remove <name> --confirm [--app-key ...]
 * DELETE /1.1/<app_key>/custom-audiences/remove  body: {name}
 * DESTRUCTIVE — confirm gate required.
 */
async function handleRemove(args) {
  if (!args.includes("--confirm")) {
    throw new ConfirmError();
  }

  const name = args[0];
  if (!name) {
    throw new ValidationError("Missing name (first positional argument).");
  }
  validateName(name);

  const appKeyAlias = parseFlag(args, "--app-key");

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyAlias);

  await mepFetch(creds, "DELETE", `1.1/${appKeyValue}/custom-audiences/remove`, { name });

  return { status: "deleted", name };
}

/**
 * list [--limit N] [--cursor C] [--app-key ...]
 * GET /1.1/<app_key>/custom-audiences/list?limit=...&cursor=...
 */
async function handleList(args) {
  const limitRaw = parseFlag(args, "--limit");
  const cursor = parseFlag(args, "--cursor");
  const appKeyAlias = parseFlag(args, "--app-key");

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyAlias);

  const qs = new URLSearchParams();
  if (limitRaw !== undefined) {
    const limit = Number.parseInt(limitRaw, 10);
    if (!Number.isNaN(limit)) qs.set("limit", String(limit));
  }
  if (cursor) qs.set("cursor", cursor);

  const path = `1.1/${appKeyValue}/custom-audiences/list${qs.toString() ? `?${qs.toString()}` : ""}`;
  const response = await mepFetch(creds, "GET", path);

  const result = {
    audiences: response.data?.audiences ?? [],
  };
  if (response.data?.next_cursor) {
    result.next_cursor = response.data.next_cursor;
  }

  return result;
}

/**
 * view <name> [--app-key ...]
 * GET /1.1/<app_key>/custom-audiences/view?name=...
 */
async function handleView(args) {
  const name = args[0];
  if (!name) {
    throw new ValidationError("Missing name (first positional argument).");
  }
  validateName(name);

  const appKeyAlias = parseFlag(args, "--app-key");

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyAlias);

  const qs = new URLSearchParams({ name });
  const response = await mepFetch(
    creds,
    "GET",
    `1.1/${appKeyValue}/custom-audiences/view?${qs.toString()}`,
  );

  return { raw: response.data ?? {} };
}
