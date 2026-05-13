// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, mepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";

const ACTIONS = {
  "access-request": handleAccessRequest,
  "erasure-request": handleErasureRequest,
  "requests-list": handleRequestsList,
  "requests-view": handleRequestsView,
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
    return emitSuccess(`gdpr ${action}`, result);
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
        hint: err.hint ?? "Re-run with --confirm to proceed.",
      });
    }
    if (err instanceof ClientError) {
      const out = {
        ok: false,
        command: `gdpr ${action}`,
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
      error_message: err instanceof Error ? err.message : String(err),
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
  constructor(message, hint) {
    super(message ?? "Destructive operation requires --confirm flag.");
    this.name = "ConfirmError";
    this.hint = hint ?? "Re-run with --confirm to proceed. This is irreversible.";
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
 * Resolve app key alias to actual key value from credentials.
 * Falls back to default_app_key if alias not specified.
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
 * Parse --app-key flag from args array.
 */
function parseAppKeyFlag(args) {
  const idx = args.indexOf("--app-key");
  return idx >= 0 ? args[idx + 1] : undefined;
}

const VALID_IDENTIFIER_TYPES = new Set(["custom_id", "install_id", "email"]);

/**
 * Parse and validate identifier type and value from positional args.
 * Returns an object {[identifierType]: identifierValue} for inclusion in the body.
 */
function parseIdentifierArgs(identifierType, identifierValue) {
  if (!identifierType) {
    throw new ValidationError(
      "Missing identifier-type (first positional argument).",
      "Pass one of: custom_id, install_id, email",
    );
  }

  if (!VALID_IDENTIFIER_TYPES.has(identifierType)) {
    throw new ValidationError(
      `Invalid identifier-type: "${identifierType}". Must be one of: ${Array.from(VALID_IDENTIFIER_TYPES).join(", ")}.`,
      "Pass one of: custom_id, install_id, email",
    );
  }

  if (!identifierValue || typeof identifierValue !== "string" || identifierValue.length === 0) {
    throw new ValidationError(
      "Missing or empty identifier-value (second positional argument).",
      `Pass the user's ${identifierType} as the second argument.`,
    );
  }

  // Per-type validation
  if (identifierType === "custom_id" && identifierValue.length > 512) {
    throw new ValidationError("custom_id must be at most 512 characters.");
  }
  if (identifierType === "email" && !identifierValue.includes("@")) {
    throw new ValidationError(`email must be a valid email address. Got: "${identifierValue}".`);
  }

  return { [identifierType]: identifierValue };
}

/**
 * Validate notification_email.
 */
function parseNotificationEmail(raw) {
  if (!raw || typeof raw !== "string") {
    throw new ValidationError(
      "Missing notification_email (second positional argument).",
      "Pass the email address where Batch will send the export / completion notice.",
    );
  }
  if (!raw.includes("@")) {
    throw new ValidationError(`notification_email must be a valid email address. Got: "${raw}".`);
  }
  return raw;
}

/**
 * Extract request_id from Batch response — handles both `request_id` and `id` fields.
 */
function pickRequestId(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.request_id === "string") return data.request_id;
  if (typeof data.id === "string") return data.id;
  return "";
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * access-request <identifier-type> <identifier-value> <notification-email> [--app-key ...]
 * POST /gdpr/requests — type: "access" (non-destructive)
 */
async function handleAccessRequest(args) {
  const [identifierType, identifierValue, notifEmail, ...rest] = args;

  const identifier = parseIdentifierArgs(identifierType, identifierValue);
  const notification_email = parseNotificationEmail(notifEmail);
  const appKeyAlias = parseAppKeyFlag(rest);

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyAlias);

  const body = { type: "access", ...identifier, notification_email };
  const response = await mepFetch(creds, "POST", `1.1/${appKeyValue}/gdpr/requests`, body);

  return {
    status: "requested",
    request_id: pickRequestId(response.data),
    next_step:
      "Call `gdpr requests-view <request_id>` to track progress. " +
      "Notification email sent when export ready.",
  };
}

/**
 * erasure-request <identifier-type> <identifier-value> --confirm [--app-key ...]
 * POST /gdpr/requests — type: "erasure" (DESTRUCTIVE)
 */
async function handleErasureRequest(args) {
  const [identifierType, identifierValue, ...rest] = args;

  // Confirm gate first — before any other validation
  if (!rest.includes("--confirm")) {
    throw new ConfirmError(
      "Destructive operation requires --confirm flag.",
      "Re-run with --confirm to proceed. Erasure is permanent and irreversible.",
    );
  }

  const identifier = parseIdentifierArgs(identifierType, identifierValue);
  const appKeyAlias = parseAppKeyFlag(rest);

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyAlias);

  const body = { type: "erasure", ...identifier };
  const response = await mepFetch(creds, "POST", `1.1/${appKeyValue}/gdpr/requests`, body);

  return {
    status: "requested",
    request_id: pickRequestId(response.data),
    next_step:
      "Call `gdpr requests-view <request_id>` to monitor progress. " +
      "Erasure is permanent on Batch's side once completed.",
  };
}

/**
 * requests-list [--limit N] [--cursor C] [--app-key ...]
 * GET /gdpr/requests
 */
async function handleRequestsList(args) {
  let limit;
  let cursor;
  let appKeyAlias;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      const n = Number.parseInt(args[i + 1], 10);
      if (!Number.isNaN(n)) limit = n;
      i++;
    } else if (args[i] === "--cursor" && args[i + 1]) {
      cursor = args[i + 1];
      i++;
    } else if (args[i] === "--app-key" && args[i + 1]) {
      appKeyAlias = args[i + 1];
      i++;
    }
  }

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyAlias);

  const qs = new URLSearchParams();
  if (limit !== undefined) qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", cursor);
  const path = `1.1/${appKeyValue}/gdpr/requests${qs.toString() ? `?${qs.toString()}` : ""}`;

  const response = await mepFetch(creds, "GET", path);

  const result = {
    requests: response.data?.requests ?? [],
  };
  if (response.data?.next_cursor) {
    result.next_cursor = response.data.next_cursor;
  }

  return result;
}

/**
 * requests-view <request-id> [--app-key ...]
 * GET /gdpr/requests/{id}
 */
async function handleRequestsView(args) {
  const [requestId, ...rest] = args;

  if (!requestId) {
    throw new ValidationError(
      "Missing request_id (first positional argument).",
      "Pass the request_id returned by access-request or erasure-request.",
    );
  }

  const appKeyAlias = parseAppKeyFlag(rest);

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyAlias);

  const response = await mepFetch(
    creds,
    "GET",
    `1.1/${appKeyValue}/gdpr/requests/${encodeURIComponent(requestId)}`,
  );

  // Return raw response data (passthrough)
  return response.data ?? {};
}
