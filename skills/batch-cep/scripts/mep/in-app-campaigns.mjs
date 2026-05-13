// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, mepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";

const SEGMENT_VALUES = new Set(["NEW", "ONE_TIME", "ENGAGED", "DORMANT", "IMPORTED"]);
const TRIGGER_PRIORITY_VALUES = new Set(["STANDARD", "IMPORTANT", "CRITICAL"]);
const TRIGGER_WHEN_STRING_VALUES = new Set(["NOW", "NEXT_SESSION"]);

const ACTIONS = {
  create: handleCreate,
  update: handleUpdate,
  delete: handleDelete,
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
    return emitSuccess(`in-app-campaigns ${action}`, result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return emitError({
        error_code: "VALIDATION_ERROR",
        error_message: err.message,
        hint: err.hint ?? "Fix the input and retry.",
      });
    }
    if (err instanceof ConfirmError) {
      return emitConfirmError(`in-app-campaigns ${action}`);
    }
    if (err instanceof AppKeyUnresolvedError) {
      return emitError({
        error_code: "APPKEY_UNRESOLVED",
        error_message: err.message,
        hint: err.hint ?? "Add the app key to batch-credentials.json under app_keys.",
      });
    }
    if (err instanceof ClientError) {
      const payload = err.toErrorPayload();
      const out = {
        ok: false,
        command: `in-app-campaigns ${action}`,
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
      hint: "Re-run with --confirm to proceed. This permanently deletes the in-app campaign.",
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

function extractAppKeyFlag(args) {
  const idx = args.indexOf("--app-key");
  return idx >= 0 ? args[idx + 1] : undefined;
}

function extractLimitFlag(args) {
  const idx = args.indexOf("--limit");
  if (idx < 0) return undefined;
  const val = Number.parseInt(args[idx + 1], 10);
  return Number.isFinite(val) ? val : undefined;
}

function extractCursorFlag(args) {
  const idx = args.indexOf("--cursor");
  return idx >= 0 ? args[idx + 1] : undefined;
}

function aliasToEnvVarName(alias) {
  return `BATCH_${alias.toUpperCase()}_KEY`;
}

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

function parseDataJson(raw, label = "data") {
  if (!raw) {
    throw new ValidationError(
      `Missing ${label} argument. Pass a JSON object.`,
      "Pass a JSON object as the argument.",
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
 * Validate in-app campaign create input.
 *
 * Required:
 *   - name: string, min 3 chars
 *   - trigger: object
 *   - landing: object with theme (string, min 1) and contents (array, min 1)
 *
 * Optional:
 *   - start_date / local_start_date: mutually exclusive
 *   - end_date / local_end_date: mutually exclusive
 *   - targeting: object (segments enum validated if present)
 *   - labels: array of strings, max 3
 */
function validateCreateInput(data) {
  // name
  if (!data.name || typeof data.name !== "string") {
    throw new ValidationError(
      "name is required and must be a non-empty string (min 3 chars).",
      "Provide a campaign name with at least 3 characters.",
    );
  }
  if (data.name.length < 3) {
    throw new ValidationError(
      `name must be at least 3 characters (got ${data.name.length}).`,
      "Provide a campaign name with at least 3 characters.",
    );
  }

  // trigger
  if (!data.trigger || typeof data.trigger !== "object" || Array.isArray(data.trigger)) {
    throw new ValidationError(
      "trigger is required and must be an object.",
      'Example: {"when": "NOW"} or {"when": {"event": "app_open"}}',
    );
  }

  // landing
  if (!data.landing || typeof data.landing !== "object" || Array.isArray(data.landing)) {
    throw new ValidationError(
      "landing is required and must be an object with theme and contents.",
      'Example: {"theme": "default", "contents": [{"lang": "en", "title": "Hello"}]}',
    );
  }

  // landing.theme
  if (!data.landing.theme || typeof data.landing.theme !== "string") {
    throw new ValidationError(
      "landing.theme is required and must be a non-empty string.",
      'Set landing.theme to a theme identifier, e.g. "default".',
    );
  }

  // landing.contents
  if (!data.landing.contents || !Array.isArray(data.landing.contents)) {
    throw new ValidationError(
      "landing.contents is required and must be an array.",
      "Provide at least one content object in landing.contents.",
    );
  }
  if (data.landing.contents.length < 1) {
    throw new ValidationError(
      "landing.contents array must contain at least one item.",
      "Add at least one content object to landing.contents.",
    );
  }

  // labels max 3
  if (data.labels !== undefined) {
    if (!Array.isArray(data.labels)) {
      throw new ValidationError(
        "labels must be an array of strings.",
        "Provide at most 3 label strings.",
      );
    }
    if (data.labels.length > 3) {
      throw new ValidationError(
        `labels array must contain at most 3 items (got ${data.labels.length}).`,
        "Remove extra labels — maximum 3 allowed.",
      );
    }
  }

  // targeting.segments enum check (if present)
  if (data.targeting?.segments !== undefined) {
    const segs = data.targeting.segments;
    const segArr = Array.isArray(segs) ? segs : [segs];
    for (const seg of segArr) {
      if (!SEGMENT_VALUES.has(seg)) {
        throw new ValidationError(
          `targeting.segments value "${seg}" is invalid. Must be one of: ${[...SEGMENT_VALUES].join(", ")}.`,
          "Use targeting.query for arbitrary segments.",
        );
      }
    }
  }

  // trigger.priority enum check (if present)
  if (data.trigger.priority !== undefined && !TRIGGER_PRIORITY_VALUES.has(data.trigger.priority)) {
    throw new ValidationError(
      `trigger.priority "${data.trigger.priority}" is invalid. Must be one of: ${[...TRIGGER_PRIORITY_VALUES].join(", ")}.`,
      "Set trigger.priority to STANDARD, IMPORTANT, or CRITICAL.",
    );
  }

  // trigger.when validation (if present)
  if (data.trigger.when !== undefined) {
    const when = data.trigger.when;
    if (typeof when === "string" && !TRIGGER_WHEN_STRING_VALUES.has(when)) {
      throw new ValidationError(
        `trigger.when string "${when}" is invalid. Must be "NOW" or "NEXT_SESSION", or an event object.`,
        'Set trigger.when to "NOW", "NEXT_SESSION", or {"event": "event_name"}.',
      );
    }
    if (
      typeof when === "object" &&
      !Array.isArray(when) &&
      (!when.event || typeof when.event !== "string")
    ) {
      throw new ValidationError(
        'trigger.when object must have an "event" string field.',
        'Example: {"event": "app_open"}',
      );
    }
  }

  // Refines: mutually exclusive date fields
  if (data.start_date !== undefined && data.local_start_date !== undefined) {
    throw new ValidationError(
      "`start_date` and `local_start_date` are mutually exclusive.",
      "Provide either start_date or local_start_date, not both.",
    );
  }
  if (data.end_date !== undefined && data.local_end_date !== undefined) {
    throw new ValidationError(
      "`end_date` and `local_end_date` are mutually exclusive.",
      "Provide either end_date or local_end_date, not both.",
    );
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * create <data-json> [--app-key ALIAS]
 * POST /1.1/<app_key>/in-app-campaigns/create
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

  const endpoint = `1.1/${appKeyValue}/in-app-campaigns/create`;
  const response = await mepFetch(creds, "POST", endpoint, body);

  const raw = response.data ?? {};
  return {
    campaign_token: typeof raw.campaign_token === "string" ? raw.campaign_token : "",
    raw,
  };
}

/**
 * update <campaign_token> [<patch-json>] [--app-key ALIAS]
 * POST /1.1/<app_key>/in-app-campaigns/update
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
  const endpoint = `1.1/${appKeyValue}/in-app-campaigns/update`;
  const response = await mepFetch(creds, "POST", endpoint, body);

  return response.data ?? {};
}

/**
 * delete <campaign_token> --confirm [--app-key ALIAS]
 * POST /1.1/<app_key>/in-app-campaigns/delete
 * DESTRUCTIVE — requires --confirm flag.
 */
async function handleDelete(args) {
  const [campaign_token, ...rest] = args;

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

  const endpoint = `1.1/${appKeyValue}/in-app-campaigns/delete`;
  await mepFetch(creds, "POST", endpoint, { campaign_token });

  return { status: "deleted", campaign_token };
}

/**
 * view <campaign_token> [--app-key ALIAS]
 * GET /1.1/<app_key>/in-app-campaigns/<campaign_token>
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

  const endpoint = `1.1/${appKeyValue}/in-app-campaigns/${encodeURIComponent(campaign_token)}`;
  const response = await mepFetch(creds, "GET", endpoint);

  return response.data ?? {};
}

/**
 * list [--limit N] [--cursor C] [--app-key ALIAS]
 * GET /1.1/<app_key>/in-app-campaigns/list?limit=N&cursor=C
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
  const endpoint = `1.1/${appKeyValue}/in-app-campaigns/list${qsStr ? `?${qsStr}` : ""}`;
  const response = await mepFetch(creds, "GET", endpoint);

  const raw = response.data ?? {};
  return {
    campaigns: Array.isArray(raw.campaigns) ? raw.campaigns : [],
    ...(raw.next_cursor !== undefined ? { next_cursor: raw.next_cursor } : {}),
  };
}
