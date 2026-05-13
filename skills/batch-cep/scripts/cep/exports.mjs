// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { ClientError, cepFetch } from "../../lib/client.mjs";
import { loadConfig } from "../../lib/config.mjs";

const ACTIONS = {
  list: handleList,
  view: handleView,
  download: handleDownload,
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
    return emitSuccess(`exports ${action}`, result);
  } catch (err) {
    if (err instanceof ValidationError) {
      return emitError({
        error_code: "VALIDATION_ERROR",
        error_message: err.message,
        hint: err.hint ?? "Fix the input and retry.",
      });
    }
    if (err instanceof ClientError) {
      const payload = err.toErrorPayload();
      const out = {
        ok: false,
        command: `exports ${action}`,
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
 * Use this from bin/batch.mjs.
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

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * list [--limit N] [--cursor C]
 * POST /exports/list — sync
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
  const response = await cepFetch(creds, "POST", "2.11/exports/list", body);

  const result = { exports: response.data?.exports ?? [] };
  if (response.data?.next_cursor) result.next_cursor = response.data.next_cursor;

  return result;
}

/**
 * view <export-id>
 * POST /exports/view — sync
 */
async function handleView(args) {
  const exportId = args[0];
  if (!exportId) {
    throw new ValidationError(
      "Missing argument. Provide an export_id.",
      "Usage: exports view <export-id>",
    );
  }

  const creds = getCredentials();
  const response = await cepFetch(creds, "POST", "2.11/exports/view", { export_id: exportId });

  return { export: response.data };
}

/**
 * download <export-id>
 * GET /exports/download?id=<export-id> with redirect: "manual"
 *
 * Deviation from cepFetch: uses raw fetch() with redirect: "manual" because
 * cepFetch/fetchWithTimeout does not support custom redirect modes. The manual
 * redirect mode is required to intercept the 302 Location header containing the
 * signed S3 download URL before the browser/runtime would follow it.
 *
 * Behavior:
 * - 3xx → extract Location header → return { status: "redirect", download_url, ... }
 * - 200 → file served inline → return { status: "inline", ... }
 * - 4xx/5xx → throw ClientError
 */
async function handleDownload(args) {
  const exportId = args[0];
  if (!exportId) {
    throw new ValidationError(
      "Missing argument. Provide an export_id.",
      "Usage: exports download <export-id>",
    );
  }

  const creds = getCredentials();
  const url = `${creds.api_base_url}/2.11/exports/download?id=${encodeURIComponent(exportId)}`;

  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      Authorization: `Bearer ${creds.rest_key}`,
      "X-Batch-Project": creds.project_key,
    },
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      throw new ClientError({
        httpStatus: response.status,
        errorMessage: "Redirect response without a Location header.",
        endpoint: "2.11/exports/download",
        platform: "cep",
      });
    }
    const sizeHeader = response.headers.get("content-length");
    const contentType = response.headers.get("content-type");
    const result = {
      status: "redirect",
      download_url: location,
      hint: "Open download_url in browser or a download tool to retrieve the file. URLs are short-lived (typically 15-60 minutes).",
    };
    if (contentType) result.content_type = contentType;
    if (sizeHeader) result.size_bytes = Number.parseInt(sizeHeader, 10);
    return result;
  }

  if (response.status === 200) {
    const sizeHeader = response.headers.get("content-length");
    const contentType = response.headers.get("content-type");
    const result = {
      status: "inline",
      hint: "Batch returned the file inline rather than a signed URL. Call `exports view <export-id>` to retrieve a download_url if available, or use a non-MCP client to fetch this endpoint.",
    };
    if (contentType) result.content_type = contentType;
    if (sizeHeader) result.size_bytes = Number.parseInt(sizeHeader, 10);
    return result;
  }

  // 4xx / 5xx — parse error body
  let errorBody;
  try {
    errorBody = await response.json();
  } catch {
    errorBody = await response.text().catch(() => null);
  }
  const errorCode =
    typeof errorBody === "object" && errorBody?.error_code ? errorBody.error_code : undefined;
  const errorMessage =
    typeof errorBody === "object" && errorBody?.error_message
      ? errorBody.error_message
      : `HTTP ${response.status}`;

  throw new ClientError({
    httpStatus: response.status,
    errorCode,
    errorMessage,
    endpoint: "2.11/exports/download",
    platform: "cep",
  });
}
