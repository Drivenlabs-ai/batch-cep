// Shared test utilities for the batch-cep plugin.
import { vi } from "vitest";

/**
 * Build a mocked `fetch` returning a Response-like object.
 * Pass `body` as object (JSON-encoded) or string (returned as-is).
 */
export function mockFetch(body, status = 200, headers = {}) {
  return vi.fn(async () => {
    const responseHeaders = { "Content-Type": "application/json", ...headers };
    const responseBody = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(responseBody, { status, headers: responseHeaders });
  });
}

/**
 * Run `fn()` while capturing `console.log` output, return the parsed JSON.
 * Throws if output is not valid JSON.
 */
export async function captureOutput(fn) {
  const logs = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (s) => logs.push(s);
  console.error = (s) => logs.push(s);
  try {
    await fn();
  } finally {
    console.log = origLog;
    console.error = origError;
  }
  const joined = logs.join("\n").trim();
  if (!joined) return null;
  return JSON.parse(joined);
}

/**
 * Default test credentials. Override individual fields by passing { ...overrides }.
 */
export function fakeCredentials(overrides = {}) {
  return {
    rest_key: "rk-test",
    project_key: "proj-test",
    app_keys: {
      ios_live: "app-ios-test",
      ios_dev: "app-ios-dev-test",
      android_live: "app-android-test",
      android_dev: "app-android-dev-test",
      web: "app-web-test",
    },
    default_app_key: "ios_live",
    api_base_url: "https://api.batch.com",
    ...overrides,
  };
}
