import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientError, cepFetch, mepFetch } from "../../skills/batch-cep/lib/client.mjs";
import { mockFetch } from "../helpers.mjs";

const FAKE_CREDS = {
  rest_key: "rk-test",
  project_key: "proj-test",
  app_keys: {
    ios_live: "app-ios-test",
  },
  api_base_url: "https://api.batch.com",
};

describe("cepFetch", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("builds CEP URL with Bearer auth", async () => {
    const mockFn = mockFetch({ status: "ok" }, 200);
    globalThis.fetch = mockFn;

    await cepFetch(FAKE_CREDS, "POST", "2.11/profiles/list", { custom_ids: ["u_1"] });

    expect(mockFn).toHaveBeenCalledWith(
      "https://api.batch.com/2.11/profiles/list",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer rk-test",
          "X-Batch-Project": "proj-test",
        }),
      }),
    );
  });

  it("returns status 200 with data", async () => {
    globalThis.fetch = mockFetch({ profiles: [{ custom_id: "u_1" }] }, 200);

    const result = await cepFetch(FAKE_CREDS, "POST", "2.11/profiles/list", {});

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ profiles: [{ custom_id: "u_1" }] });
  });

  it("returns status 202 with indexing_token intact", async () => {
    globalThis.fetch = mockFetch({ status: "accepted", indexing_token: "idx_123" }, 202);

    const result = await cepFetch(FAKE_CREDS, "POST", "2.11/profiles/update", {});

    expect(result.status).toBe(202);
    expect(result.data.indexing_token).toBe("idx_123");
  });

  it("throws ClientError on 401", async () => {
    globalThis.fetch = mockFetch({ error_code: "AUTH_ERROR" }, 401);

    try {
      await cepFetch(FAKE_CREDS, "GET", "2.11/profiles/list", undefined);
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ClientError);
      expect(err.httpStatus).toBe(401);
      expect(err.retryable).toBe(false);
      expect(err.platform).toBe("cep");
    }
  });

  it("throws ClientError on 429 with retryable=true", async () => {
    globalThis.fetch = mockFetch({}, 429);

    try {
      await cepFetch(FAKE_CREDS, "POST", "2.11/profiles/update", {});
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ClientError);
      expect(err.httpStatus).toBe(429);
      expect(err.retryable).toBe(true);
    }
  });

  it("throws ClientError on 500 with retryable=true", async () => {
    globalThis.fetch = mockFetch({}, 500);

    try {
      await cepFetch(FAKE_CREDS, "GET", "2.11/profiles/list", undefined);
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ClientError);
      expect(err.httpStatus).toBe(500);
      expect(err.retryable).toBe(true);
    }
  });

  it("throws ClientError on timeout", async () => {
    globalThis.fetch = vi.fn(async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    });

    try {
      await cepFetch(FAKE_CREDS, "GET", "2.11/profiles/list", undefined, 100);
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ClientError);
      expect(err.httpStatus).toBe(504);
    }
  });
});

describe("mepFetch", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("builds MEP URL with X-Authorization header", async () => {
    const mockFn = mockFetch({ status: "ok" }, 200);
    globalThis.fetch = mockFn;

    await mepFetch(FAKE_CREDS, "POST", "1.0/send", { custom_ids: ["u_1"] });

    expect(mockFn).toHaveBeenCalledWith(
      expect.stringContaining("https://api.batch.com/1.0"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Authorization": "rk-test",
        }),
      }),
    );
  });

  it("returns status 200 with data", async () => {
    globalThis.fetch = mockFetch({ sent: 100 }, 200);

    const result = await mepFetch(FAKE_CREDS, "POST", "1.0/send", {});

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ sent: 100 });
  });

  it("throws ClientError on 401", async () => {
    globalThis.fetch = mockFetch({ error: "Unauthorized" }, 401);

    try {
      await mepFetch(FAKE_CREDS, "GET", "1.0/profiles", undefined);
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ClientError);
      expect(err.httpStatus).toBe(401);
      expect(err.platform).toBe("mep");
    }
  });
});

describe("ClientError", () => {
  it("has httpStatus, errorCode, retryable fields", () => {
    const err = new ClientError({
      httpStatus: 429,
      errorCode: "RATE_LIMIT",
      errorMessage: "Rate limited",
      endpoint: "2.11/profiles/update",
      platform: "cep",
      retryable: true,
    });

    expect(err.httpStatus).toBe(429);
    expect(err.errorCode).toBe("RATE_LIMIT");
    expect(err.retryable).toBe(true);
    expect(err.platform).toBe("cep");
  });

  it("toErrorPayload() returns serializable object", () => {
    const err = new ClientError({
      httpStatus: 401,
      errorCode: "AUTH_ERROR",
      errorMessage: "Auth failed",
      endpoint: "2.11/profiles/list",
      platform: "cep",
      retryable: false,
    });

    const payload = err.toErrorPayload();

    expect(payload).toEqual({
      ok: false,
      http_status: 401,
      error_code: "AUTH_ERROR",
      error_message: "Auth failed",
      platform: "cep",
      endpoint: "2.11/profiles/list",
      retryable: false,
      hint: expect.any(String),
    });
  });
});
