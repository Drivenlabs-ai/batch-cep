// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, mepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";
import { validateCustomId } from "../../lib/validate.mjs";

const ACTIONS = {
  set: handleSet,
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
    return emitSuccess(`custom-data ${action}`, result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return emitError({
        error_code: "VALIDATION_ERROR",
        error_message: err.message,
        hint: err.hint ?? "Fix the input and retry.",
      });
    }
    if (err instanceof ConfirmError) {
      return emitError({
        error_code: "CONFIRM_REQUIRED",
        error_message: err.message,
        hint: err.hint ?? "Add --confirm to proceed.",
      });
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
    if (err instanceof ClientError) {
      const out = {
        ok: false,
        command: `custom-data ${action}`,
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
  constructor(message, hint) {
    super(message);
    this.name = "ConfirmError";
    this.hint = hint;
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

function isConfigMissing(err) {
  return (
    err instanceof Error &&
    (err.message.includes("batch-credentials.json") || err.message.includes("ENOENT"))
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
 * Parse args, extracting custom_id, attributes JSON, and optional flags.
 * Returns { custom_id, attributes, overwrite?, app_key? }
 */
function parseSetArgs(args) {
  const custom_id = args[0];
  if (!custom_id) {
    throw new ValidationError("Missing custom_id (first positional argument).");
  }

  const r = validateCustomId(custom_id);
  if (!r.ok) {
    throw new ValidationError(`custom_id validation failed: ${r.error}`);
  }

  const attributesRaw = args[1];
  if (!attributesRaw) {
    throw new ValidationError(
      "Missing attributes argument. Pass a JSON object of attributes.",
      'Example: node bin/batch.mjs custom-data set "u_1" \'{"key":"value"}\'',
    );
  }

  let attributes;
  try {
    attributes = JSON.parse(attributesRaw);
  } catch {
    throw new ValidationError("attributes argument is not valid JSON.");
  }

  if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) {
    throw new ValidationError("attributes must be a JSON object.");
  }

  // Parse flags
  const overwrite = args.includes("--overwrite");
  const appKeyIdx = args.indexOf("--app-key");
  const app_key = appKeyIdx >= 0 ? args[appKeyIdx + 1] : undefined;

  return { custom_id, attributes, overwrite, app_key };
}

/**
 * Parse args for delete command, extracting custom_id and checking --confirm flag.
 * Returns { custom_id, app_key? }
 */
function parseDeleteArgs(args) {
  const custom_id = args[0];
  if (!custom_id) {
    throw new ValidationError("Missing custom_id (first positional argument).");
  }

  const r = validateCustomId(custom_id);
  if (!r.ok) {
    throw new ValidationError(`custom_id validation failed: ${r.error}`);
  }

  const hasConfirm = args.includes("--confirm");
  if (!hasConfirm) {
    throw new ConfirmError(
      "Destructive operation requires --confirm flag.",
      "Add --confirm to proceed with deletion.",
    );
  }

  const appKeyIdx = args.indexOf("--app-key");
  const app_key = appKeyIdx >= 0 ? args[appKeyIdx + 1] : undefined;

  return { custom_id, app_key };
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

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleSet(args) {
  const { custom_id, attributes, overwrite, app_key } = parseSetArgs(args);

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, app_key);

  const endpoint = `1.1/${appKeyValue}/data/users/${encodeURIComponent(custom_id)}`;
  const body = overwrite ? { attributes, overwrite: true } : { attributes };

  await mepFetch(creds, "POST", endpoint, body);

  return { status: "applied", custom_id };
}

async function handleDelete(args) {
  const { custom_id, app_key } = parseDeleteArgs(args);

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, app_key);

  const endpoint = `1.1/${appKeyValue}/data/users/${encodeURIComponent(custom_id)}`;

  await mepFetch(creds, "DELETE", endpoint, undefined);

  return { status: "deleted", custom_id };
}
