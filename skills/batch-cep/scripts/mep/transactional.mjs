// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, mepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";

const GROUP_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

const ACTIONS = {
  send: handleSend,
  stats: handleStats,
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
    return emitSuccess(`transactional ${action}`, result);
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
        error_code: "APPKEY_UNRESOLVED",
        error_message: err.message,
        hint: err.hint ?? "Add the app key to batch-credentials.json under app_keys.",
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
        command: `transactional ${action}`,
        platform: "mep",
        error: payload,
      };
      console.log(JSON.stringify(out, null, 2));
      return out;
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
// Error classes
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
 * Convert an app key alias to its env var name convention.
 * e.g. "ios_live" → "BATCH_IOS_LIVE_KEY"
 *      "ios_live_nonexistent" → "BATCH_IOS_LIVE_NONEXISTENT_KEY"
 */
function aliasToEnvVarName(alias) {
  return `BATCH_${alias.toUpperCase()}_KEY`;
}

/**
 * Parse --app-key flag from args array.
 * Returns the value after --app-key, or undefined if not present.
 */
function extractAppKeyFlag(args) {
  const idx = args.indexOf("--app-key");
  return idx >= 0 ? args[idx + 1] : undefined;
}

/**
 * Resolve app key alias/raw to actual app key string.
 * Falls back to default_app_key when alias is undefined.
 * Throws AppKeyUnresolvedError with env var name if alias not found.
 */
function resolveAppKey(credentials, alias) {
  if (alias === undefined) {
    // Use default
    const defaultAlias = credentials.default_app_key;
    const key = credentials.app_keys?.[defaultAlias];
    if (!key) {
      throw new AppKeyUnresolvedError(
        `Default app key alias "${defaultAlias}" not found in batch-credentials.json. ` +
          `Set ${aliasToEnvVarName(defaultAlias)} or add "${defaultAlias}" under app_keys.`,
        "Add the app key to batch-credentials.json under app_keys.",
      );
    }
    return key;
  }

  // Try alias lookup first
  if (credentials.app_keys?.[alias]) {
    return credentials.app_keys[alias];
  }

  // If alias looks like a raw app key (not a known alias pattern), treat as raw
  const knownAliases = new Set(["ios_live", "ios_dev", "android_live", "android_dev", "web"]);
  if (!knownAliases.has(alias)) {
    // Raw key — return as-is only if it looks like an app key (non-empty, not alias-like)
    // Convention: if it's not in app_keys AND not a known alias pattern,
    // it's an unknown alias → raise APPKEY_UNRESOLVED
    throw new AppKeyUnresolvedError(
      `App key alias "${alias}" not found in batch-credentials.json. ` +
        `Set ${aliasToEnvVarName(alias)} or add "${alias}" under app_keys.`,
      "Add the app key to batch-credentials.json under app_keys.",
    );
  }

  throw new AppKeyUnresolvedError(
    `App key alias "${alias}" not found in batch-credentials.json. ` +
      `Set ${aliasToEnvVarName(alias)} or add "${alias}" under app_keys.`,
    "Add the app key to batch-credentials.json under app_keys.",
  );
}

/**
 * Validate group_id: regex /^[A-Za-z0-9_-]{1,128}$/.
 */
function validateGroupId(group_id) {
  if (!group_id || typeof group_id !== "string") {
    throw new ValidationError(
      "group_id is required (string, 1-128 chars, regex [A-Za-z0-9_-]).",
      "Provide a group_id that identifies this transactional notification group.",
    );
  }
  if (!GROUP_ID_RE.test(group_id)) {
    throw new ValidationError(
      `group_id "${group_id}" is invalid. Must match [A-Za-z0-9_-], 1-128 chars.`,
      "Remove spaces and special characters from group_id.",
    );
  }
}

/**
 * Validate send payload fields (strict subset; passthrough for undocumented fields).
 */
function validateSendPayload(data) {
  validateGroupId(data.group_id);

  // recipients required
  if (!data.recipients || typeof data.recipients !== "object" || Array.isArray(data.recipients)) {
    throw new ValidationError(
      "recipients is required and must be an object.",
      "Provide recipients with custom_ids, tokens, install_ids, or advertising_ids.",
    );
  }

  // message XOR messages
  const hasMessage = data.message !== undefined;
  const hasMessages = data.messages !== undefined;
  if (hasMessage === hasMessages) {
    throw new ValidationError(
      hasMessage
        ? "Exactly one of `message` or `messages` must be provided — both were given."
        : "Exactly one of `message` or `messages` must be provided — neither was given.",
      hasMessage
        ? "Remove either `message` or `messages`."
        : "Provide either `message` (single-language) or `messages` (multi-language object).",
    );
  }

  // push_type: background disallows message and media
  if (data.push_type === "background") {
    if (data.message !== undefined || data.media !== undefined) {
      throw new ValidationError(
        "`push_type: background` (silent push) disallows `message` and `media`.",
        "Remove `message` and `media` for background/silent pushes.",
      );
    }
  }

  // push_type enum
  if (data.push_type !== undefined && !["alert", "background"].includes(data.push_type)) {
    throw new ValidationError(
      `push_type must be "alert" or "background", got "${data.push_type}".`,
    );
  }

  // priority enum
  if (data.priority !== undefined && !["normal", "high"].includes(data.priority)) {
    throw new ValidationError(`priority must be "normal" or "high", got "${data.priority}".`);
  }

  // time_to_live: positive integer <= 2419200
  if (data.time_to_live !== undefined) {
    const ttl = data.time_to_live;
    if (!Number.isInteger(ttl) || ttl <= 0 || ttl > 2_419_200) {
      throw new ValidationError(
        `time_to_live must be a positive integer <= 2419200 (28 days), got ${ttl}.`,
      );
    }
  }

  // labels: array, max 3
  if (data.labels !== undefined) {
    if (!Array.isArray(data.labels)) {
      throw new ValidationError("labels must be an array.");
    }
    if (data.labels.length > 3) {
      throw new ValidationError(`labels has ${data.labels.length} entries; max 3 allowed.`);
    }
  }

  // deeplink XOR landing
  if (data.deeplink !== undefined && data.landing !== undefined) {
    throw new ValidationError(
      "`deeplink` and `landing` are mutually exclusive — provide one or neither.",
      "Remove either `deeplink` or `landing`.",
    );
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * send <data-json> [--app-key ALIAS_OR_RAW]
 * POST /1.1/<app_key>/transactional/send
 */
async function handleSend(args) {
  const dataRaw = args[0];
  if (!dataRaw) {
    throw new ValidationError(
      "Missing data argument. Pass a JSON object as the first argument.",
      'Example: node bin/batch.mjs transactional send \'{"group_id":"...","recipients":{...},"message":{...}}\'',
    );
  }

  let data;
  try {
    data = JSON.parse(dataRaw);
  } catch {
    throw new ValidationError("data argument is not valid JSON.", "Pass a valid JSON object.");
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ValidationError("data must be a JSON object.");
  }

  validateSendPayload(data);

  const appKeyFlag = extractAppKeyFlag(args);
  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyFlag);

  // Remove app_key from body (auth meta, not part of Batch payload)
  const { app_key: _removed, ...body } = data;

  const endpoint = `1.1/${appKeyValue}/transactional/send`;
  const response = await mepFetch(creds, "POST", endpoint, body);

  const raw = response.data ?? {};
  return {
    status: "sent",
    ...(raw.notification_id ? { notification_id: raw.notification_id } : {}),
    raw,
  };
}

/**
 * stats <group-id> [--app-key ALIAS_OR_RAW]
 * GET /1.1/<app_key>/transactional/stats/<group_id>
 */
async function handleStats(args) {
  const group_id = args[0];
  validateGroupId(group_id);

  const appKeyFlag = extractAppKeyFlag(args.slice(1));
  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyFlag);

  const endpoint = `1.1/${appKeyValue}/transactional/stats/${encodeURIComponent(group_id)}`;
  const response = await mepFetch(creds, "GET", endpoint);

  return response.data ?? {};
}
