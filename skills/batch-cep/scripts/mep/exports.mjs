// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, mepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";

const ACTIONS = {
  create: handleCreate,
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
    return emitSuccess(`mep-export ${action}`, result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return emitError({
        error_code: "VALIDATION_ERROR",
        error_message: err.message,
        hint: err.hint ?? "Fix the input and retry.",
      });
    }
    if (err instanceof AppKeyUnresolvedError) {
      return emitError({
        error_code: "APP_KEY_UNRESOLVED",
        error_message: err.message,
        hint: err.hint,
      });
    }
    if (err instanceof ClientError) {
      const payload = err.toErrorPayload();
      const out = {
        ok: false,
        command: `mep-export ${action}`,
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

class AppKeyUnresolvedError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = "AppKeyUnresolvedError";
    this.hint = hint;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * create <type> [--filter JSON] [--app-key KEY]
 * POST /exports/create
 */
async function handleCreate(args) {
  const { type, filter, appKeyArg } = parseCreateArgs(args);
  const credentials = getCredentials();
  const appKey = resolveAppKey(credentials, appKeyArg);

  const endpoint = `1.1/${appKey}/exports/create`;
  const body = { type };
  if (filter !== undefined) {
    body.filter = filter;
  }

  const response = await mepFetch(credentials, "POST", endpoint, body);
  const exportId = response.data?.export_id || response.data?.id || "";

  return {
    status: "requested",
    export_id: exportId,
    next_step:
      "Call `mep-export view <export_id>` to poll status; download_url appears when ready.",
  };
}

/**
 * list [--limit N] [--cursor C] [--app-key KEY]
 * GET /exports/list?limit=...&cursor=...
 */
async function handleList(args) {
  const { limit, cursor, appKeyArg } = parseListArgs(args);
  const credentials = getCredentials();
  const appKey = resolveAppKey(credentials, appKeyArg);

  const qs = new URLSearchParams();
  if (limit !== undefined) qs.set("limit", String(limit));
  if (cursor !== undefined) qs.set("cursor", cursor);

  const queryString = qs.toString() ? `?${qs.toString()}` : "";
  const endpoint = `1.1/${appKey}/exports/list${queryString}`;

  const response = await mepFetch(credentials, "GET", endpoint);
  const exports = response.data?.exports ?? [];
  const nextCursor = response.data?.next_cursor;

  return {
    exports,
    ...(nextCursor && { next_cursor: nextCursor }),
  };
}

/**
 * view <export-id> [--app-key KEY]
 * GET /exports/{id}
 */
async function handleView(args) {
  const { exportId, appKeyArg } = parseViewArgs(args);
  const credentials = getCredentials();
  const appKey = resolveAppKey(credentials, appKeyArg);

  const endpoint = `1.1/${appKey}/exports/${encodeURIComponent(exportId)}`;
  const response = await mepFetch(credentials, "GET", endpoint);

  return response.data;
}

// ---------------------------------------------------------------------------
// Argument parsers
// ---------------------------------------------------------------------------

function parseCreateArgs(args) {
  const type = args[0];
  if (!type) {
    throw new ValidationError(
      "Missing type argument.",
      "Usage: create <type> [--filter JSON] [--app-key KEY]",
    );
  }

  let filter;
  let appKeyArg;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--filter" && i + 1 < args.length) {
      filter = parseJsonArg(args[i + 1], "filter");
      i++;
    } else if (args[i] === "--app-key" && i + 1 < args.length) {
      appKeyArg = args[i + 1];
      i++;
    }
  }

  return { type, filter, appKeyArg };
}

function parseListArgs(args) {
  let limit;
  let cursor;
  let appKeyArg;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && i + 1 < args.length) {
      const val = Number.parseInt(args[i + 1], 10);
      if (Number.isNaN(val) || val <= 0) {
        throw new ValidationError(
          `Invalid --limit value: ${args[i + 1]}. Must be a positive integer.`,
          "Example: --limit 50",
        );
      }
      limit = val;
      i++;
    } else if (args[i] === "--cursor" && i + 1 < args.length) {
      cursor = args[i + 1];
      i++;
    } else if (args[i] === "--app-key" && i + 1 < args.length) {
      appKeyArg = args[i + 1];
      i++;
    }
  }

  return { limit, cursor, appKeyArg };
}

function parseViewArgs(args) {
  const exportId = args[0];
  if (!exportId) {
    throw new ValidationError(
      "Missing export_id argument.",
      "Usage: view <export-id> [--app-key KEY]",
    );
  }

  let appKeyArg;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--app-key" && i + 1 < args.length) {
      appKeyArg = args[i + 1];
      i++;
    }
  }

  return { exportId, appKeyArg };
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

function parseJsonArg(raw, argName = "value") {
  if (!raw) {
    throw new ValidationError(
      `Missing ${argName} argument. Pass a JSON value.`,
      `Example: --${argName} '{"key":"value"}'`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError(`${argName} argument is not valid JSON.`, "Pass a valid JSON value.");
  }
}

/**
 * Resolve app key: either alias (ios_live, etc.) or raw key string.
 * Throws AppKeyUnresolvedError if alias unset in config.
 */
function resolveAppKey(credentials, keyRef) {
  let resolvedRef = keyRef;
  if (!resolvedRef) {
    // Use default app key
    if (!credentials.default_app_key) {
      throw new AppKeyUnresolvedError(
        "No default app key configured.",
        "Set default_app_key in batch-credentials.json or pass --app-key explicitly.",
      );
    }
    resolvedRef = credentials.default_app_key;
  }

  // Check if it's an alias
  const knownAliases = ["ios_live", "ios_dev", "android_live", "android_dev", "web"];
  if (knownAliases.includes(resolvedRef)) {
    const key = credentials.app_keys?.[resolvedRef];
    if (!key) {
      throw new AppKeyUnresolvedError(
        `App key alias '${resolvedRef}' not found in batch-credentials.json.`,
        `Set app_keys.${resolvedRef} in batch-credentials.json or pass a raw key via --app-key.`,
      );
    }
    return key;
  }

  // Otherwise treat as raw key
  return resolvedRef;
}
