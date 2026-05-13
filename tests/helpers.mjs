// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { vi } from "vitest";

/**
 * Build a vi.fn() that mimics fetch(): returns a Response-like object with the
 * given body, status, and headers. Use to mock globalThis.fetch in tests.
 */
export function mockFetch(body, status = 200, headers = {}) {
  return vi.fn(async () => {
    const bodyText =
      body === null || body === undefined
        ? null
        : typeof body === "string"
          ? body
          : JSON.stringify(body);
    const responseHeaders = { "Content-Type": "application/json", ...headers };
    return new Response(bodyText, { status, headers: responseHeaders });
  });
}

/**
 * Capture console.log output during fn() execution and parse it as JSON.
 * Scripts write exactly one JSON object to stdout — this helper extracts it.
 */
export async function captureOutput(fn) {
  const logs = [];
  const originalLog = console.log;
  console.log = (s) => logs.push(typeof s === "string" ? s : String(s));
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  const joined = logs.join("\n").trim();
  if (!joined) return null;
  return JSON.parse(joined);
}

/**
 * Default test credentials used by tests. Override individual fields via the
 * overrides param.
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
