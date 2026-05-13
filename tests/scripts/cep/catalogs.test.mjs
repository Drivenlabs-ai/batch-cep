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
  const dir = mkdtempSync(join(tmpdir(), "batch-cep-catalogs-test-"));
  writeFileSync(join(dir, "batch-credentials.json"), JSON.stringify(creds));
  process.env.PROJECT_FOLDER = dir;
  return dir;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

async function getRunAction() {
  const mod = await import("../../../skills/batch-cep/scripts/cep/catalogs.mjs");
  return mod.runAction;
}

// ---------------------------------------------------------------------------
// catalogs create (5 tests)
// ---------------------------------------------------------------------------

describe("catalogs create", () => {
  it("rejects name with uppercase (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", ["MyCatalog", '{"price":"number"}']));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects name longer than 64 chars (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("create", ["a".repeat(65), '{"price":"number"}']),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects missing schema argument (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", ["products"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path — returns catalog in result", async () => {
    withCredentials();
    const fetchMock = mockFetch({ status: "created", name: "products" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("create", ["products", '{"price":"number","title":"string"}', "Products"]),
    );

    expect(out.ok).toBe(true);
    expect(out.command).toBe("catalogs create");
    expect(out.result.catalog).toBeDefined();
    expect(out.result.catalog.name).toBe("products");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/catalogs/create");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer rk-test");
    expect(init.headers["X-Batch-Project"]).toBe("proj-test");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("products");
    expect(body.schema).toEqual({ price: "number", title: "string" });
    expect(body.display_name).toBe("Products");
  });

  it("surfaces 409 duplicate from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "EXISTS", error_message: "Already exists" }, 409);

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", ["products", '{"price":"number"}']));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(409);
    expect(out.error.error_code).toBe("EXISTS");
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;
    rmSync(dir, { recursive: true });

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("create", ["products", '{"price":"number"}']));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});

// ---------------------------------------------------------------------------
// catalogs update (4 tests)
// ---------------------------------------------------------------------------

describe("catalogs update", () => {
  it("rejects missing both display_name and schema (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["products"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path with --display-name only", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ status: "updated", name: "products" });

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["products", "--display-name", "Products v2"]),
    );

    expect(out.ok).toBe(true);
    expect(out.command).toBe("catalogs update");
    expect(out.result).toBeDefined();
  });

  it("surfaces 404 for unknown catalog", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "Catalog not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["ghost", "--display-name", "x"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;
    rmSync(dir, { recursive: true });

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["products", "--display-name", "y"]));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});

// ---------------------------------------------------------------------------
// catalogs remove (4 tests)
// ---------------------------------------------------------------------------

describe("catalogs remove", () => {
  it("returns CONFIRM_REQUIRED when --confirm is absent", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["products"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
    expect(out.error.error_message).toMatch(/confirm/i);
  });

  it("rejects bad catalog name (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["Bad-Name", "--confirm"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path with --confirm posts to /catalogs/remove", async () => {
    withCredentials();
    const fetchMock = mockFetch({ status: "removed", name: "products" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["products", "--confirm"]));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("catalogs remove");
    expect(out.result).toBeDefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/catalogs/remove");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("products");
    // confirm must NOT be sent to Batch
    expect(body.confirm).toBeUndefined();
  });

  it("surfaces 404 for unknown catalog", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "NOT_FOUND", error_message: "Not found" }, 404);

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("remove", ["ghost", "--confirm"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// catalogs view (3 tests)
// ---------------------------------------------------------------------------

describe("catalogs view", () => {
  it("happy path — returns catalog in result", async () => {
    withCredentials();
    const fetchMock = mockFetch({ name: "products", schema: { price: "number" } });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["products"]));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("catalogs view");
    expect(out.result.catalog.name).toBe("products");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/catalogs/view");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body).toEqual({ name: "products" });
  });

  it("rejects bad catalog name (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["Bad-Name"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("surfaces 404 from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "NOT_FOUND", error_message: "" }, 404);

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["ghost"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// catalogs list (3 tests)
// ---------------------------------------------------------------------------

describe("catalogs list", () => {
  it("happy path returns catalogs array + next_cursor", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      catalogs: [{ name: "products" }, { name: "stores" }],
      next_cursor: "c-2",
    });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", []));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("catalogs list");
    expect(out.result.catalogs).toHaveLength(2);
    expect(out.result.next_cursor).toBe("c-2");
  });

  it("passes --limit and --cursor to Batch", async () => {
    withCredentials();
    const fetchMock = mockFetch({ catalogs: [] });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    await captureOutput(() => runAction("list", ["--limit", "25", "--cursor", "abc"]));

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.limit).toBe(25);
    expect(body.cursor).toBe("abc");
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
// catalogs edit-items (6 tests)
// ---------------------------------------------------------------------------

describe("catalogs edit-items", () => {
  it("rejects missing operations argument (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("edit-items", ["products"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty operations array (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("edit-items", ["products", "[]"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects upsert op without item field (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("edit-items", ["products", '[{"op":"upsert"}]']),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects delete op without id field (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("edit-items", ["products", '[{"op":"delete"}]']),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path mixed upsert + delete", async () => {
    withCredentials();
    const fetchMock = mockFetch({ upserts: 2, deletes: 1 });
    globalThis.fetch = fetchMock;

    const operations = [
      { op: "upsert", item: { id: "p1", price: 9.99 } },
      { op: "upsert", item: { id: "p2", price: 19.99 } },
      { op: "delete", id: "p3" },
    ];

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("edit-items", ["products", JSON.stringify(operations)]),
    );

    expect(out.ok).toBe(true);
    expect(out.command).toBe("catalogs edit-items");
    expect(out.result.upserts).toBe(2);
    expect(out.result.deletes).toBe(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/catalogs/edit-items");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("products");
    expect(body.operations).toHaveLength(3);
  });

  it("surfaces 429 as retryable error", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "RL", error_message: "Rate limit exceeded" }, 429);

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("edit-items", ["products", '[{"op":"upsert","item":{"id":"p1"}}]']),
    );

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(429);
    expect(out.error.retryable).toBe(true);
  });
});
