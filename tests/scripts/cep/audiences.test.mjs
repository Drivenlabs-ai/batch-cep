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
  const dir = mkdtempSync(join(tmpdir(), "batch-cep-audiences-test-"));
  writeFileSync(join(dir, "batch-credentials.json"), JSON.stringify(creds));
  process.env.PROJECT_FOLDER = dir;
  return dir;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

async function getRunAction() {
  const mod = await import("../../../skills/batch-cep/scripts/cep/audiences.mjs");
  return mod.runAction;
}

// ---------------------------------------------------------------------------
// audiences create
// ---------------------------------------------------------------------------

describe("audiences create", () => {
  it("rejects name with space (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", ["bad name", "custom_ids"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects name >255 chars (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", ["x".repeat(300), "custom_ids"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects unknown type enum (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", ["good_name", "macos_ids"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path returns status=accepted + indexing_token + next_step", async () => {
    withCredentials();
    const fetchMock = mockFetch({ indexing_token: "tok-create" }, 202);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("create", ["vip_users", "custom_ids", "VIP users"]),
    );

    expect(out.ok).toBe(true);
    expect(out.command).toBe("audiences create");
    expect(out.result.status).toBe("accepted");
    expect(out.result.indexing_token).toBe("tok-create");
    expect(out.result.next_step).toMatch(/view/i);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/audiences/create");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer rk-test");
    expect(init.headers["X-Batch-Project"]).toBe("proj-test");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("vip_users");
    expect(body.type).toBe("custom_ids");
    expect(body.display_name).toBe("VIP users");
  });

  it("surfaces 409 duplicate-name error from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "AUDIENCE_EXISTS", error_message: "Already exists" },
      409,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", ["vip_users", "custom_ids"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(409);
    expect(out.error.error_code).toBe("AUDIENCE_EXISTS");
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;
    rmSync(dir, { recursive: true });

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", ["vip_users", "custom_ids"]));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});

// ---------------------------------------------------------------------------
// audiences update
// ---------------------------------------------------------------------------

describe("audiences update", () => {
  it("rejects name with space (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["bad name", '["u1"]']));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty ids array (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["vip", "[]"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path returns status=accepted + indexing_token", async () => {
    withCredentials();
    const fetchMock = mockFetch({ indexing_token: "tok-upd" }, 202);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["vip", '["u1","u2"]']));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("audiences update");
    expect(out.result.status).toBe("accepted");
    expect(out.result.indexing_token).toBe("tok-upd");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/audiences/update");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("vip");
    expect(body.ids).toEqual(["u1", "u2"]);
  });

  it("surfaces 404 for unknown audience", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "Audience not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["ghost", '["u1"]']));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;
    rmSync(dir, { recursive: true });

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["vip", '["u1"]']));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});

// ---------------------------------------------------------------------------
// audiences replace
// ---------------------------------------------------------------------------

describe("audiences replace", () => {
  it("rejects name with space (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("replace", ["x x", '["u1"]']));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty ids array (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("replace", ["vip", "[]"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path posts to /audiences/replace and returns indexing_token (full overwrite)", async () => {
    withCredentials();
    const fetchMock = mockFetch({ indexing_token: "tok-rep" }, 202);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("replace", ["vip", '["u1","u2"]']));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("audiences replace");
    expect(out.result.status).toBe("accepted");
    expect(out.result.indexing_token).toBe("tok-rep");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/audiences/replace");
  });

  it("surfaces 404 for unknown audience", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "Audience not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("replace", ["ghost", '["u1"]']));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;
    rmSync(dir, { recursive: true });

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("replace", ["vip", '["u1"]']));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});

// ---------------------------------------------------------------------------
// audiences remove
// ---------------------------------------------------------------------------

describe("audiences remove", () => {
  it("returns CONFIRM_REQUIRED when --confirm is absent", async () => {
    withCredentials();
    const runAction = await getRunAction();
    // No --confirm flag → 4th arg absent
    const out = await captureOutput(() => runAction("remove", ["vip", '["u1"]']));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
    expect(out.error.error_message).toMatch(/confirm/i);
  });

  it("rejects name with space (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["bad name", '["u1"]', "--confirm"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty ids array (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["vip", "[]", "--confirm"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path with --confirm posts to /audiences/remove and returns indexing_token", async () => {
    withCredentials();
    const fetchMock = mockFetch({ indexing_token: "tok-rm" }, 202);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["vip", '["u1","u2"]', "--confirm"]));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("audiences remove");
    expect(out.result.status).toBe("accepted");
    expect(out.result.indexing_token).toBe("tok-rm");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/audiences/remove");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("vip");
    expect(body.ids).toEqual(["u1", "u2"]);
    // confirm must NOT be sent in the body
    expect(body.confirm).toBeUndefined();
  });

  it("surfaces 404 for unknown audience", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "Audience not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["ghost", '["u1"]', "--confirm"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;
    rmSync(dir, { recursive: true });

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["vip", '["u1"]', "--confirm"]));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});

// ---------------------------------------------------------------------------
// audiences list
// ---------------------------------------------------------------------------

describe("audiences list", () => {
  it("happy path returns audiences array + next_cursor", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      audiences: [
        { name: "a1", type: "custom_ids" },
        { name: "a2", type: "emails" },
      ],
      next_cursor: "cur-2",
    });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", []));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("audiences list");
    expect(out.result.audiences).toHaveLength(2);
    expect(out.result.next_cursor).toBe("cur-2");
  });

  it("passes --limit and --cursor to Batch", async () => {
    withCredentials();
    const fetchMock = mockFetch({ audiences: [] });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    await captureOutput(() => runAction("list", ["--limit", "50", "--cursor", "abc"]));

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.limit).toBe(50);
    expect(body.cursor).toBe("abc");
  });

  it("surfaces 401 from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "AUTH", error_message: "bad key" }, 401);

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", []));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(401);
    expect(out.error.retryable).toBe(false);
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;
    rmSync(dir, { recursive: true });

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", []));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});

// ---------------------------------------------------------------------------
// audiences view
// ---------------------------------------------------------------------------

describe("audiences view", () => {
  it("looks up by audience name — sends {name}", async () => {
    withCredentials();
    const fetchMock = mockFetch({ name: "vip_users", type: "custom_ids", size: 100 });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["vip_users"]));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("audiences view");
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({ name: "vip_users" });
  });

  it("looks up by indexing_token — sends {indexing_token}", async () => {
    withCredentials();
    // A token is a long hex-like string (>64 chars)
    const token = "a1b2c3d4e5f6".repeat(8); // 96 chars
    const fetchMock = mockFetch({ indexing_status: "ready", size: 12345 });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", [token]));

    expect(out.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({ indexing_token: token });
  });

  it("surfaces 404 when token unknown", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "token not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["tok-bad"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });

  it("returns VALIDATION_ERROR for empty arg", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", []));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;
    rmSync(dir, { recursive: true });

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["vip_users"]));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});
