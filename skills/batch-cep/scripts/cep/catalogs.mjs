// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, cepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";

// Catalog name regex: [a-z0-9_-], 1-64 chars (lowercase only, unlike audience names)
const CATALOG_NAME_RE = /^[a-z0-9_-]{1,64}$/;

const ACTIONS = {
  create: handleCreate,
  update: handleUpdate,
  remove: handleRemove,
  view: handleView,
  list: handleList,
  "edit-items": handleEditItems,
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
    return emitSuccess(`catalogs ${action}`, result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return emitError({
        error_code: "VALIDATION_ERROR",
        error_message: err.message,
        hint: err.hint ?? "Fix the input and retry.",
      });
    }
    if (err instanceof ConfirmError) {
      return emitConfirmError(`catalogs ${action}`);
    }
    // Check ClientError before config checks — ClientError messages may contain
    // substrings like "not found" which would otherwise match isConfigMissing.
    if (err instanceof ClientError) {
      const payload = err.toErrorPayload();
      const out = {
        ok: false,
        command: `catalogs ${action}`,
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
      hint: "Re-run with --confirm to proceed. This permanently deletes the catalog and all its items.",
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
 * Validate catalog name against /^[a-z0-9_-]{1,64}$/ (lowercase only).
 */
function validateName(name) {
  if (!name || !CATALOG_NAME_RE.test(name)) {
    throw new ValidationError(
      `Invalid catalog name: "${name}". Must match [a-z0-9_-], 1-64 chars (lowercase).`,
      "Catalog names are lowercase only and immutable after creation.",
    );
  }
}

/**
 * Parse a JSON string argument and validate it is a plain object.
 */
function parseSchemaArg(raw, argName = "schema") {
  if (!raw) {
    throw new ValidationError(
      `Missing ${argName} argument. Pass a JSON object.`,
      `Example: '{"price":"number","title":"string"}'`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError(`${argName} argument is not valid JSON.`, "Pass a JSON object.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError(
      `${argName} must be a JSON object (not an array or primitive).`,
      'Pass a JSON object like {"price":"number"}.',
    );
  }
  return parsed;
}

/**
 * Parse and validate the operations JSON array for edit-items.
 * Each op must be {op:"upsert", item:{...}} or {op:"delete", id:"..."}.
 */
function parseOperations(raw) {
  if (!raw) {
    throw new ValidationError(
      "Missing operations argument. Pass a JSON array of operations.",
      'Example: \'[{"op":"upsert","item":{"id":"p1","price":9.99}}]\'',
    );
  }
  let ops;
  try {
    ops = JSON.parse(raw);
  } catch {
    throw new ValidationError(
      "operations argument is not valid JSON.",
      "Pass a JSON array of operation objects.",
    );
  }
  if (!Array.isArray(ops)) {
    throw new ValidationError(
      "operations must be a JSON array.",
      'Pass an array like [{"op":"upsert","item":{}}].',
    );
  }
  if (ops.length === 0) {
    throw new ValidationError(
      "operations must contain at least one element.",
      "Pass a non-empty array of operations.",
    );
  }
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!op || typeof op !== "object") {
      throw new ValidationError(`operations[${i}] must be an object.`);
    }
    if (op.op === "upsert") {
      if (!op.item || typeof op.item !== "object" || Array.isArray(op.item)) {
        throw new ValidationError(
          `operations[${i}]: upsert requires an "item" object.`,
          'Example: {"op":"upsert","item":{"id":"p1","price":9.99}}',
        );
      }
    } else if (op.op === "delete") {
      if (!op.id || typeof op.id !== "string") {
        throw new ValidationError(
          `operations[${i}]: delete requires a non-empty "id" string.`,
          'Example: {"op":"delete","id":"p1"}',
        );
      }
    } else {
      throw new ValidationError(
        `operations[${i}]: unknown op "${op.op}". Must be "upsert" or "delete".`,
      );
    }
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * create <name> <schema-json> [display-name]
 * POST /catalogs/create
 */
async function handleCreate(args) {
  const [name, schemaRaw, displayName] = args;

  validateName(name);
  const schema = parseSchemaArg(schemaRaw, "schema");

  const body = { name, schema };
  if (displayName) body.display_name = displayName;

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/catalogs/create", body);

  return { catalog: response.data };
}

/**
 * update <name> [--display-name X] [--schema JSON]
 * POST /catalogs/update — idempotent, at least one of display_name or schema required
 */
async function handleUpdate(args) {
  const [name, ...rest] = args;

  validateName(name);

  // Parse --display-name and --schema flags
  const patch = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--display-name" && rest[i + 1]) {
      patch.display_name = rest[i + 1];
      i++;
    } else if (rest[i] === "--schema" && rest[i + 1]) {
      patch.schema = parseSchemaArg(rest[i + 1], "schema");
      i++;
    }
  }

  if (Object.keys(patch).length === 0) {
    throw new ValidationError(
      "Provide at least one of --display-name or --schema to update.",
      "Pass --display-name 'New Name' and/or --schema '{...}'.",
    );
  }

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/catalogs/update", { name, ...patch });

  return { result: response.data };
}

/**
 * remove <name> --confirm
 * POST /catalogs/remove — DESTRUCTIVE
 */
async function handleRemove(args) {
  const [name, ...rest] = args;

  // Confirm gate must come before name validation
  if (!rest.includes("--confirm")) {
    throw new ConfirmError();
  }

  validateName(name);

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/catalogs/remove", { name });

  return { result: response.data };
}

/**
 * view <name>
 * POST /catalogs/view
 */
async function handleView(args) {
  const [name] = args;

  validateName(name);

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/catalogs/view", { name });

  return { catalog: response.data };
}

/**
 * list [--limit N] [--cursor C]
 * POST /catalogs/list
 */
async function handleList(args) {
  const body = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      const limit = Number.parseInt(args[i + 1], 10);
      if (!Number.isNaN(limit)) body.limit = limit;
      i++;
    } else if (args[i] === "--cursor" && args[i + 1]) {
      body.cursor = args[i + 1];
      i++;
    }
  }

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/catalogs/list", body);

  const result = { catalogs: response.data?.catalogs ?? [] };
  if (response.data?.next_cursor) result.next_cursor = response.data.next_cursor;

  return result;
}

/**
 * edit-items <name> <operations-json>
 * POST /catalogs/edit-items — mixed upsert + delete, min 1 op
 */
async function handleEditItems(args) {
  const [name, opsRaw] = args;

  validateName(name);
  const operations = parseOperations(opsRaw);

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/catalogs/edit-items", {
    name,
    operations,
  });

  const result = {};
  if (response.data?.upserts !== undefined) result.upserts = response.data.upserts;
  if (response.data?.deletes !== undefined) result.deletes = response.data.deletes;
  if (response.data?.errors) result.errors = response.data.errors;

  return result;
}
