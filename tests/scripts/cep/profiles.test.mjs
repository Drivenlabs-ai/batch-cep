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
  const mod = await import("../../../skills/batch-cep/scripts/cep/profiles.mjs");
  return mod.runAction;
}

// Build a minimal valid edit with custom_id
function edit(customId, extra = {}) {
  return { identifiers: { custom_id: customId }, ...extra };
}

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("profiles update", () => {
  it("rejects empty edits array (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", [JSON.stringify([])]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/at least one/i);
  });

  it("rejects >200 edits (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const edits = Array.from({ length: 201 }, (_, i) => edit(`u_${i}`));
    const out = await captureOutput(() => runAction("update", [JSON.stringify(edits)]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/200/);
  });

  it("rejects edit missing both custom_id and installation (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const edits = [{ identifiers: {} }];
    const out = await captureOutput(() => runAction("update", [JSON.stringify(edits)]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects edit with both custom_id and installation (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const edits = [
      {
        identifiers: {
          custom_id: "u_1",
          installation: { apikey: "k", installation_id: "i" },
        },
      },
    ];
    const out = await captureOutput(() => runAction("update", [JSON.stringify(edits)]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects event with uppercase name (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const edits = [{ identifiers: { custom_id: "u_1" }, events: [{ name: "BadEvent" }] }];
    const out = await captureOutput(() => runAction("update", [JSON.stringify(edits)]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/event/i);
  });

  it("happy path: POSTs to /2.11/profiles/update with Bearer + project, returns count", async () => {
    withCredentials();
    // Use 200 with empty body — the client only checks response.ok (200-299)
    const fetchMock = mockFetch({}, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const edits = [
      edit("u_1", {
        attributes: { $email_address: "a@b.com", firstname: "Jane" },
        events: [{ name: "validated_purchase", attributes: { amount: 9.99 } }],
      }),
      edit("u_2", { attributes: { firstname: "Bob" } }),
    ];
    const out = await captureOutput(() => runAction("update", [JSON.stringify(edits)]));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/profiles/update");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer rk-test");
    expect(init.headers["X-Batch-Project"]).toBe("proj-test");
    expect(JSON.parse(init.body)).toHaveLength(2);

    expect(out.ok).toBe(true);
    expect(out.result.status).toBe("applied");
    expect(out.result.count).toBe(2);
  });

  it("surfaces 429 as retryable=true with rate-limit hint", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "RATE_LIMIT", error_message: "Slow down" }, 429);

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", [JSON.stringify([edit("u_1")])]));

    expect(out.ok).toBe(false);
    expect(out.error.retryable).toBe(true);
    expect(out.error.hint).toMatch(/rate/i);
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", [JSON.stringify([edit("u_1")])]));

    rmSync(dir, { recursive: true });
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});

// ---------------------------------------------------------------------------
// mass-update
// ---------------------------------------------------------------------------

describe("profiles mass-update", () => {
  it("rejects >10000 edits (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const edits = Array.from({ length: 10_001 }, (_, i) => edit(`u_${i}`));
    const out = await captureOutput(() => runAction("mass-update", [JSON.stringify(edits)]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/10000/);
  });

  it("happy path: POSTs to /2.11/profiles/mass-update, returns count=500", async () => {
    withCredentials();
    const fetchMock = mockFetch({}, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const edits = Array.from({ length: 500 }, (_, i) =>
      edit(`u_${i}`, { attributes: { batch_index: i } }),
    );
    const out = await captureOutput(() => runAction("mass-update", [JSON.stringify(edits)]));

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/profiles/mass-update");
    expect(out.ok).toBe(true);
    expect(out.result.count).toBe(500);
  });

  it("surfaces 429 as retryable", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "RL", error_message: "" }, 429);

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("mass-update", [JSON.stringify([edit("u_1")])]),
    );

    expect(out.ok).toBe(false);
    expect(out.error.retryable).toBe(true);
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("mass-update", [JSON.stringify([edit("u_1")])]),
    );

    rmSync(dir, { recursive: true });
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

describe("profiles export", () => {
  it("rejects empty types (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("export", [""]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/type/i);
  });

  it("rejects unknown type value (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("export", ["wat"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path: returns export_id + next_step mentioning cep_exports_view", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ export_id: "exp_abc" }, 202);

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("export", ["attributes,events"]));

    expect(out.ok).toBe(true);
    expect(out.result.status).toBe("requested");
    expect(out.result.export_id).toBe("exp_abc");
    expect(out.result.next_step).toMatch(/cep_exports_view|exports/i);
  });

  it("surfaces 401 as non-retryable with http_status=401", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "AUTH", error_message: "bad key" }, 401);

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("export", ["attributes"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(401);
    expect(out.error.retryable).toBe(false);
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("export", ["attributes"]));

    rmSync(dir, { recursive: true });
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});
