// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, cepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";

const VALID_CHANNELS = new Set(["push", "email", "sms", "in_app"]);

const ACTIONS = {
  create: handleCreate,
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
    // Check ClientError before config checks — ClientError messages may contain
    // substrings like "not found" which would otherwise match isConfigMissing.
    if (err instanceof ClientError) {
      const payload = err.toErrorPayload();
      const out = {
        ok: false,
        command: `campaigns ${action}`,
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
 * Parse and validate the data-json argument.
 */
function parseDataJson(raw, label = "data") {
  if (!raw) {
    throw new ValidationError(
      `Missing ${label} argument. Pass a JSON object.`,
      `Example: '{"name":"My Campaign","targeting":{},"channels":{"push":{}}}'`,
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
 * - targeting: required, object
 * - channels: required, object with at least one of push/email/sms/in_app
 */
function validateCreateInput(data) {
  const { name, targeting, channels } = data;

  // Validate name
  if (!name || typeof name !== "string") {
    throw new ValidationError(
      "name is required and must be a string.",
      "Provide a campaign name between 1 and 255 characters.",
    );
  }
  if (name.length === 0 || name.length > 255) {
    throw new ValidationError(
      `name must be between 1 and 255 characters (got ${name.length}).`,
      "Shorten the campaign name.",
    );
  }

  // Validate targeting
  if (targeting === undefined || targeting === null) {
    throw new ValidationError(
      "targeting is required.",
      "Provide a targeting object (can be empty {} for all users).",
    );
  }
  if (typeof targeting !== "object" || Array.isArray(targeting)) {
    throw new ValidationError("targeting must be an object.");
  }

  // Validate channels
  if (channels === undefined || channels === null) {
    throw new ValidationError(
      "channels is required.",
      "Provide a channels object with at least one of: push, email, sms, in_app.",
    );
  }
  if (typeof channels !== "object" || Array.isArray(channels)) {
    throw new ValidationError("channels must be an object.");
  }

  // At least one channel (push, email, sms, in_app) must be non-null/non-undefined
  const hasChannel = VALID_CHANNELS.keys().some(
    (ch) => channels[ch] !== undefined && channels[ch] !== null,
  );
  // Fallback for environments without iterator helpers
  const hasChannelFallback = Array.from(VALID_CHANNELS).some(
    (ch) => channels[ch] !== undefined && channels[ch] !== null,
  );

  if (!hasChannelFallback) {
    throw new ValidationError(
      "At least one channel (push, email, sms, in_app) must be specified.",
      "Add at least one channel object (e.g. channels.push or channels.email).",
    );
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * create <data-json>
 * POST /campaigns/create — all fields pass-through
 */
async function handleCreate(args) {
  const [rawData] = args;
  const data = parseDataJson(rawData, "data");

  validateCreateInput(data);

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/campaigns/create", data);

  return response.data;
}

/**
 * update <campaign_token> <patch-json>
 * POST /campaigns/update
 */
async function handleUpdate(args) {
  const [campaign_token, rawPatch] = args;

  if (!campaign_token || typeof campaign_token !== "string" || campaign_token.trim() === "") {
    throw new ValidationError(
      "campaign_token is required.",
      "Provide the campaign token as the first argument.",
    );
  }

  let patch = {};
  if (rawPatch) {
    patch = parseDataJson(rawPatch, "patch");
  }

  const creds = getCredentials();
  const body = { campaign_token, ...patch };
  const response = await cepFetch(creds, "POST", "2.11/campaigns/update", body);

  return response.data;
}

/**
 * delete <campaign_token> [--confirm]
 * POST /campaigns/delete — DESTRUCTIVE, requires --confirm
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

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/campaigns/delete", { campaign_token });

  return response.data;
}
