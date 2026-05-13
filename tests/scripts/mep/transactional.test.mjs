// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureOutput, fakeCredentials, mockFetch } from "../../helpers.mjs";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

function withCredentials(creds = fakeCredentials()) {
  const dir = mkdtempSync(join(tmpdir(), "batch-cep-transactional-test-"));
  writeFileSync(join(dir, "batch-credentials.json"), JSON.stringify(creds));
  process.env.PROJECT_FOLDER = dir;
  return dir;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

async function getRunAction() {
  const mod = await import("../../../skills/batch-cep/scripts/mep/transactional.mjs");
  return mod.runAction;
}

// ---------------------------------------------------------------------------
// send command
// ---------------------------------------------------------------------------

describe("transactional send", () => {
  it("1. rejects when group_id is missing", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const payload = JSON.stringify({
      recipients: { custom_ids: ["u_1"] },
      message: { body: "hi" },
    });
    const out = await captureOutput(() => runAction("send", [payload]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/group_id/i);
  });

  it("2. rejects group_id with spaces (regex fail)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const payload = JSON.stringify({
      group_id: "has space",
      recipients: { custom_ids: ["u_1"] },
      message: { body: "hi" },
    });
    const out = await captureOutput(() => runAction("send", [payload]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("3. rejects when both message and messages are provided", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const payload = JSON.stringify({
      group_id: "order_confirmed",
      recipients: { custom_ids: ["u_1"] },
      message: { body: "hi" },
      messages: { en: { body: "hi" } },
    });
    const out = await captureOutput(() => runAction("send", [payload]));
    expect(out.ok).toBe(false);
    expect(out.error.error_message).toMatch(/exactly one/i);
  });

  it("4. rejects when neither message nor messages is provided", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const payload = JSON.stringify({
      group_id: "order_confirmed",
      recipients: { custom_ids: ["u_1"] },
    });
    const out = await captureOutput(() => runAction("send", [payload]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("5. rejects push_type=background with message present", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const payload = JSON.stringify({
      group_id: "silent",
      recipients: { custom_ids: ["u_1"] },
      push_type: "background",
      message: { body: "hi" },
    });
    const out = await captureOutput(() => runAction("send", [payload]));
    expect(out.ok).toBe(false);
    expect(out.error.error_message).toMatch(/background/i);
  });

  it("6. rejects deeplink + landing together", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const payload = JSON.stringify({
      group_id: "promo",
      recipients: { custom_ids: ["u_1"] },
      message: { body: "hi" },
      deeplink: "myapp://home",
      landing: { theme: "default" },
    });
    const out = await captureOutput(() => runAction("send", [payload]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("7. happy path — POSTs to correct URL with X-Authorization, body verbatim without app_key", async () => {
    withCredentials();
    const fetchMock = mockFetch({ notification_id: "n_42" }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const payload = JSON.stringify({
      group_id: "order_confirmed",
      recipients: { custom_ids: ["u_1"] },
      message: { title: "Order", body: "Confirmed" },
    });
    const out = await captureOutput(() => runAction("send", [payload]));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/transactional/send");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Authorization"]).toBe("rk-test");
    expect(init.headers.Authorization).toBeUndefined();

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      group_id: "order_confirmed",
      recipients: { custom_ids: ["u_1"] },
      message: { title: "Order", body: "Confirmed" },
    });
    expect(body.app_key).toBeUndefined();

    expect(out.ok).toBe(true);
    expect(out.result.status).toBe("sent");
  });

  it("8. surfaces missing app_key alias with APPKEY_UNRESOLVED error mentioning env var name", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);
    const runAction = await getRunAction();
    const payload = JSON.stringify({
      group_id: "order_confirmed",
      recipients: { custom_ids: ["u_1"] },
      message: { body: "hi" },
    });
    const out = await captureOutput(() =>
      runAction("send", [payload, "--app-key", "ios_live_nonexistent"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("APPKEY_UNRESOLVED");
    expect(JSON.stringify(out)).toMatch(/BATCH_IOS_LIVE_NONEXISTENT_KEY/);
  });
});

// ---------------------------------------------------------------------------
// stats command
// ---------------------------------------------------------------------------

describe("transactional stats", () => {
  it("9. rejects missing group_id", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("stats", []));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/group_id/i);
  });

  it("10. rejects group_id with invalid chars (regex fail)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("stats", ["bad space"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("11. happy path — GETs correct URL with X-Authorization", async () => {
    withCredentials();
    const fetchMock = mockFetch({ sent: 10, delivered: 9 }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("stats", ["order_confirmed"]));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/transactional/stats/order_confirmed");
    expect(init.method).toBe("GET");
    expect(init.headers["X-Authorization"]).toBe("rk-test");
    expect(init.headers.Authorization).toBeUndefined();

    expect(out.ok).toBe(true);
    expect(out.result).toMatchObject({ sent: 10, delivered: 9 });
  });

  it("12. 404 from Batch is surfaced as error", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_message: "unknown group", error_code: "NOT_FOUND" }, 404);

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("stats", ["unknown_group"]));
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out)).toMatch(/unknown group/i);
  });
});
