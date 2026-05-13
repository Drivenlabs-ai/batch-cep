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
  const dir = mkdtempSync(join(tmpdir(), "batch-cep-gdpr-test-"));
  writeFileSync(join(dir, "batch-credentials.json"), JSON.stringify(creds));
  process.env.PROJECT_FOLDER = dir;
  return dir;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

async function getRunAction() {
  const mod = await import("../../../skills/batch-cep/scripts/mep/gdpr.mjs");
  return mod.runAction;
}

// ---------------------------------------------------------------------------
// access-request (5 tests)
// ---------------------------------------------------------------------------

describe("gdpr access-request", () => {
  it("1. rejects when no identifier provided (refine fail)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("access-request", [JSON.stringify({}), "ops@x.com"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/exactly one/i);
  });

  it("2. rejects when multiple identifiers provided (refine fail)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("access-request", [
        JSON.stringify({ custom_id: "u_1", email: "user@x.com" }),
        "ops@x.com",
      ]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/exactly one/i);
  });

  it("3. rejects missing notification_email", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("access-request", [JSON.stringify({ custom_id: "u_1" })]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("4. happy path — custom_id, posts to correct URL, returns request_id", async () => {
    withCredentials();
    const fetchMock = mockFetch({ request_id: "r_1" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("access-request", [JSON.stringify({ custom_id: "u_1" }), "ops@x.com"]),
    );

    expect(out.ok).toBe(true);
    expect(out.command).toBe("gdpr access-request");
    expect(out.result.status).toBe("requested");
    expect(out.result.request_id).toBe("r_1");
    expect(out.result.next_step).toMatch(/requests-view/i);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("1.1/app-ios-test/gdpr/requests");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.type).toBe("access");
    expect(body.custom_id).toBe("u_1");
    expect(body.notification_email).toBe("ops@x.com");
    expect(body.app_key).toBeUndefined();
  });

  it("5. app_key unknown alias → VALIDATION_ERROR", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("access-request", [
        JSON.stringify({ custom_id: "u_1" }),
        "ops@x.com",
        "--app-key",
        "unknown_alias",
      ]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/unknown_alias/);
  });
});

// ---------------------------------------------------------------------------
// erasure-request (6 tests)
// ---------------------------------------------------------------------------

describe("gdpr erasure-request", () => {
  it("1. rejects when --confirm missing (CONFIRM_REQUIRED)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("erasure-request", [JSON.stringify({ custom_id: "u_1" }), "ops@x.com"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
  });

  it("2. rejects confirm=false equivalent (no --confirm flag)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("erasure-request", [JSON.stringify({ custom_id: "u_1" }), "ops@x.com", "--limit"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
  });

  it("3. rejects when no identifier provided (refine fail)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("erasure-request", [JSON.stringify({}), "ops@x.com", "--confirm"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/exactly one/i);
  });

  it("4. rejects when multiple identifiers provided (refine fail)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("erasure-request", [
        JSON.stringify({ custom_id: "u_1", install_id: "i_1" }),
        "ops@x.com",
        "--confirm",
      ]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/exactly one/i);
  });

  it("5. happy path — install_id, --confirm, confirm stripped from body", async () => {
    withCredentials();
    const fetchMock = mockFetch({ id: "r_2" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("erasure-request", [
        JSON.stringify({ install_id: "i_1" }),
        "ops@x.com",
        "--confirm",
      ]),
    );

    expect(out.ok).toBe(true);
    expect(out.result.status).toBe("requested");
    expect(out.result.request_id).toBe("r_2");
    expect(out.result.next_step).toMatch(/erasure is permanent/i);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("1.1/app-ios-test/gdpr/requests");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.type).toBe("erasure");
    expect(body.install_id).toBe("i_1");
    expect(body.notification_email).toBe("ops@x.com");
    expect(body.confirm).toBeUndefined();
    expect(body.app_key).toBeUndefined();
  });

  it("6. app_key unknown alias → VALIDATION_ERROR", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("erasure-request", [
        JSON.stringify({ custom_id: "u_1" }),
        "ops@x.com",
        "--confirm",
        "--app-key",
        "bad_alias",
      ]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/bad_alias/);
  });
});

// ---------------------------------------------------------------------------
// requests-list (3 tests)
// ---------------------------------------------------------------------------

describe("gdpr requests-list", () => {
  it("1. happy path — lists requests", async () => {
    withCredentials();
    const fetchMock = mockFetch({ requests: [{ id: "r_1", type: "access", status: "pending" }] });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("requests-list", []));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("gdpr requests-list");
    expect(out.result.requests).toHaveLength(1);
    expect(out.result.requests[0].id).toBe("r_1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("1.1/app-ios-test/gdpr/requests");
    expect(init.method).toBe("GET");
  });

  it("2. pagination — limit and cursor forwarded, next_cursor returned", async () => {
    withCredentials();
    const fetchMock = mockFetch({ requests: [], next_cursor: "cursor_next" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("requests-list", ["--limit", "10", "--cursor", "cursor_abc"]),
    );

    expect(out.ok).toBe(true);
    expect(out.result.next_cursor).toBe("cursor_next");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("limit=10");
    expect(url).toContain("cursor=cursor_abc");
  });

  it("3. app_key unknown alias → VALIDATION_ERROR", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("requests-list", ["--app-key", "ghost_platform"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// requests-view (3 tests)
// ---------------------------------------------------------------------------

describe("gdpr requests-view", () => {
  it("1. rejects when request_id is missing", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("requests-view", []));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/request_id/i);
  });

  it("2. happy path — fetches by id, returns raw", async () => {
    withCredentials();
    const fetchMock = mockFetch({ id: "r_1", type: "access", status: "completed" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("requests-view", ["r_1"]));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("gdpr requests-view");
    expect(out.result.id).toBe("r_1");
    expect(out.result.type).toBe("access");
    expect(out.result.status).toBe("completed");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("1.1/app-ios-test/gdpr/requests/r_1");
    expect(init.method).toBe("GET");
  });

  it("3. surfaces 404 from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "Request not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("requests-view", ["r_unknown"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
    expect(out.error.error_code).toBe("NOT_FOUND");
  });
});
