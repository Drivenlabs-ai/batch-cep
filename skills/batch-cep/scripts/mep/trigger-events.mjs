// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, mepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";
import { validateBatchEvent, validateCustomId } from "../../lib/validate.mjs";

const ACTIONS = {
  send: handleSend,
  "send-bulk": handleSendBulk,
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
    return emitSuccess(`trigger-events ${action}`, result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return emitError({
        error_code: "VALIDATION_ERROR",
        error_message: err.message,
        hint: err.hint ?? "Fix the input and retry.",
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
      const payload = err.toErrorPayload();
      const out = {
        ok: false,
        command: `trigger-events ${action}`,
        platform: "mep",
        error: payload,
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
 * Parse args for send: custom_id, events JSON, optional --app-key flag.
 */
function parseSendArgs(args) {
  const custom_id = args[0];
  if (!custom_id) {
    throw new ValidationError("Missing custom_id (first positional argument).");
  }

  const r = validateCustomId(custom_id);
  if (!r.ok) {
    throw new ValidationError(`custom_id validation failed: ${r.error}`);
  }

  const eventsRaw = args[1];
  if (!eventsRaw) {
    throw new ValidationError(
      "Missing events argument. Pass a JSON array of events.",
      'Example: node bin/batch.mjs trigger-events send "u_1" \'[{"name":"purchase"}]\'',
    );
  }

  let events;
  try {
    events = JSON.parse(eventsRaw);
  } catch {
    throw new ValidationError("events argument is not valid JSON.");
  }

  if (!Array.isArray(events)) {
    throw new ValidationError("events must be a JSON array.");
  }

  if (events.length === 0) {
    throw new ValidationError("events must contain at least one event.");
  }

  if (events.length > 1000) {
    throw new ValidationError(`Too many events: ${events.length}. Max 1000 per call.`);
  }

  for (let i = 0; i < events.length; i++) {
    const result = validateBatchEvent(events[i]);
    if (!result.ok) {
      throw new ValidationError(
        `events[${i}]: ${result.error}`,
        "Event name must match [a-z0-9_], max 30 chars.",
      );
    }
  }

  const appKeyIdx = args.indexOf("--app-key");
  const app_key = appKeyIdx >= 0 ? args[appKeyIdx + 1] : undefined;

  return { custom_id, events, app_key };
}

/**
 * Parse args for send-bulk: users JSON array, optional --app-key flag.
 */
function parseSendBulkArgs(args) {
  const usersRaw = args[0];
  if (!usersRaw) {
    throw new ValidationError(
      "Missing users argument. Pass a JSON array of {id, events} objects.",
      'Example: node bin/batch.mjs trigger-events send-bulk \'[{"id":"u_1","events":[{"name":"purchase"}]}]\'',
    );
  }

  let users;
  try {
    users = JSON.parse(usersRaw);
  } catch {
    throw new ValidationError("users argument is not valid JSON.");
  }

  if (!Array.isArray(users)) {
    throw new ValidationError("users must be a JSON array.");
  }

  if (users.length === 0) {
    throw new ValidationError("users must contain at least one entry.");
  }

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (typeof user !== "object" || user === null) {
      throw new ValidationError(`users[${i}] must be an object.`);
    }
    if (!user.id || typeof user.id !== "string") {
      throw new ValidationError(`users[${i}].id is required (string, max 512 chars).`);
    }
    if (user.id.length > 512) {
      throw new ValidationError(`users[${i}].id max 512 chars.`);
    }
    if (!Array.isArray(user.events)) {
      throw new ValidationError(`users[${i}].events must be an array.`);
    }
    if (user.events.length === 0) {
      throw new ValidationError(`users[${i}].events must contain at least one event.`);
    }
    for (let j = 0; j < user.events.length; j++) {
      const result = validateBatchEvent(user.events[j]);
      if (!result.ok) {
        throw new ValidationError(
          `users[${i}].events[${j}]: ${result.error}`,
          "Event name must match [a-z0-9_], max 30 chars.",
        );
      }
    }
  }

  const appKeyIdx = args.indexOf("--app-key");
  const app_key = appKeyIdx >= 0 ? args[appKeyIdx + 1] : undefined;

  return { users, app_key };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleSend(args) {
  const { custom_id, events, app_key } = parseSendArgs(args);

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, app_key);

  // Critical: uses /1.0/ path (first and only script to do so)
  const endpoint = `1.0/${appKeyValue}/events/users/${encodeURIComponent(custom_id)}`;
  const response = await mepFetch(creds, "POST", endpoint, { events });

  return { status: "accepted", count: events.length, raw: response.data ?? {} };
}

async function handleSendBulk(args) {
  const { users, app_key } = parseSendBulkArgs(args);

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, app_key);

  // Critical: uses /1.0/ path; body is a JSON array, NOT wrapped in {users:[...]}
  const endpoint = `1.0/${appKeyValue}/events/users`;
  const response = await mepFetch(creds, "POST", endpoint, users);

  return { status: "accepted", users_count: users.length, raw: response.data ?? {} };
}
