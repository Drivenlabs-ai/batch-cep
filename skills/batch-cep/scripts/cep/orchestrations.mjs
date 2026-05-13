// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, cepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";

const ACTIONS = {
  list: handleList,
  view: handleView,
  stats: handleStats,
};

/**
 * Testable entry point — returns the output object, does NOT call process.exit.
 * Use this in tests.
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
    return emitSuccess(`orchestrations ${action}`, result);
  } catch (err) {
    if (err instanceof ClientError) {
      const out = {
        ok: false,
        command: `orchestrations ${action}`,
        platform: "cep",
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
    if (isValidationError(err)) {
      return emitError({
        error_code: "VALIDATION_ERROR",
        error_message: err.message,
        hint: "Check required arguments.",
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
    return emitError({
      error_code: "UNEXPECTED",
      error_message: err.message,
      hint: "Unexpected error.",
    });
  }
}

/**
 * CLI entry point — calls runAction, then process.exit on error.
 * Use this from bin/batch.mjs.
 */
export async function dispatch(action, args) {
  const out = await runAction(action, args);
  if (!out.ok) process.exit(1);
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

function isValidationError(err) {
  return err instanceof Error && err.message.includes("required");
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
 * Simple argument parser for named flags.
 * Extracts --flag value pairs and positional args.
 * Returns { positional: [...], flag1: value, flag2: value }
 */
function parseArgs(args, schema = {}) {
  const result = { positional: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const flag = arg.slice(2);
      if (schema[flag]) {
        i++;
        const val = args[i];
        if (schema[flag].type === "number") {
          result[flag] = Number.parseInt(val, 10);
        } else {
          result[flag] = val;
        }
      }
    } else {
      result.positional.push(arg);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleList(args) {
  const creds = getCredentials();
  const parsed = parseArgs(args, {
    limit: { type: "number" },
    cursor: { type: "string" },
    kind: { type: "string" },
  });

  const body = {};

  if (parsed.limit !== undefined) {
    body.limit = parsed.limit;
  }

  if (parsed.cursor !== undefined) {
    body.cursor = parsed.cursor;
  }

  if (parsed.kind !== undefined) {
    body.filter = { kind: parsed.kind };
  }

  const response = await cepFetch(creds, "POST", "2.11/orchestrations/list", body);
  return {
    orchestrations: response.data?.orchestrations ?? [],
    ...(response.data?.next_cursor ? { next_cursor: response.data.next_cursor } : {}),
  };
}

async function handleView(args) {
  const creds = getCredentials();
  if (!args || args.length === 0) {
    throw new Error("orchestration_token is required");
  }

  const orchestrationToken = args[0];
  const response = await cepFetch(creds, "POST", "2.11/orchestrations/view", {
    orchestration_token: orchestrationToken,
  });
  return { orchestration: response.data };
}

async function handleStats(args) {
  const creds = getCredentials();
  if (!args || args.length === 0) {
    throw new Error("orchestration_token is required");
  }

  const orchestrationToken = args[0];
  const response = await cepFetch(creds, "POST", "2.11/orchestrations/stats", {
    orchestration_token: orchestrationToken,
  });
  return { stats: response.data };
}
