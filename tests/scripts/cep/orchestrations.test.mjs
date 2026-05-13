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
  const dir = mkdtempSync(join(tmpdir(), "batch-cep-test-"));
  writeFileSync(join(dir, "batch-credentials.json"), JSON.stringify(creds));
  process.env.PROJECT_FOLDER = dir;
  return dir;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

async function getDispatch() {
  const mod = await import("../../../skills/batch-cep/scripts/cep/orchestrations.mjs");
  return mod.runAction;
}

describe("orchestrations list", () => {
  it("calls /orchestrations/list with Bearer + project header, returns orchestrations", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      orchestrations: [{ token: "orch_123", name: "Campaign A", kind: "campaign" }],
    });
    globalThis.fetch = fetchMock;

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("list", []);
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/orchestrations/list");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer rk-test");
    expect(init.headers["X-Batch-Project"]).toBe("proj-test");
    expect(out.ok).toBe(true);
    expect(out.result.orchestrations).toHaveLength(1);
    expect(out.result.orchestrations[0].token).toBe("orch_123");
  });

  it("supports limit and cursor pagination params", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      orchestrations: [{ token: "orch_456", kind: "automation" }],
      next_cursor: "cursor_789",
    });
    globalThis.fetch = fetchMock;

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("list", ["--limit", "10", "--cursor", "cursor_123"]);
    });

    const [, init] = fetchMock.mock.calls[0];
    const bodyObj = JSON.parse(init.body);
    expect(bodyObj.limit).toBe(10);
    expect(bodyObj.cursor).toBe("cursor_123");
    expect(out.ok).toBe(true);
    expect(out.result.next_cursor).toBe("cursor_789");
  });

  it("supports kind filter (campaign|automation)", async () => {
    withCredentials();
    const fetchMock = mockFetch({ orchestrations: [] });
    globalThis.fetch = fetchMock;

    const runAction = await getDispatch();
    await captureOutput(async () => {
      await runAction("list", ["--kind", "campaign"]);
    });

    const [, init] = fetchMock.mock.calls[0];
    const bodyObj = JSON.parse(init.body);
    expect(bodyObj.filter?.kind).toBe("campaign");
  });

  it("returns empty array when API returns no orchestrations field", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({});

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("list", []);
    });

    expect(out.ok).toBe(true);
    expect(Array.isArray(out.result.orchestrations)).toBe(true);
    expect(out.result.orchestrations).toHaveLength(0);
  });

  it("surfaces 401 from Batch as AUTH_ERROR", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "AUTH_ERROR", error_message: "bad key" }, 401);

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("list", []);
    });

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(401);
    expect(out.error.retryable).toBe(false);
  });
});

describe("orchestrations view", () => {
  it("requires orchestration_token", async () => {
    withCredentials();

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("view", []);
    });

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("calls /orchestrations/view with token, returns orchestration", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      token: "orch_123",
      name: "Campaign A",
      kind: "campaign",
    });
    globalThis.fetch = fetchMock;

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("view", ["orch_123"]);
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/orchestrations/view");
    expect(init.method).toBe("POST");
    const bodyObj = JSON.parse(init.body);
    expect(bodyObj.orchestration_token).toBe("orch_123");
    expect(out.ok).toBe(true);
    expect(out.result.orchestration.token).toBe("orch_123");
  });

  it("surfaces 404 from Batch as NOT_FOUND", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "orchestration not found" },
      404,
    );

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("view", ["orch_notfound"]);
    });

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });
});

describe("orchestrations stats", () => {
  it("requires orchestration_token", async () => {
    withCredentials();

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("stats", []);
    });

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("calls /orchestrations/stats with token, returns stats", async () => {
    withCredentials();
    const fetchMock = mockFetch({
      sends: 1000,
      deliveries: 950,
      opens: 450,
      clicks: 100,
    });
    globalThis.fetch = fetchMock;

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("stats", ["orch_123"]);
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/orchestrations/stats");
    expect(init.method).toBe("POST");
    const bodyObj = JSON.parse(init.body);
    expect(bodyObj.orchestration_token).toBe("orch_123");
    expect(out.ok).toBe(true);
    expect(out.result.stats.sends).toBe(1000);
  });

  it("surfaces 401 from Batch as AUTH_ERROR", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "AUTH_ERROR", error_message: "bad key" }, 401);

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("stats", ["orch_123"]);
    });

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(401);
    expect(out.error.retryable).toBe(false);
  });
});

describe("orchestrations command routing", () => {
  it("returns UNKNOWN_ACTION for unrecognised action", async () => {
    withCredentials();

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("bogus", []);
    });

    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("UNKNOWN_ACTION");
  });

  it("returns CONFIG_MISSING when credentials file doesn't exist", async () => {
    const dir = mkdtempSync(join(tmpdir(), "batch-cep-nocreds-"));
    process.env.PROJECT_FOLDER = dir;

    const runAction = await getDispatch();
    const out = await captureOutput(async () => {
      await runAction("list", []);
    });

    rmSync(dir, { recursive: true });
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_MISSING");
  });
});
