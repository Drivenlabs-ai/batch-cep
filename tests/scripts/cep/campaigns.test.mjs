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
  const dir = mkdtempSync(join(tmpdir(), "batch-cep-campaigns-test-"));
  writeFileSync(join(dir, "batch-credentials.json"), JSON.stringify(creds));
  process.env.PROJECT_FOLDER = dir;
  return dir;
}

function withInvalidCredentials(overrides = {}) {
  const creds = { ...fakeCredentials(), ...overrides };
  const dir = mkdtempSync(join(tmpdir(), "batch-cep-campaigns-invalid-"));
  writeFileSync(join(dir, "batch-credentials.json"), JSON.stringify(creds));
  process.env.PROJECT_FOLDER = dir;
  return dir;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

async function getRunAction() {
  const mod = await import("../../../skills/batch-cep/scripts/cep/campaigns.mjs");
  return mod.runAction;
}

// ---------------------------------------------------------------------------
// campaigns create
// ---------------------------------------------------------------------------

describe("campaigns create", () => {
  it("rejects missing name (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("create", [JSON.stringify({ targeting: {}, channels: { push: { title: "Hi" } } })]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("rejects empty channels object (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("create", [JSON.stringify({ name: "My Campaign", targeting: {}, channels: {} })]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/channel/i);
  });

  it("allows unknown top-level fields (passthrough)", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaign_token: "c1", name: "Welcome" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const data = {
      name: "Welcome",
      targeting: { audiences: ["vip"] },
      channels: { push: { title: "Hi", body: "..." } },
      schedule: { kind: "immediate" },
      capping: { per_user: 1 },
    };
    const out = await captureOutput(() => runAction("create", [JSON.stringify(data)]));

    expect(out.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.schedule).toEqual({ kind: "immediate" });
    expect(body.capping).toEqual({ per_user: 1 });
  });

  it("happy path push-only — correct URL, headers, body, output shape", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaign_token: "c1", name: "Welcome" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const data = {
      name: "Welcome",
      targeting: { audiences: ["vip"] },
      channels: { push: { title: "Hi", body: "..." } },
    };
    const out = await captureOutput(() => runAction("create", [JSON.stringify(data)]));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("campaigns create");
    expect(out.platform).toBe("cep");
    expect(out.result).toBeDefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/campaigns/create");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer rk-test");
    expect(init.headers["X-Batch-Project"]).toBe("proj-test");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("Welcome");
    expect(body.targeting).toEqual({ audiences: ["vip"] });
    expect(body.channels).toHaveProperty("push");
  });

  it("happy path multi-channel — all channels forwarded", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaign_token: "c2", name: "MultiCh" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const data = {
      name: "MultiCh",
      targeting: { audiences: ["vip"] },
      channels: {
        push: { title: "P" },
        email: { subject: "S" },
        sms: { content: "T" },
      },
    };
    const out = await captureOutput(() => runAction("create", [JSON.stringify(data)]));

    expect(out.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.channels).toHaveProperty("push");
    expect(body.channels).toHaveProperty("email");
    expect(body.channels).toHaveProperty("sms");
  });

  it("surfaces 400 semantic error from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch({ error_code: "INVALID", error_message: "Bad targeting" }, 400);

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("create", [
        JSON.stringify({ name: "Welcome", targeting: {}, channels: { push: {} } }),
      ]),
    );

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(400);
    expect(out.error.error_code).toBe("INVALID");
  });
});

// ---------------------------------------------------------------------------
// campaigns update
// ---------------------------------------------------------------------------

describe("campaigns update", () => {
  it("rejects missing campaign_token (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", [undefined, JSON.stringify({ name: "new name" })]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
  });

  it("happy path — correct URL and body", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaign_token: "c1", name: "Welcome v2" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["c1", JSON.stringify({ name: "Welcome v2" })]),
    );

    expect(out.ok).toBe(true);
    expect(out.command).toBe("campaigns update");
    expect(out.platform).toBe("cep");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/campaigns/update");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.campaign_token).toBe("c1");
    expect(body.name).toBe("Welcome v2");
  });

  it("surfaces 404 unknown token from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "Campaign not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["ghost", JSON.stringify({ name: "x" })]),
    );

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });

  it("returns CONFIG_INVALID when project_key missing from credentials", async () => {
    withInvalidCredentials({ project_key: "" });
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["c1", JSON.stringify({ name: "x" })]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_INVALID");
  });
});

// ---------------------------------------------------------------------------
// campaigns delete
// ---------------------------------------------------------------------------

describe("campaigns delete", () => {
  it("returns CONFIRM_REQUIRED when --confirm flag is absent", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["c1"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
    expect(out.error.error_message).toMatch(/confirm/i);
  });

  it("returns CONFIRM_REQUIRED when args do not include --confirm", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["c1", "--dry-run"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
  });

  it("happy path with --confirm — correct URL, body, output shape", async () => {
    withCredentials();
    const fetchMock = mockFetch({ status: "deleted", campaign_token: "c1" });
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["c1", "--confirm"]));

    expect(out.ok).toBe(true);
    expect(out.command).toBe("campaigns delete");
    expect(out.platform).toBe("cep");
    expect(out.result.status).toBe("deleted");
    expect(out.result.campaign_token).toBe("c1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/2.11/campaigns/delete");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.campaign_token).toBe("c1");
    // confirm must NOT be sent in the body
    expect(body.confirm).toBeUndefined();
  });

  it("surfaces 404 unknown token from Batch", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "Campaign not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["ghost", "--confirm"]));

    expect(out.ok).toBe(false);
    expect(out.error.http_status).toBe(404);
  });

  it("returns CONFIG_INVALID when project_key missing from credentials", async () => {
    withInvalidCredentials({ project_key: "" });
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["c1", "--confirm"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIG_INVALID");
  });
});
