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
  const mod = await import("../../../skills/batch-cep/scripts/mep/trigger-events.mjs");
  return mod.runAction;
}

// ---------------------------------------------------------------------------
// send command
// ---------------------------------------------------------------------------

describe("trigger-events send", () => {
  it("rejects missing custom_id (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("send", [undefined, JSON.stringify([{ name: "purchase" }])]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/custom_id/i);
  });

  it("rejects empty events array (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("send", ["u_1", JSON.stringify([])]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/at least one/i);
  });

  it("rejects event with uppercase name (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("send", ["u_1", JSON.stringify([{ name: "BadEvent" }])]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/event/i);
  });

  it("happy path: POSTs to /1.0/<app_key>/events/users/<custom_id> with X-Authorization", async () => {
    withCredentials();
    const fetchMock = mockFetch({}, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const events = [{ name: "purchase", label: "checkout", data: { amount: 9.99 } }];
    const out = await captureOutput(() =>
      runAction("send", ["u_1", JSON.stringify(events), "--app-key", "ios_live"]),
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.0/app-ios-test/events/users/u_1");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Authorization"]).toBe("rk-test");
    const body = JSON.parse(init.body);
    expect(body.events).toHaveLength(1);

    expect(out.ok).toBe(true);
    expect(out.command).toBe("trigger-events send");
    expect(out.result.status).toBe("accepted");
    expect(out.result.count).toBe(1);
  });

  it("rejects missing app_key alias in config (VALIDATION_ERROR)", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("send", ["u_1", JSON.stringify([{ name: "buy" }]), "--app-key", "nonexistent"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/nonexistent/i);
  });
});

// ---------------------------------------------------------------------------
// send-bulk command
// ---------------------------------------------------------------------------

describe("trigger-events send-bulk", () => {
  it("rejects empty users array (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("send-bulk", [JSON.stringify([])]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/at least one/i);
  });

  it("rejects user missing id (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const users = [{ events: [{ name: "purchase" }] }];
    const out = await captureOutput(() => runAction("send-bulk", [JSON.stringify(users)]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/id/i);
  });

  it("rejects user with empty events array (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const users = [{ id: "u_1", events: [] }];
    const out = await captureOutput(() => runAction("send-bulk", [JSON.stringify(users)]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/events/i);
  });

  it("happy path: POSTs to /1.0/<app_key>/events/users, body is JSON array (NOT wrapped)", async () => {
    withCredentials();
    const fetchMock = mockFetch({}, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const users = [
      { id: "u_1", events: [{ name: "purchase" }] },
      { id: "u_2", events: [{ name: "login" }] },
    ];
    const out = await captureOutput(() =>
      runAction("send-bulk", [JSON.stringify(users), "--app-key", "ios_live"]),
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.0/app-ios-test/events/users");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Authorization"]).toBe("rk-test");
    const body = JSON.parse(init.body);
    // Body must be a JSON array, NOT wrapped in {users: [...]}
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);

    expect(out.ok).toBe(true);
    expect(out.command).toBe("trigger-events send-bulk");
    expect(out.result.status).toBe("accepted");
    expect(out.result.users_count).toBe(2);
  });

  it("rejects missing app_key alias in config (VALIDATION_ERROR)", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);
    const runAction = await getRunAction();
    const users = [{ id: "u_1", events: [{ name: "buy" }] }];
    const out = await captureOutput(() =>
      runAction("send-bulk", [JSON.stringify(users), "--app-key", "nonexistent"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/nonexistent/i);
  });
});
