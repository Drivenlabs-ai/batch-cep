// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, mepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";

const CAMPAIGN_STATES = new Set(["DRAFT", "RUNNING", "STOPPED"]);
const CHANNEL_TYPES = new Set(["email", "push"]);

// RFC 3339 — basic check: contains T and a timezone offset or Z
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const ACTIONS = {
  create: handleCreate,
  update: handleUpdate,
  delete: handleDelete,
  stats: handleStats,
  view: handleView,
  list: handleList,
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
    return emitSuccess(`campaigns ${action}`, result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return emitError({
        error_code: "VALIDATION_ERROR",
        error_message: err.message,
        hint: err.hint ?? "Fix the input and retry.",
      });
    }
    if (err instanceof ConfirmError) {
      return emitConfirmError(`campaigns ${action}`);
    }
    if (err instanceof AppKeyUnresolvedError) {
      return emitError({
        error_code: "APPKEY_UNRESOLVED",
        error_message: err.message,
        hint: err.hint ?? "Add the app key to batch-credentials.json under app_keys.",
      });
    }
    // Check ClientError before config checks — ClientError messages may contain
    // substrings like "not found" which would otherwise match isConfigMissing.
    if (err instanceof ClientError) {
      const payload = err.toErrorPayload();
      const out = {
        ok: false,
        command: `campaigns ${action}`,
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
  constructor() {
    super("Destructive operation requires --confirm flag.");
    this.name = "ConfirmError";
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
      hint: "Re-run with --confirm to proceed. This permanently deletes the campaign.",
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
 * Parse --app-key flag from args array.
 */
function extractAppKeyFlag(args) {
  const idx = args.indexOf("--app-key");
  return idx >= 0 ? args[idx + 1] : undefined;
}

/**
 * Parse --limit flag from args array.
 */
function extractLimitFlag(args) {
  const idx = args.indexOf("--limit");
  if (idx < 0) return undefined;
  const val = Number.parseInt(args[idx + 1], 10);
  return Number.isFinite(val) ? val : undefined;
}

/**
 * Parse --cursor flag from args array.
 */
function extractCursorFlag(args) {
  const idx = args.indexOf("--cursor");
  return idx >= 0 ? args[idx + 1] : undefined;
}

/**
 * Convert an app key alias to its env var name convention.
 */
function aliasToEnvVarName(alias) {
  return `BATCH_${alias.toUpperCase()}_KEY`;
}

/**
 * Resolve app key alias to actual app key string.
 * Falls back to default_app_key when alias is undefined.
 */
function resolveAppKey(credentials, alias) {
  if (alias === undefined) {
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

  if (credentials.app_keys?.[alias]) {
    return credentials.app_keys[alias];
  }

  throw new AppKeyUnresolvedError(
    `App key alias "${alias}" not found in batch-credentials.json. ` +
      `Set ${aliasToEnvVarName(alias)} or add "${alias}" under app_keys.`,
    "Add the app key to batch-credentials.json under app_keys.",
  );
}

/**
 * Parse and validate data-json argument.
 */
function parseDataJson(raw, label = "data") {
  if (!raw) {
    throw new ValidationError(
      `Missing ${label} argument. Pass a JSON object.`,
      `Example: '{"name":"My Campaign","state":"DRAFT","when":{"start_time":"now"},"messages":[{"channel_type":"push","body":"Hello"}]}'`,
    );
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ValidationError(
      `${label} argument is not valid JSON.`,
      "Pass a JSON object as the argument.",
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ValidationError(`${label} must be a JSON object.`);
  }
  return data;
}

/**
 * Validate campaign create input.
 * - name: required, 1-255 chars
 * - state: required, enum DRAFT|RUNNING|STOPPED
 * - when: required object with start_time (RFC 3339 or "now") and optional end_time
 * - messages: required array, min 1, each with channel_type in {email, push}
 */
function validateCreateInput(data) {
  // name
  if (!data.name || typeof data.name !== "string") {
    throw new ValidationError(
      "name is required and must be a non-empty string (1-255 chars).",
      "Provide a campaign name.",
    );
  }
  if (data.name.length < 1 || data.name.length > 255) {
    throw new ValidationError(
      `name must be between 1 and 255 characters (got ${data.name.length}).`,
      "Shorten the campaign name.",
    );
  }

  // state
  if (!data.state || typeof data.state !== "string") {
    throw new ValidationError(
      "state is required. Must be one of: DRAFT, RUNNING, STOPPED.",
      "Set state to DRAFT, RUNNING, or STOPPED.",
    );
  }
  if (!CAMPAIGN_STATES.has(data.state)) {
    throw new ValidationError(
      `state "${data.state}" is invalid. Must be one of: DRAFT, RUNNING, STOPPED.`,
      "Set state to DRAFT, RUNNING, or STOPPED.",
    );
  }

  // when
  if (!data.when || typeof data.when !== "object" || Array.isArray(data.when)) {
    throw new ValidationError(
      "when is required and must be an object with start_time.",
      'Example: {"start_time": "now"} or {"start_time": "2026-06-01T10:00:00Z"}',
    );
  }

  // when.start_time
  const { start_time } = data.when;
  if (!start_time || typeof start_time !== "string") {
    throw new ValidationError(
      'when.start_time is required. Must be RFC 3339 datetime or "now".',
      'Example: "now" or "2026-06-01T10:00:00Z"',
    );
  }
  if (start_time !== "now" && !RFC3339_RE.test(start_time)) {
    throw new ValidationError(
      `when.start_time "${start_time}" is invalid. Must be RFC 3339 datetime or "now".`,
      'Example: "now" or "2026-06-01T10:00:00Z"',
    );
  }

  // messages
  if (!data.messages || !Array.isArray(data.messages)) {
    throw new ValidationError(
      "messages is required and must be an array.",
      "Provide at least one message object with channel_type.",
    );
  }
  if (data.messages.length < 1) {
    throw new ValidationError(
      "messages array must contain at least one message.",
      "Add a message object with channel_type set to 'email' or 'push'.",
    );
  }
  for (let i = 0; i < data.messages.length; i++) {
    const msg = data.messages[i];
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
      throw new ValidationError(
        `messages[${i}] must be an object.`,
        "Each message must be an object with at least channel_type.",
      );
    }
    if (!msg.channel_type || typeof msg.channel_type !== "string") {
      throw new ValidationError(
        `messages[${i}].channel_type is required. Must be "email" or "push".`,
        'Set channel_type to "email" or "push".',
      );
    }
    if (!CHANNEL_TYPES.has(msg.channel_type)) {
      throw new ValidationError(
        `messages[${i}].channel_type "${msg.channel_type}" is invalid. Must be "email" or "push".`,
        'Set channel_type to "email" or "push".',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * create <data-json> [--app-key ALIAS]
 * POST /1.1/<app_key>/campaigns/create
 */
async function handleCreate(args) {
  const [rawData, ...rest] = args;
  const data = parseDataJson(rawData, "data");

  validateCreateInput(data);

  const appKeyFlag = extractAppKeyFlag(rest);
  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyFlag);

  // Strip app_key from body — it's auth meta, not part of Batch payload
  const { app_key: _removed, ...body } = data;

  const endpoint = `1.1/${appKeyValue}/campaigns/create`;
  const response = await mepFetch(creds, "POST", endpoint, body);

  const raw = response.data ?? {};
  return {
    campaign_token: typeof raw.campaign_token === "string" ? raw.campaign_token : "",
    raw,
  };
}

/**
 * update <campaign_token> [<patch-json>] [--app-key ALIAS]
 * POST /1.1/<app_key>/campaigns/update
 */
async function handleUpdate(args) {
  const [campaign_token, ...rest] = args;

  if (
    !campaign_token ||
    typeof campaign_token !== "string" ||
    campaign_token.trim() === "" ||
    campaign_token.trim().startsWith("{")
  ) {
    throw new ValidationError(
      "campaign_token is required as the first argument (not a JSON object).",
      "Provide the campaign token as the first argument, then the patch JSON as the second.",
    );
  }

  // Second positional arg is patch JSON (if present and doesn't start with --)
  let patch = {};
  let remaining = rest;
  if (rest[0] && !rest[0].startsWith("--")) {
    patch = parseDataJson(rest[0], "patch");
    remaining = rest.slice(1);
  }

  const appKeyFlag = extractAppKeyFlag(remaining);
  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyFlag);

  const body = { campaign_token, ...patch };
  const endpoint = `1.1/${appKeyValue}/campaigns/update`;
  const response = await mepFetch(creds, "POST", endpoint, body);

  return response.data ?? {};
}

/**
 * delete <campaign_token> --confirm [--app-key ALIAS]
 * POST /1.1/<app_key>/campaigns/delete
 * DESTRUCTIVE — requires --confirm flag.
 */
async function handleDelete(args) {
  const [campaign_token, ...rest] = args;

  // Confirm gate: --confirm must be present
  if (!rest.includes("--confirm")) {
    throw new ConfirmError();
  }

  if (!campaign_token || typeof campaign_token !== "string" || campaign_token.trim() === "") {
    throw new ValidationError(
      "campaign_token is required.",
      "Provide the campaign token as the first argument.",
    );
  }

  const appKeyFlag = extractAppKeyFlag(rest);
  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyFlag);

  const endpoint = `1.1/${appKeyValue}/campaigns/delete`;
  await mepFetch(creds, "POST", endpoint, { campaign_token });

  return { status: "deleted", campaign_token };
}

/**
 * stats <campaign_token> [--app-key ALIAS]
 * GET /1.1/<app_key>/campaigns/stats/<campaign_token>
 */
async function handleStats(args) {
  const [campaign_token, ...rest] = args;

  if (!campaign_token || typeof campaign_token !== "string" || campaign_token.trim() === "") {
    throw new ValidationError(
      "campaign_token is required.",
      "Provide the campaign token as the first argument.",
    );
  }

  const appKeyFlag = extractAppKeyFlag(rest);
  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyFlag);

  const endpoint = `1.1/${appKeyValue}/campaigns/stats/${encodeURIComponent(campaign_token)}`;
  const response = await mepFetch(creds, "GET", endpoint);

  return response.data ?? {};
}

/**
 * view <campaign_token> [--app-key ALIAS]
 * GET /1.1/<app_key>/campaigns/<campaign_token>
 */
async function handleView(args) {
  const [campaign_token, ...rest] = args;

  if (!campaign_token || typeof campaign_token !== "string" || campaign_token.trim() === "") {
    throw new ValidationError(
      "campaign_token is required.",
      "Provide the campaign token as the first argument.",
    );
  }

  const appKeyFlag = extractAppKeyFlag(rest);
  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyFlag);

  const endpoint = `1.1/${appKeyValue}/campaigns/${encodeURIComponent(campaign_token)}`;
  const response = await mepFetch(creds, "GET", endpoint);

  return response.data ?? {};
}

/**
 * list [--limit N] [--cursor C] [--app-key ALIAS]
 * GET /1.1/<app_key>/campaigns/list?limit=N&cursor=C
 */
async function handleList(args) {
  const appKeyFlag = extractAppKeyFlag(args);
  const limit = extractLimitFlag(args);
  const cursor = extractCursorFlag(args);

  const creds = getCredentials();
  const appKeyValue = resolveAppKey(creds, appKeyFlag);

  const qs = new URLSearchParams();
  if (limit !== undefined) qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", cursor);

  const qsStr = qs.toString();
  const endpoint = `1.1/${appKeyValue}/campaigns/list${qsStr ? `?${qsStr}` : ""}`;
  const response = await mepFetch(creds, "GET", endpoint);

  const raw = response.data ?? {};
  return {
    campaigns: Array.isArray(raw.campaigns) ? raw.campaigns : [],
    ...(raw.next_cursor !== undefined ? { next_cursor: raw.next_cursor } : {}),
  };
}
