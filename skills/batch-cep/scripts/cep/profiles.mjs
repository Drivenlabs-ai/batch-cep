// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, cepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";
import { validateBatchEvent, validateCustomId } from "../../lib/validate.mjs";

const VALID_EXPORT_TYPES = new Set(["attributes", "custom_attributes", "identifiers", "events"]);

const ACTIONS = {
  update: handleUpdate,
  "mass-update": handleMassUpdate,
  export: handleExport,
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
    return emitSuccess(`profiles ${action}`, result);
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
        command: `profiles ${action}`,
        platform: "cep",
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
// Internal error class for validation failures
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
 * Parse CLI edits argument: first positional arg as JSON string.
 */
function parseEditsArg(args) {
  const raw = args[0];
  if (!raw) {
    throw new ValidationError(
      "Missing edits argument. Pass a JSON array of profile edits.",
      'Example: node bin/batch.mjs profiles update \'[{"identifiers":{"custom_id":"u_1"}}]\'',
    );
  }
  let edits;
  try {
    edits = JSON.parse(raw);
  } catch {
    throw new ValidationError(
      "edits argument is not valid JSON.",
      "Pass a JSON array of profile edits.",
    );
  }
  if (!Array.isArray(edits)) {
    throw new ValidationError(
      "edits must be a JSON array.",
      "The body is always an array, even for one profile.",
    );
  }
  return edits;
}

/**
 * Validate a single profile edit object.
 * Mirrors ProfileEditSchema + ProfileIdentifiersSchema from batch-mcp.
 */
function validateEdit(edit, index) {
  if (typeof edit !== "object" || edit === null || Array.isArray(edit)) {
    throw new ValidationError(`Edit at index ${index} must be an object.`);
  }

  const { identifiers, attributes, events } = edit;

  // Validate identifiers
  if (typeof identifiers !== "object" || identifiers === null) {
    throw new ValidationError(`Edit[${index}].identifiers is required and must be an object.`);
  }

  const hasCustomId = "custom_id" in identifiers;
  const hasInstallation = "installation" in identifiers;

  if (hasCustomId && hasInstallation) {
    throw new ValidationError(
      `Edit[${index}].identifiers must have exactly one of custom_id OR installation, not both.`,
    );
  }
  if (!hasCustomId && !hasInstallation) {
    throw new ValidationError(
      `Edit[${index}].identifiers must have exactly one of custom_id OR installation.`,
    );
  }

  if (hasCustomId) {
    const r = validateCustomId(identifiers.custom_id);
    if (!r.ok) {
      throw new ValidationError(`Edit[${index}].identifiers.custom_id: ${r.error}`);
    }
  }

  if (hasInstallation) {
    const inst = identifiers.installation;
    if (typeof inst !== "object" || inst === null) {
      throw new ValidationError(
        `Edit[${index}].identifiers.installation must be an object with apikey and installation_id.`,
      );
    }
    if (!inst.apikey || typeof inst.apikey !== "string") {
      throw new ValidationError(
        `Edit[${index}].identifiers.installation.apikey is required (string).`,
      );
    }
    if (!inst.installation_id || typeof inst.installation_id !== "string") {
      throw new ValidationError(
        `Edit[${index}].identifiers.installation.installation_id is required (string).`,
      );
    }
  }

  // Validate attributes (must be plain object if present)
  if (attributes !== undefined) {
    if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) {
      throw new ValidationError(`Edit[${index}].attributes must be a plain object.`);
    }
  }

  // Validate events (array, max 15, each passes validateBatchEvent)
  if (events !== undefined) {
    if (!Array.isArray(events)) {
      throw new ValidationError(`Edit[${index}].events must be an array.`);
    }
    if (events.length > 15) {
      throw new ValidationError(
        `Edit[${index}].events has ${events.length} events; max 15 per edit.`,
      );
    }
    for (let i = 0; i < events.length; i++) {
      const r = validateBatchEvent(events[i]);
      if (!r.ok) {
        throw new ValidationError(
          `Edit[${index}].events[${i}]: ${r.error}`,
          "Event name must match [a-z0-9_], max 30 chars.",
        );
      }
    }
  }
}

function validateEdits(edits, maxCount) {
  if (edits.length === 0) {
    throw new ValidationError(
      "Pass at least one edit. The body is always an array, even for one profile.",
    );
  }
  if (edits.length > maxCount) {
    throw new ValidationError(`Too many edits: ${edits.length}. Max ${maxCount} per call.`);
  }
  for (let i = 0; i < edits.length; i++) {
    validateEdit(edits[i], i);
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleUpdate(args) {
  const edits = parseEditsArg(args);
  validateEdits(edits, 200);

  const creds = getCredentials();
  await cepFetch(creds, "POST", "2.11/profiles/update", edits);

  return { status: "applied", count: edits.length };
}

async function handleMassUpdate(args) {
  const edits = parseEditsArg(args);
  validateEdits(edits, 10_000);

  const creds = getCredentials();
  await cepFetch(creds, "POST", "2.11/profiles/mass-update", edits);

  return { status: "applied", count: edits.length };
}

async function handleExport(args) {
  const typesRaw = args[0] ?? "";
  const filterRaw = args[1];

  // Parse types: comma-separated string
  const types = typesRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (types.length === 0) {
    throw new ValidationError(
      "types must be a non-empty comma-separated list. Valid types: attributes, custom_attributes, identifiers, events.",
    );
  }

  for (const t of types) {
    if (!VALID_EXPORT_TYPES.has(t)) {
      throw new ValidationError(
        `Unknown type "${t}". Valid types: ${Array.from(VALID_EXPORT_TYPES).join(", ")}.`,
      );
    }
  }

  let filter;
  if (filterRaw) {
    try {
      filter = JSON.parse(filterRaw);
    } catch {
      throw new ValidationError("filter argument is not valid JSON.");
    }
  }

  const creds = getCredentials();
  const body = { types, ...(filter ? { filter } : {}) };
  const response = await cepFetch(creds, "POST", "2.11/profiles/export", body);

  return {
    status: "requested",
    export_id: response.data.export_id,
    next_step:
      "Call cep_exports_view with this export_id to poll status. " +
      "Once status is 'ready', call cep_exports_download to retrieve the signed URL.",
  };
}
