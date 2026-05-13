// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captureOutput, fakeCredentials, mockFetch } from "../../helpers.mjs";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

function withCredentials(creds = fakeCredentials()) {
  const dir = mkdtempSync(join(tmpdir(), "batch-cep-test-"));
  writeFileSync(join(dir, "batch-credentials.json"), JSON.stringify(creds));
  process.env.PROJECT_FOLDER = dir;
  return dir;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

// Lazy-import so each test gets a fresh module if needed.
// We use a dynamic import helper to reset state between tests.
async function getDispatch() {
  // Use runAction for testable dispatch (no process.exit)
  const mod = await import("../../../skills/batch-cep/scripts/cep/segments.mjs");
  return mod.runAction;
}

describe("segments list", () => {
  it("calls /2.11/segments/list with Bearer + project header, returns segments", async () => {
    withCredentials();
    const fetchMock = mockFetch({ segments: [{ id: "s_1", name: "Premium" }] });
    globalThis.fetch = fetchMock;

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("list", []);
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/segments/list");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer rk-test");
    expect(init.headers["X-Batch-Project"]).toBe("proj-test");
    expect(out.ok).toBe(true);
    expect(out.result.segments).toHaveLength(1);
    expect(out.result.segments[0].id).toBe("s_1");
  });

  it("returns empty array when API returns no segments field", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({});

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("list", []);
    });

    expect(out.ok).toBe(true);
    expect(Array.isArray(out.result.segments)).toBe(true);
    expect(out.result.segments).toHaveLength(0);
  });

  it("surfaces 401 from Batch as AUTH_ERROR", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "AUTH_ERROR", error_message: "bad key" }, 401);

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("list", []);
    });

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(401);
    expect(out.error.retryable).toBe(false);
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    // Point to a folder with no batch-credentials.json
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("list", []);
    });

    rmSync(dir, { recursive: true });
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });

  it("returns UNKNOWN_ACTION for unrecognised action", async () => {
    withCredentials();

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("bogus", []);
    });

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("UNKNOWN_ACTION");
  });
});
