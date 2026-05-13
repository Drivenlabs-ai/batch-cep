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
  const dir = mkdtempSync(join(tmpdir(), "batch-cep-exports-test-"));
  writeFileSync(join(dir, "batch-credentials.json"), JSON.stringify(creds));
  process.env.PROJECT_FOLDER = dir;
  return dir;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

async function getRunAction() {
  const mod = await import("../../../skills/batch-cep/scripts/mep/exports.mjs");
  return mod.runAction;
}

// ---------------------------------------------------------------------------
// mep-export create (5 tests)
// ---------------------------------------------------------------------------

describe("mep-export create", () => {
  it("rejects missing type argument", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", []));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toContain("type");
  });

  it("happy path — creates export without filter", async () => {
    withCredentials();
    const fetchMock = mockFetch({ export_id: "exp-12345" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", ["profile_snapshot"]));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("mep-export create");
    expect(out.result.status).toBe("requested");
    expect(out.result.export_id).toBe("exp-12345");
    expect(out.result.next_step).toContain("view");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("1.1/");
    expect(url).toContain("/exports/create");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Authorization"]).toBe("rk-test");
    const body = JSON.parse(init.body);
    expect(body.type).toBe("profile_snapshot");
    expect(body.filter).toBeUndefined();
  });

  it("happy path — creates export with filter", async () => {
    withCredentials();
    const fetchMock = mockFetch({ export_id: "exp-67890" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("create", ["profile_snapshot", "--filter", '{"region":"US"}']),
    );

    expect(out.ok).toBe(true);
    expect(out.result.export_id).toBe("exp-67890");

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.type).toBe("profile_snapshot");
    expect(body.filter).toEqual({ region: "US" });
  });

  it("surfaces 400 invalid type from Batch", async () => {
    withCredentials();
    const fetchMock = mockFetch(
      { error_code: "INVALID_EXPORT_TYPE", error_message: "Unknown export type: invalid_type" },
      400,
    );
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", ["invalid_type"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(400);
    expect(out.error.error_code).toBe("INVALID_EXPORT_TYPE");
  });

  it("surfaces app_key resolution failure", async () => {
    withCredentials({ ...fakeCredentials(), app_keys: { web: "dummy" }, default_app_key: "web" });
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("create", ["profile_snapshot", "--app-key", "ios_live"]),
    );

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("APP_KEY_UNRESOLVED");
  });
});

// ---------------------------------------------------------------------------
// mep-export list (3 tests)
// ---------------------------------------------------------------------------

describe("mep-export list", () => {
  it("happy path — lists exports without pagination", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      exports: [
        { export_id: "exp-1", status: "ready", type: "profile_snapshot" },
        { export_id: "exp-2", status: "pending", type: "event_log" },
      ],
    });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", []));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("mep-export list");
    expect(out.result.exports).toHaveLength(2);
    expect(out.result.exports[0].export_id).toBe("exp-1");
    expect(out.result.next_cursor).toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("1.1/");
    expect(url).toContain("/exports/list");
    expect(init.method).toBe("GET");
  });

  it("happy path — lists exports with pagination", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      exports: [{ export_id: "exp-3", status: "ready" }],
      next_cursor: "cursor-abc123",
    });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("list", ["--limit", "1", "--cursor", "prev-cursor"]),
    );

    expect(out.ok).toBe(true);
    expect(out.result.exports).toHaveLength(1);
    expect(out.result.next_cursor).toBe("cursor-abc123");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("limit=1");
    expect(url).toContain("cursor=prev-cursor");
  });

  it("surfaces app_key resolution failure", async () => {
    withCredentials({ ...fakeCredentials(), app_keys: { web: "dummy" }, default_app_key: "web" });
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", ["--app-key", "android_live"]));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("APP_KEY_UNRESOLVED");
  });
});

// ---------------------------------------------------------------------------
// mep-export view (4 tests)
// ---------------------------------------------------------------------------

describe("mep-export view", () => {
  it("rejects missing export_id argument", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", []));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toContain("export_id");
  });

  it("happy path — views pending export", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      export_id: "exp-pending",
      status: "pending",
      created_at: "2026-05-13T10:00:00Z",
    });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["exp-pending"]));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("mep-export view");
    expect(out.result.export_id).toBe("exp-pending");
    expect(out.result.status).toBe("pending");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("1.1/");
    expect(url).toContain("/exports/exp-pending");
    expect(init.method).toBe("GET");
  });

  it("happy path — views ready export with download_url", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      export_id: "exp-ready",
      status: "ready",
      download_url: "https://downloads.batch.com/exp-ready.csv?sig=xyz",
    });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["exp-ready"]));

    expect(out.ok).toBe(true);
    expect(out.result.status).toBe("ready");
    expect(out.result.download_url).toContain("downloads.batch.com");
  });

  it("surfaces 404 export not found", async () => {
    withCredentials();
    const fetchMock = mockFetch(
      { error_code: "EXPORT_NOT_FOUND", error_message: "Export not found" },
      404,
    );
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["exp-missing"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });
});
