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
  const dir = mkdtempSync(join(tmpdir(), "batch-cep-custom-audience-test-"));
  writeFileSync(join(dir, "batch-credentials.json"), JSON.stringify(creds));
  process.env.PROJECT_FOLDER = dir;
  return dir;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

async function getRunAction() {
  const mod = await import("../../../skills/batch-cep/scripts/mep/custom-audience.mjs");
  return mod.runAction;
}

// ---------------------------------------------------------------------------
// create (6 tests)
// ---------------------------------------------------------------------------

describe("custom-audience create", () => {
  it("rejects name with invalid chars (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", ["my audience!"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/name/i);
  });

  it("rejects name longer than 255 chars (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const longName = "a".repeat(256);
    const out = await captureOutput(() => runAction("create", [longName]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path: create with install_ids", async () => {
    withCredentials();
    const fetchMock = mockFetch({ id: "aud_123", name: "vip_users" }, 201);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("create", ["vip_users", "--install-ids", JSON.stringify(["id1", "id2", "id3"])]),
    );

    expect(out.ok).toBe(true);
    expect(out.result.raw).toEqual({ id: "aud_123", name: "vip_users" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/custom-audiences/create");
    expect(url).toContain("app-ios-test");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Authorization"]).toBe("rk-test");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("vip_users");
    expect(body.install_ids).toEqual(["id1", "id2", "id3"]);
    expect(body.app_key).toBeUndefined();
  });

  it("happy path: create without install_ids (empty audience)", async () => {
    withCredentials();
    const fetchMock = mockFetch({ id: "aud_456", name: "empty_group" }, 201);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("create", ["empty_group", "--display-name", "Empty Group"]),
    );

    expect(out.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.name).toBe("empty_group");
    expect(body.display_name).toBe("Empty Group");
    expect(body.install_ids).toBeUndefined();
  });

  it("surfaces 409 duplicate from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "ALREADY_EXISTS", error_message: "Audience already exists" },
      409,
    );
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", ["duplicate_aud"]));
    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(409);
    expect(out.error.error_code).toBe("ALREADY_EXISTS");
  });

  it("rejects unknown app_key alias (VALIDATION_ERROR)", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("create", ["my_aud", "--app-key", "nonexistent"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/nonexistent/i);
  });
});

// ---------------------------------------------------------------------------
// update (5 tests)
// ---------------------------------------------------------------------------

describe("custom-audience update", () => {
  it("rejects name with invalid chars (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["bad name!", JSON.stringify(["id1"])]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty install_ids array (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["my_aud", JSON.stringify([])]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/install_ids/i);
  });

  it("happy path: PATCHes with name and install_ids", async () => {
    withCredentials();
    const fetchMock = mockFetch({ updated: true }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["my_aud", JSON.stringify(["id1", "id2"])]),
    );

    expect(out.ok).toBe(true);
    expect(out.result.raw).toEqual({ updated: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/custom-audiences/update");
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("my_aud");
    expect(body.install_ids).toEqual(["id1", "id2"]);
    expect(body.app_key).toBeUndefined();
  });

  it("surfaces 404 unknown audience from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "Audience not found" },
      404,
    );
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["no_such_aud", JSON.stringify(["id1"])]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });

  it("rejects unknown app_key alias (VALIDATION_ERROR)", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["my_aud", JSON.stringify(["id1"]), "--app-key", "bad_alias"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// replace (5 tests)
// ---------------------------------------------------------------------------

describe("custom-audience replace", () => {
  it("rejects missing --confirm flag (CONFIRM_REQUIRED)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("replace", ["my_aud", JSON.stringify(["id1"])]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
    expect(out.error.error_message).toMatch(/--confirm/i);
  });

  it("rejects name with invalid chars (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("replace", ["bad name!", JSON.stringify(["id1"]), "--confirm"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty install_ids array (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("replace", ["my_aud", JSON.stringify([]), "--confirm"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path: PUTs with --confirm, strips confirm from body, uses default app_key", async () => {
    withCredentials();
    const fetchMock = mockFetch({ replaced: true }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("replace", ["my_aud", JSON.stringify(["id1", "id2"]), "--confirm"]),
    );

    expect(out.ok).toBe(true);
    expect(out.result.raw).toEqual({ replaced: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/custom-audiences/replace");
    expect(url).toContain("app-ios-test"); // default app key
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("my_aud");
    expect(body.install_ids).toEqual(["id1", "id2"]);
    expect(body.confirm).toBeUndefined();
    expect(body.app_key).toBeUndefined();
  });

  it("surfaces 404 unknown audience from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "Audience not found" },
      404,
    );
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("replace", ["no_such_aud", JSON.stringify(["id1"]), "--confirm"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });

  it("rejects unknown app_key alias (VALIDATION_ERROR)", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("replace", [
        "my_aud",
        JSON.stringify(["id1"]),
        "--confirm",
        "--app-key",
        "bad_alias",
      ]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/bad_alias/i);
  });
});

// ---------------------------------------------------------------------------
// remove (6 tests)
// ---------------------------------------------------------------------------

describe("custom-audience remove", () => {
  it("rejects missing --confirm flag (CONFIRM_REQUIRED)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["my_aud"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
  });

  it("rejects when no --confirm flag at all — double-check gate", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["my_aud", "--dry-run"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
  });

  it("rejects name with invalid chars (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["bad name!", "--confirm"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path: DELETEs with --confirm, sends {name} in body", async () => {
    withCredentials();
    const fetchMock = mockFetch(null, 204);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["my_aud", "--confirm"]));

    expect(out.ok).toBe(true);
    expect(out.result.status).toBe("deleted");
    expect(out.result.name).toBe("my_aud");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/custom-audiences/remove");
    expect(init.method).toBe("DELETE");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("my_aud");
    expect(body.confirm).toBeUndefined();
    expect(body.app_key).toBeUndefined();
  });

  it("surfaces 404 unknown audience from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "Audience not found" },
      404,
    );
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["no_such_aud", "--confirm"]));
    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });

  it("rejects unknown app_key alias (VALIDATION_ERROR)", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("remove", ["my_aud", "--confirm", "--app-key", "nonexistent"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/nonexistent/i);
  });
});

// ---------------------------------------------------------------------------
// list (4 tests)
// ---------------------------------------------------------------------------

describe("custom-audience list", () => {
  it("happy path: GETs /custom-audiences/list with no params", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      audiences: [{ name: "aud1", size: 100 }],
    });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", []));

    expect(out.ok).toBe(true);
    expect(out.result.audiences).toEqual([{ name: "aud1", size: 100 }]);
    expect(out.result.next_cursor).toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/custom-audiences/list");
    expect(init.method).toBe("GET");
  });

  it("happy path: pagination with --limit and --cursor", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      audiences: [],
      next_cursor: "cursor_next",
    });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("list", ["--limit", "10", "--cursor", "cursor_abc"]),
    );

    expect(out.ok).toBe(true);
    expect(out.result.next_cursor).toBe("cursor_next");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("limit=10");
    expect(url).toContain("cursor=cursor_abc");
  });

  it("returns empty array when no audiences", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({});

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", []));

    expect(out.ok).toBe(true);
    expect(out.result.audiences).toEqual([]);
  });

  it("rejects unknown app_key alias (VALIDATION_ERROR)", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", ["--app-key", "nonexistent"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// view (4 tests)
// ---------------------------------------------------------------------------

describe("custom-audience view", () => {
  it("rejects missing name argument (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", []));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/name/i);
  });

  it("happy path: GETs /custom-audiences/view?name=... using URLSearchParams", async () => {
    withCredentials();
    const fetchMock = mockFetch({ name: "vip_users", size: 42 });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["vip_users"]));

    expect(out.ok).toBe(true);
    expect(out.result.raw).toEqual({ name: "vip_users", size: 42 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/custom-audiences/view");
    expect(url).toContain("name=vip_users");
    expect(init.method).toBe("GET");
  });

  it("surfaces 404 unknown audience from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "Audience not found" },
      404,
    );
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["no_such_aud"]));
    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });

  it("rejects unknown app_key alias (VALIDATION_ERROR)", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("view", ["my_aud", "--app-key", "nonexistent"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });
});
