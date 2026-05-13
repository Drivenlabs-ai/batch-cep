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
  const dir = mkdtempSync(join(tmpdir(), "batch-mep-inapp-test-"));
  writeFileSync(join(dir, "batch-credentials.json"), JSON.stringify(creds));
  process.env.PROJECT_FOLDER = dir;
  return dir;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

async function getRunAction() {
  const mod = await import("../../../skills/batch-cep/scripts/mep/in-app-campaigns.mjs");
  return mod.runAction;
}

// ---------------------------------------------------------------------------
// create command — 8 tests
// ---------------------------------------------------------------------------

describe("mep in-app-campaigns create", () => {
  it("1. rejects name shorter than 3 chars (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "ab",
      trigger: { when: "NOW" },
      landing: { theme: "default", contents: [{ lang: "en", title: "Hi" }] },
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/name/i);
  });

  it("2. rejects missing trigger (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "My Campaign",
      landing: { theme: "default", contents: [{ lang: "en", title: "Hi" }] },
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/trigger/i);
  });

  it("3. rejects missing landing (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "My Campaign",
      trigger: { when: "NOW" },
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/landing/i);
  });

  it("4. rejects landing.contents as empty array (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "My Campaign",
      trigger: { when: "NOW" },
      landing: { theme: "default", contents: [] },
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/contents/i);
  });

  it("5. rejects both start_date and local_start_date present (refine fail)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "My Campaign",
      trigger: { when: "NOW" },
      landing: { theme: "default", contents: [{ lang: "en", title: "Hi" }] },
      start_date: "2026-06-01",
      local_start_date: "2026-06-01",
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/mutually exclusive/i);
  });

  it("6. rejects labels with more than 3 entries (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "My Campaign",
      trigger: { when: "NOW" },
      landing: { theme: "default", contents: [{ lang: "en", title: "Hi" }] },
      labels: ["a", "b", "c", "d"],
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/labels/i);
  });

  it("7. happy path — POSTs to /1.1/<key>/in-app-campaigns/create, strips app_key from body, returns campaign_token", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaign_token: "iac_1" }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "My In-App Campaign",
      trigger: { when: "NOW" },
      landing: { theme: "default", contents: [{ lang: "en", title: "Hello" }] },
    });
    const out = await captureOutput(() => runAction("create", [data]));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/in-app-campaigns/create");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Authorization"]).toBe("rk-test");
    expect(init.headers.Authorization).toBeUndefined();

    const body = JSON.parse(init.body);
    expect(body.name).toBe("My In-App Campaign");
    expect(body.app_key).toBeUndefined();

    expect(out.ok).toBe(true);
    expect(out.result.campaign_token).toBe("iac_1");
  });

  it("8. 400 from Batch is surfaced as error", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "INVALID_REQUEST", error_message: "bad landing config" },
      400,
    );

    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "My Campaign",
      trigger: { when: "NOW" },
      landing: { theme: "default", contents: [{ lang: "en", title: "Hi" }] },
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out)).toMatch(/bad landing config/i);
  });
});

// ---------------------------------------------------------------------------
// update command — 5 tests
// ---------------------------------------------------------------------------

describe("mep in-app-campaigns update", () => {
  it("9. rejects missing campaign_token (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", []));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/campaign_token/i);
  });

  it("10. happy path — POSTs campaign_token + patch to /in-app-campaigns/update", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaign_token: "iac_1" }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["iac_1", JSON.stringify({ name: "Updated" })]),
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/in-app-campaigns/update");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.campaign_token).toBe("iac_1");
    expect(body.name).toBe("Updated");

    expect(out.ok).toBe(true);
  });

  it("11. 404 from Batch is surfaced as error", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "campaign not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["iac_missing", JSON.stringify({ name: "x" })]),
    );
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out)).toMatch(/campaign not found/i);
  });

  it("12. unresolved app_key alias fails with APPKEY_UNRESOLVED", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["iac_1", JSON.stringify({ name: "x" }), "--app-key", "android_live"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("APPKEY_UNRESOLVED");
  });

  it("13. update does NOT require confirm flag", async () => {
    withCredentials();
    const fetchMock = mockFetch({}, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["iac_1"]));
    // Should succeed without --confirm
    expect(out.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// delete command — 5 tests
// ---------------------------------------------------------------------------

describe("mep in-app-campaigns delete", () => {
  it("14. rejects missing --confirm (CONFIRM_REQUIRED)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["iac_1"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
  });

  it("15. rejects --no-confirm (treated as missing --confirm)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["iac_1", "--no-confirm"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
  });

  it("16. happy path — POSTs to /in-app-campaigns/delete with campaign_token in body when --confirm present", async () => {
    withCredentials();
    const fetchMock = mockFetch({}, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["iac_1", "--confirm"]));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/in-app-campaigns/delete");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.campaign_token).toBe("iac_1");

    expect(out.ok).toBe(true);
    expect(out.result.status).toBe("deleted");
    expect(out.result.campaign_token).toBe("iac_1");
  });

  it("17. 404 from Batch is surfaced as error", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "campaign not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["iac_missing", "--confirm"]));
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out)).toMatch(/campaign not found/i);
  });

  it("18. unresolved app_key alias fails with APPKEY_UNRESOLVED", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("delete", ["iac_1", "--confirm", "--app-key", "android_live"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("APPKEY_UNRESOLVED");
  });
});

// ---------------------------------------------------------------------------
// view command — 4 tests
// ---------------------------------------------------------------------------

describe("mep in-app-campaigns view", () => {
  it("19. rejects missing campaign_token (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", []));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/campaign_token/i);
  });

  it("20. happy path — GETs /1.1/<key>/in-app-campaigns/<token> with X-Authorization", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaign_token: "iac_1", name: "My IAC" }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["iac_1"]));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/in-app-campaigns/iac_1");
    expect(init.method).toBe("GET");
    expect(init.headers["X-Authorization"]).toBe("rk-test");

    expect(out.ok).toBe(true);
    expect(out.result).toMatchObject({ campaign_token: "iac_1", name: "My IAC" });
  });

  it("21. 404 from Batch is surfaced as error", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "campaign not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["iac_missing"]));
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out)).toMatch(/campaign not found/i);
  });

  it("22. unresolved app_key alias fails with APPKEY_UNRESOLVED", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("view", ["iac_1", "--app-key", "android_live"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("APPKEY_UNRESOLVED");
  });
});

// ---------------------------------------------------------------------------
// list command — 4 tests
// ---------------------------------------------------------------------------

describe("mep in-app-campaigns list", () => {
  it("23. happy path — GETs /1.1/<key>/in-app-campaigns/list with campaigns array", async () => {
    withCredentials();
    const fetchMock = mockFetch(
      { campaigns: [{ campaign_token: "iac_1" }, { campaign_token: "iac_2" }] },
      200,
    );
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", []));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/in-app-campaigns/list");
    expect(init.method).toBe("GET");

    expect(out.ok).toBe(true);
    expect(out.result.campaigns).toHaveLength(2);
    expect(out.result.campaigns[0].campaign_token).toBe("iac_1");
  });

  it("24. pagination — forwards limit and cursor as query params", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaigns: [], next_cursor: "cur_next" }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", ["--limit", "20", "--cursor", "xyz"]));

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("limit=20");
    expect(url).toContain("cursor=xyz");

    expect(out.ok).toBe(true);
    expect(out.result.next_cursor).toBe("cur_next");
  });

  it("25. no query params when no options provided", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaigns: [] }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    await captureOutput(() => runAction("list", []));

    const [url] = fetchMock.mock.calls[0];
    expect(url).not.toContain("?");
  });

  it("26. unresolved app_key alias fails with APPKEY_UNRESOLVED", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", ["--app-key", "android_live"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("APPKEY_UNRESOLVED");
  });
});
