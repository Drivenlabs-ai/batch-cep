// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * HTTP client for Batch CEP and MEP APIs with error handling.
 */

const HINTS = {
  400: "The request payload is invalid. Inspect the error_message field — usually a missing or out-of-range parameter. Fix and retry.",
  401: "Authentication failed. Check that BATCH_REST_KEY is correct, and for CEP that BATCH_PROJECT_KEY is also set. The user (account manager on Batch) needs to re-issue the key.",
  403: "The REST key lacks the permission for this operation. An account manager on Batch must grant the right scope or rotate the key.",
  404: "The endpoint or resource doesn't exist. Verify the path and the CEP version.",
  429: "Rate limit exceeded. CEP default is 1 req/s per project; /profiles/update is 300 updates/s (counted per Custom ID, not per request) with burst 1000. Back off and retry with smaller batches.",
  500: "Batch internal server error. Retry with exponential backoff (1s → 2s → 4s, max 5 attempts).",
  503: "Batch is under maintenance. Wait several minutes before retrying.",
  504: "Request timed out. Increase timeout or check connectivity.",
};

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export class ClientError extends Error {
  constructor(opts) {
    const message = opts.errorMessage ?? "Unknown error";
    super(message);
    this.name = "ClientError";
    this.httpStatus = opts.httpStatus;
    this.errorCode = opts.errorCode;
    this.errorMessage = message;
    this.endpoint = opts.endpoint;
    this.platform = opts.platform;
    this.retryable = RETRYABLE.has(opts.httpStatus);
    this.hint = HINTS[opts.httpStatus] ?? "Unexpected response from Batch.";
  }

  toErrorPayload() {
    return {
      ok: false,
      http_status: this.httpStatus,
      error_code: this.errorCode ?? null,
      error_message: this.errorMessage,
      platform: this.platform,
      endpoint: this.endpoint,
      retryable: this.retryable,
      hint: this.hint,
    };
  }
}

/**
 * Fetch with AbortController timeout.
 * @private
 */
async function fetchWithTimeout(url, init, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("TIMEOUT");
    }
    throw err;
  }
  clearTimeout(timeout);

  return response;
}

/**
 * Parse response body safely.
 * @private
 */
async function parseBodySafely(response) {
  const text = await response.text();
  if (!text) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Extract error_code and error_message from response body.
 * @private
 */
function extractErrorFields(data) {
  if (!data || typeof data !== "object") {
    return { errorCode: undefined, errorMessage: undefined };
  }
  const obj = data;
  const errorCode = typeof obj.error_code === "string" ? obj.error_code : undefined;
  const errorMessage =
    typeof obj.error_message === "string"
      ? obj.error_message
      : typeof obj.message === "string"
        ? obj.message
        : undefined;
  return { errorCode, errorMessage };
}

/**
 * CEP fetch: uses Bearer token auth + X-Batch-Project header.
 * @param {Object} credentials - with rest_key, project_key
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} endpoint - path without base URL (e.g., "2.11/profiles/list")
 * @param {unknown} body - request body (optional)
 * @param {number} timeoutMs - request timeout in ms (default 30000)
 * @returns {Promise<{status: number, data: unknown}>}
 * @throws {ClientError}
 */
export async function cepFetch(credentials, method, endpoint, body, timeoutMs = 30000) {
  const url = `${credentials.api_base_url}/${endpoint}`;
  const headers = {
    Authorization: `Bearer ${credentials.rest_key}`,
    "X-Batch-Project": credentials.project_key,
    "Content-Type": "application/json",
  };

  let response;
  try {
    response = await fetchWithTimeout(
      url,
      { method, headers, body: body ? JSON.stringify(body) : undefined },
      timeoutMs,
    );
  } catch (err) {
    if (err instanceof Error && err.message === "TIMEOUT") {
      throw new ClientError({
        httpStatus: 504,
        errorMessage: `Request timed out after ${timeoutMs}ms`,
        endpoint,
        platform: "cep",
      });
    }
    throw err;
  }

  const data = await parseBodySafely(response);

  if (!response.ok) {
    const { errorCode, errorMessage } = extractErrorFields(data);
    throw new ClientError({
      httpStatus: response.status,
      errorCode,
      errorMessage: errorMessage ?? response.statusText ?? "Unknown error",
      endpoint,
      platform: "cep",
    });
  }

  return { status: response.status, data };
}

/**
 * MEP fetch: uses X-Authorization header (REST key in header, app key in URL).
 * @param {Object} credentials - with rest_key, app_keys
 * @param {string} method - HTTP method
 * @param {string} endpoint - path with version and app key (e.g., "1.0/<app_key>/send")
 * @param {unknown} body - request body (optional)
 * @param {number} timeoutMs - request timeout in ms (default 30000)
 * @returns {Promise<{status: number, data: unknown}>}
 * @throws {ClientError}
 */
export async function mepFetch(credentials, method, endpoint, body, timeoutMs = 30000) {
  const url = `${credentials.api_base_url}/${endpoint}`;
  const headers = {
    "X-Authorization": credentials.rest_key,
    "Content-Type": "application/json",
  };

  let response;
  try {
    response = await fetchWithTimeout(
      url,
      { method, headers, body: body ? JSON.stringify(body) : undefined },
      timeoutMs,
    );
  } catch (err) {
    if (err instanceof Error && err.message === "TIMEOUT") {
      throw new ClientError({
        httpStatus: 504,
        errorMessage: `Request timed out after ${timeoutMs}ms`,
        endpoint,
        platform: "mep",
      });
    }
    throw err;
  }

  const data = await parseBodySafely(response);

  if (!response.ok) {
    const { errorCode, errorMessage } = extractErrorFields(data);
    throw new ClientError({
      httpStatus: response.status,
      errorCode,
      errorMessage: errorMessage ?? response.statusText ?? "Unknown error",
      endpoint,
      platform: "mep",
    });
  }

  return { status: response.status, data };
}
