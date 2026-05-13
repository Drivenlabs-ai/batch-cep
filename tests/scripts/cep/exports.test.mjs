// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAction } from "../../../skills/batch-cep/scripts/cep/exports.mjs";
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
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// exports list
// ---------------------------------------------------------------------------

describe("exports list", () => {
  it("happy path returns exports array + next_cursor", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      exports: [{ id: "exp_1", status: "ready" }],
      next_cursor: "cur-x",
    });
    globalThis.fetch = fetchMock;

    const out = await captureOutput(() => runAction("list", []));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("exports list");
    expect(out.platform).toBe("cep");
    expect(out.result.exports).toHaveLength(1);
    expect(out.result.exports[0].id).toBe("exp_1");
    expect(out.result.next_cursor).toBe("cur-x");
  });

  it("passes --limit and --cursor to Batch", async () => {
    withCredentials();
    const fetchMock = mockFetch({ exports: [] });
    globalThis.fetch = fetchMock;

    await captureOutput(() => runAction("list", ["--limit", "25", "--cursor", "abc"]));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/exports/list");
    const body = JSON.parse(init.body);
    expect(body.limit).toBe(25);
    expect(body.cursor).toBe("abc");
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;
    rmSync(dir, { recursive: true });

    const out = await captureOutput(() => runAction("list", []));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});

// ---------------------------------------------------------------------------
// exports view
// ---------------------------------------------------------------------------

describe("exports view", () => {
  it("returns VALIDATION_ERROR for missing export_id", async () => {
    withCredentials();
    const out = await captureOutput(() => runAction("view", []));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path: pending status", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({
      export_id: "exp_1",
      status: "pending",
      created_at: "2026-05-12T10:00:00Z",
    });

    const out = await captureOutput(() => runAction("view", ["exp_1"]));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("exports view");
    expect(out.result.export.status).toBe("pending");
    expect(out.result.export.export_id).toBe("exp_1");
  });

  it("happy path: ready with download_url", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({
      export_id: "exp_1",
      status: "ready",
      download_url: "https://s3.example/x.csv",
    });

    const out = await captureOutput(() => runAction("view", ["exp_1"]));

    expect(out.ok).toBe(true);
    expect(out.result.export.status).toBe("ready");
    expect(out.result.export.download_url).toBe("https://s3.example/x.csv");
  });

  it("surfaces 404 for unknown export", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "Export not found" },
      404,
    );

    const out = await captureOutput(() => runAction("view", ["ghost"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
    expect(out.error.error_code).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// exports download
// ---------------------------------------------------------------------------

describe("exports download", () => {
  it("returns VALIDATION_ERROR for missing export_id", async () => {
    withCredentials();
    const out = await captureOutput(() => runAction("download", []));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("captures signed URL from 302 Location header", async () => {
    withCredentials();
    globalThis.fetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: "https://s3.example/signed.csv?sig=abc",
            "Content-Length": "12345",
            "Content-Type": "text/csv",
          },
        }),
    );

    const out = await captureOutput(() => runAction("download", ["exp_1"]));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("exports download");
    expect(out.result.status).toBe("redirect");
    expect(out.result.download_url).toBe("https://s3.example/signed.csv?sig=abc");
    expect(out.result.content_type).toBe("text/csv");
    expect(out.result.size_bytes).toBe(12345);
    expect(out.result.hint).toBeDefined();
  });

  it("falls back to inline status on 200 direct content", async () => {
    withCredentials();
    globalThis.fetch = vi.fn(
      async () =>
        new Response("col1,col2\nv1,v2", {
          status: 200,
          headers: {
            "Content-Type": "text/csv",
            "Content-Length": "16",
          },
        }),
    );

    const out = await captureOutput(() => runAction("download", ["exp_2"]));

    expect(out.ok).toBe(true);
    expect(out.result.status).toBe("inline");
    expect(out.result.content_type).toBe("text/csv");
    expect(out.result.size_bytes).toBe(16);
    expect(out.result.hint).toMatch(/exports view/i);
  });

  it("surfaces 404 for unknown export", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "Export not found" },
      404,
    );

    const out = await captureOutput(() => runAction("download", ["ghost"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;
    rmSync(dir, { recursive: true });

    const out = await captureOutput(() => runAction("download", ["exp_x"]));

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});
