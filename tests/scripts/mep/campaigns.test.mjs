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
  const dir = mkdtempSync(join(tmpdir(), "batch-mep-campaigns-test-"));
  writeFileSync(join(dir, "batch-credentials.json"), JSON.stringify(creds));
  process.env.PROJECT_FOLDER = dir;
  return dir;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

async function getRunAction() {
  const mod = await import("../../../skills/batch-cep/scripts/mep/campaigns.mjs");
  return mod.runAction;
}

// ---------------------------------------------------------------------------
// create command — 8 tests
// ---------------------------------------------------------------------------

describe("mep campaigns create", () => {
  it("1. rejects missing name (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const data = JSON.stringify({
      state: "DRAFT",
      when: { start_time: "now" },
      messages: [{ channel_type: "push", body: "Hello" }],
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/name/i);
  });

  it("2. rejects invalid state enum (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "My Campaign",
      state: "INVALID_STATE",
      when: { start_time: "now" },
      messages: [{ channel_type: "push", body: "Hello" }],
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/state/i);
  });

  it("3. rejects missing when (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "My Campaign",
      state: "DRAFT",
      messages: [{ channel_type: "push", body: "Hello" }],
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/when/i);
  });

  it("4. rejects bad when.start_time (not RFC 3339 and not 'now')", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "My Campaign",
      state: "DRAFT",
      when: { start_time: "tomorrow" },
      messages: [{ channel_type: "push", body: "Hello" }],
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/start_time/i);
  });

  it("5. rejects empty messages array (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "My Campaign",
      state: "DRAFT",
      when: { start_time: "now" },
      messages: [],
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/messages/i);
  });

  it("6. rejects messages[0] missing channel_type (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "My Campaign",
      state: "DRAFT",
      when: { start_time: "now" },
      messages: [{ body: "Hello" }],
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/channel_type/i);
  });

  it("7. happy path — POSTs to correct URL with X-Authorization, returns campaign_token, strips app_key from body", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaign_token: "camp_abc123" }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "Summer Push",
      state: "DRAFT",
      when: { start_time: "now" },
      messages: [{ channel_type: "push", title: "Hi", body: "Summer sale!" }],
    });
    const out = await captureOutput(() => runAction("create", [data]));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/campaigns/create");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Authorization"]).toBe("rk-test");
    expect(init.headers.Authorization).toBeUndefined();

    const body = JSON.parse(init.body);
    expect(body.name).toBe("Summer Push");
    expect(body.state).toBe("DRAFT");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].channel_type).toBe("push");
    expect(body.app_key).toBeUndefined();

    expect(out.ok).toBe(true);
    expect(out.result.campaign_token).toBe("camp_abc123");
  });

  it("8. 400 from Batch is surfaced as error", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "INVALID_REQUEST", error_message: "name too long" },
      400,
    );

    const runAction = await getRunAction();
    const data = JSON.stringify({
      name: "My Campaign",
      state: "DRAFT",
      when: { start_time: "now" },
      messages: [{ channel_type: "push", body: "Hello" }],
    });
    const out = await captureOutput(() => runAction("create", [data]));
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out)).toMatch(/name too long/i);
  });
});

// ---------------------------------------------------------------------------
// update command — 5 tests
// ---------------------------------------------------------------------------

describe("mep campaigns update", () => {
  it("9. rejects missing campaign_token (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", [JSON.stringify({ name: "New Name" })]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/campaign_token/i);
  });

  it("10. accepts empty patch (no patch-json argument)", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaign_token: "camp_xyz" }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("update", ["camp_xyz"]));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.campaign_token).toBe("camp_xyz");
    expect(out.ok).toBe(true);
  });

  it("11. happy path — POSTs campaign_token + patch to /campaigns/update", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaign_token: "camp_xyz", name: "Updated Name" }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["camp_xyz", JSON.stringify({ name: "Updated Name" })]),
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/campaigns/update");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.campaign_token).toBe("camp_xyz");
    expect(body.name).toBe("Updated Name");

    expect(out.ok).toBe(true);
  });

  it("12. 404 from Batch is surfaced as error", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "campaign not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["camp_missing", JSON.stringify({ name: "x" })]),
    );
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out)).toMatch(/campaign not found/i);
  });

  it("13. unresolved app_key alias fails with APPKEY_UNRESOLVED", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("update", ["camp_xyz", JSON.stringify({ name: "x" }), "--app-key", "android_live"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("APPKEY_UNRESOLVED");
  });
});

// ---------------------------------------------------------------------------
// delete command — 5 tests
// ---------------------------------------------------------------------------

describe("mep campaigns delete", () => {
  it("14. rejects missing --confirm (CONFIRM_REQUIRED)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["camp_xyz"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
  });

  it("15. rejects explicit --confirm=false (treated as missing --confirm)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    // Passing a string "false" after --confirm is not a valid --confirm flag
    const out = await captureOutput(() => runAction("delete", ["camp_xyz", "--no-confirm"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("CONFIRM_REQUIRED");
  });

  it("16. happy path — POSTs to /campaigns/delete with campaign_token when --confirm present", async () => {
    withCredentials();
    const fetchMock = mockFetch({}, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["camp_xyz", "--confirm"]));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/campaigns/delete");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.campaign_token).toBe("camp_xyz");

    expect(out.ok).toBe(true);
    expect(out.result.status).toBe("deleted");
    expect(out.result.campaign_token).toBe("camp_xyz");
  });

  it("17. 404 from Batch is surfaced as error", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "campaign not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("delete", ["camp_missing", "--confirm"]));
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out)).toMatch(/campaign not found/i);
  });

  it("18. unresolved app_key alias fails with APPKEY_UNRESOLVED", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("delete", ["camp_xyz", "--confirm", "--app-key", "android_live"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("APPKEY_UNRESOLVED");
  });
});

// ---------------------------------------------------------------------------
// stats command — 4 tests
// ---------------------------------------------------------------------------

describe("mep campaigns stats", () => {
  it("19. rejects missing campaign_token (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("stats", []));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/campaign_token/i);
  });

  it("20. happy path — GETs /1.1/<key>/campaigns/stats/<token> with X-Authorization", async () => {
    withCredentials();
    const fetchMock = mockFetch({ sent: 1000, delivered: 950, opened: 200 }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("stats", ["camp_xyz"]));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/campaigns/stats/camp_xyz");
    expect(init.method).toBe("GET");
    expect(init.headers["X-Authorization"]).toBe("rk-test");
    expect(init.headers.Authorization).toBeUndefined();

    expect(out.ok).toBe(true);
    expect(out.result).toMatchObject({ sent: 1000, delivered: 950, opened: 200 });
  });

  it("21. encodes special chars in token for URL", async () => {
    withCredentials();
    const fetchMock = mockFetch({ sent: 0 }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    await captureOutput(() => runAction("stats", ["camp/with spaces"]));

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/campaigns/stats/camp%2Fwith%20spaces");
  });

  it("22. 404 from Batch is surfaced as error", async () => {
    withCredentials();
    globalThis.fetch = mockFetch(
      { error_code: "NOT_FOUND", error_message: "campaign not found" },
      404,
    );

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("stats", ["camp_missing"]));
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out)).toMatch(/campaign not found/i);
  });
});

// ---------------------------------------------------------------------------
// view command — 4 tests
// ---------------------------------------------------------------------------

describe("mep campaigns view", () => {
  it("23. rejects missing campaign_token (VALIDATION_ERROR)", async () => {
    withCredentials();
    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", []));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("VALIDATION_ERROR");
    expect(out.error.error_message).toMatch(/campaign_token/i);
  });

  it("24. happy path — GETs /1.1/<key>/campaigns/<token> with X-Authorization", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaign_token: "camp_xyz", name: "Summer Push" }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("view", ["camp_xyz"]));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/campaigns/camp_xyz");
    expect(init.method).toBe("GET");
    expect(init.headers["X-Authorization"]).toBe("rk-test");

    expect(out.ok).toBe(true);
    expect(out.result).toMatchObject({ campaign_token: "camp_xyz", name: "Summer Push" });
  });

  it("25. encodes special chars in token for URL", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaign_token: "camp/abc" }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    await captureOutput(() => runAction("view", ["camp/abc"]));

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/campaigns/camp%2Fabc");
  });

  it("26. unresolved app_key alias fails with APPKEY_UNRESOLVED", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("view", ["camp_xyz", "--app-key", "android_live"]),
    );
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("APPKEY_UNRESOLVED");
  });
});

// ---------------------------------------------------------------------------
// list command — 4 tests
// ---------------------------------------------------------------------------

describe("mep campaigns list", () => {
  it("27. happy path — GETs /1.1/<key>/campaigns/list with campaigns array", async () => {
    withCredentials();
    const fetchMock = mockFetch(
      { campaigns: [{ campaign_token: "c1" }, { campaign_token: "c2" }] },
      200,
    );
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", []));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.batch.com/1.1/app-ios-test/campaigns/list");
    expect(init.method).toBe("GET");

    expect(out.ok).toBe(true);
    expect(out.result.campaigns).toHaveLength(2);
    expect(out.result.campaigns[0].campaign_token).toBe("c1");
  });

  it("28. pagination — forwards limit and cursor as query params", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaigns: [], next_cursor: "cur_next" }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    const out = await captureOutput(() =>
      runAction("list", ["--limit", "10", "--cursor", "cur_abc"]),
    );

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("limit=10");
    expect(url).toContain("cursor=cur_abc");

    expect(out.ok).toBe(true);
    expect(out.result.next_cursor).toBe("cur_next");
  });

  it("29. no query params when no options provided", async () => {
    withCredentials();
    const fetchMock = mockFetch({ campaigns: [] }, 200);
    globalThis.fetch = fetchMock;

    const runAction = await getRunAction();
    await captureOutput(() => runAction("list", []));

    const [url] = fetchMock.mock.calls[0];
    expect(url).not.toContain("?");
  });

  it("30. unresolved app_key alias fails with APPKEY_UNRESOLVED", async () => {
    const creds = fakeCredentials({ app_keys: { ios_live: "app-ios-test" } });
    withCredentials(creds);

    const runAction = await getRunAction();
    const out = await captureOutput(() => runAction("list", ["--app-key", "android_live"]));
    expect(out.ok).toBe(false);
    expect(out.error.error_code).toBe("APPKEY_UNRESOLVED");
  });
});
