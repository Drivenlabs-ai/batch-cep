// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

async function getRunAction() {
  const mod = await import("../../../skills/batch-cep/scripts/mep/custom-data.mjs");
  return mod.runAction;
}

// ---------------------------------------------------------------------------
// set command
// ---------------------------------------------------------------------------

describe("custom-data set", () => {
  it("rejects missing custom_id (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("set", [undefined, JSON.stringify({ key: "value" })]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/custom_id/i);
  });

  it("rejects custom_id > 512 chars (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const longId = "u_" + "a".repeat(511);
    const out = await captureOutput(() =>
      runAction("set", [longId, JSON.stringify({ key: "value" })]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/512/i);
  });

  it("accepts empty attributes object", async () => {
    withCredentials();
    const fetchMock = mockFetch({}, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("set", ["u_1", JSON.stringify({})]));

    expect(out.ok).toBe(true);
    expect(out.result.status).toBe("applied");
    expect(out.result.custom_id).toBe("u_1");
  });

  it("happy path: POSTs to /1.1/<app_key>/data/users/<custom_id> with attributes body", async () => {
    withCredentials();
    const fetchMock = mockFetch({}, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const attrs = { firstname: "Jane", age: 30 };
    const out = await captureOutput(() =>
      runAction("set", ["u_1", JSON.stringify(attrs), "--app-key", "ios_live"]),
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/data/users/u_1");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Authorization"]).toBe("rk-test");
    const bodyParsed = JSON.parse(init.body);
    expect(bodyParsed.attributes).toEqual(attrs);
    expect(bodyParsed.overwrite).toBeUndefined();

    expect(out.ok).toBe(true);
    expect(out.result.status).toBe("applied");
    expect(out.result.custom_id).toBe("u_1");
  });

  it("rejects missing app_key alias in config (CLIENT_ERROR)", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("set", ["u_1", JSON.stringify({}), "--app-key", "nonexistent"]),
    );

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/nonexistent/i);
  });

  it("includes overwrite field in body when --overwrite flag is set", async () => {
    withCredentials();
    const fetchMock = mockFetch({}, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const attrs = { key: "val" };
    const out = await captureOutput(() =>
      runAction("set", ["u_1", JSON.stringify(attrs), "--overwrite"]),
    );

    const [, init] = fetchMock.mock.calls[0];
    const bodyParsed = JSON.parse(init.body);
    expect(bodyParsed.overwrite).toBe(true);
    expect(out.ok).toBe(true);
  });

  it("URL-encodes custom_id special chars in path", async () => {
    withCredentials();
    const fetchMock = mockFetch({}, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const customId = "user@example.com";
    await captureOutput(() => runAction("set", [customId, JSON.stringify({})]));

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("user%40example.com");
  });
});

// ---------------------------------------------------------------------------
// delete command
// ---------------------------------------------------------------------------

describe("custom-data delete", () => {
  it("rejects missing --confirm flag (CONFIRM_REQUIRED)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["u_1"]));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
    expect(out.error.error_message).toMatch(/--confirm/i);
  });

  it("rejects missing custom_id (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", [undefined, "--confirm"]));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/custom_id/i);
  });

  it("happy path: DELETEs to /1.1/<app_key>/data/users/<custom_id> with --confirm", async () => {
    withCredentials();
    const fetchMock = mockFetch(null, 204);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("delete", ["u_1", "--confirm", "--app-key", "ios_live"]),
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/data/users/u_1");
    expect(init.method).toBe("DELETE");
    expect(init.headers["X-Authorization"]).toBe("rk-test");

    expect(out.ok).toBe(true);
    expect(out.result.status).toBe("deleted");
    expect(out.result.custom_id).toBe("u_1");
  });

  it("surfaces 404 as client error (NOT_FOUND)", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "NOT_FOUND", error_message: "User not found" }, 404);

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["u_nonexistent", "--confirm"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });

  it("rejects missing app_key alias in config (VALIDATION_ERROR)", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("delete", ["u_1", "--confirm", "--app-key", "nonexistent"]),
    );

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/nonexistent/i);
  });
});
