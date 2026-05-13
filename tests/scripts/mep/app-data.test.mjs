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
  const dir = mkdtempSync(join(tmpdir(), "batch-cep-app-data-test-"));
  writeFileSync(join(dir, "batch-credentials.json"), JSON.stringify(creds));
  process.env.PROJECT_FOLDER = dir;
  return dir;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

async function getRunAction() {
  const mod = await import("../../../skills/batch-cep/scripts/mep/app-data.mjs");
  return mod.runAction;
}

// ---------------------------------------------------------------------------
// app-data set (5 tests)
// ---------------------------------------------------------------------------

describe("app-data set", () => {
  it("rejects key with special chars (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("set", ["my@key", '{"test":true}']));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty key (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("set", ["", '{"test":true}']));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects missing value argument (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("set", ["my_key"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path — creates key with primitive value", async () => {
    withCredentials();
    const fetchMock = mockFetch({});
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("set", ["api_version", '"v2.0"']));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("app-data set");
    expect(out.result.status).toBe("created");
    expect(out.result.key).toBe("api_version");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("1.1/");
    expect(url).toMatch(/\/data\/app$/);
    expect(init.method).toBe("POST");
    expect(init.headers["X-Authorization"]).toBe("rk-test");
    const body = JSON.parse(init.body);
    expect(body.key).toBe("api_version");
    expect(body.value).toBe("v2.0");
  });

  it("happy path — creates key with object value", async () => {
    withCredentials();
    const fetchMock = mockFetch({});
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("set", ["config", '{"enabled":true,"level":5}']),
    );

    expect(out.ok).toBe(true);
    expect(out.result.key).toBe("config");

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.value).toEqual({ enabled: true, level: 5 });
  });

  it("surfaces 409 duplicate from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "EXISTS", error_message: "Key already exists" },
      409,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("set", ["api_version", '"v2.0"']));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(409);
    expect(out.error.error_code).toBe("EXISTS");
  });
});

// ---------------------------------------------------------------------------
// app-data list (4 tests)
// ---------------------------------------------------------------------------

describe("app-data list", () => {
  it("happy path — lists with no params", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      data: [{ key: "api_version", value: "v2.0" }],
    });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", []));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("app-data list");
    expect(out.result.data).toEqual([{ key: "api_version", value: "v2.0" }]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/data/app");
    expect(init.method).toBe("GET");
  });

  it("happy path — lists with limit", async () => {
    withCredentials();
    const fetchMock = mockFetch({ data: [] });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", ["--limit", "50"]));

    expect(out.ok).toBe(true);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("limit=50");
  });

  it("happy path — lists with pagination cursor", async () => {
    withCredentials();
    const fetchMock = mockFetch({ data: [], next_cursor: "abc123" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", ["--cursor", "xyz789"]));

    expect(out.ok).toBe(true);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("cursor=xyz789");
    expect(out.result.next_cursor).toBe("abc123");
  });

  it("returns empty array when no data", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(null);
    globalThis.fetch = mockFetch({});

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", []));

    expect(out.ok).toBe(true);
    expect(out.result.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// app-data update (4 tests)
// ---------------------------------------------------------------------------

describe("app-data update", () => {
  it("rejects key with special chars (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["key!", '{"new":true}']));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects missing value argument (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["api_version"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path — updates existing key", async () => {
    withCredentials();
    const fetchMock = mockFetch({});
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["api_version", '"v3.0"']));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("app-data update");
    expect(out.result.status).toBe("updated");
    expect(out.result.key).toBe("api_version");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/data/app/api_version");
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body);
    expect(body.value).toBe("v3.0");
  });

  it("surfaces 404 unknown key from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "NOT_FOUND", error_message: "Key not found" }, 404);

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["unknown_key", "{}"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
    expect(out.error.error_code).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// app-data delete (4 tests)
// ---------------------------------------------------------------------------

describe("app-data delete", () => {
  it("rejects delete without --confirm", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["api_version"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
  });

  it("rejects key with special chars (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["key!", "--confirm"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path — deletes with --confirm flag", async () => {
    withCredentials();
    const fetchMock = mockFetch({});
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["api_version", "--confirm"]));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("app-data delete");
    expect(out.result.status).toBe("deleted");
    expect(out.result.key).toBe("api_version");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/data/app/api_version");
    expect(init.method).toBe("DELETE");
  });

  it("surfaces 404 unknown key from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "NOT_FOUND", error_message: "Key not found" }, 404);

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["unknown_key", "--confirm"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("app-data error handling", () => {
  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("set", ["test", "{}"]));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
    rmSync(dir, { recursive: true });
  });

  it("returns UNKNOWN_ACTION for invalid action", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("invalid", ["arg"]));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("UNKNOWN_ACTION");
  });
});
