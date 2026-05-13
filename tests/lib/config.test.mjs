import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../skills/batch-cep/lib/config.mjs";

describe("loadConfig", () => {
  it("loads valid batch-credentials.json from current directory", () => {
    const creds = {
      rest_key: "rk-test",
      project_key: "proj-test",
      app_keys: {
        ios_live: "app-ios-test",
      },
      default_app_key: "ios_live",
    };

    const tmpDir = tmpdir();
    const credsPath = join(tmpDir, `batch-credentials-${Date.now()}.json`);

    try {
      writeFileSync(credsPath, JSON.stringify(creds), "utf-8");

      // Temporarily change working directory logic
      // (in real implementation, load from process.cwd())
      // For testing, we pass a path directly
      const result = loadConfig(credsPath);

      expect(result).toEqual(
        expect.objectContaining({
          rest_key: "rk-test",
          project_key: "proj-test",
          default_app_key: "ios_live",
        }),
      );
    } finally {
      if (existsSync(credsPath)) {
        // Clean up
        unlinkSync(credsPath);
      }
    }
  });

  it("throws error when batch-credentials.json is missing", () => {
    const tmpDir = tmpdir();
    const missingPath = join(tmpDir, `missing-${Date.now()}.json`);

    expect(() => {
      loadConfig(missingPath);
    }).toThrow();
  });

  it("throws error when JSON is invalid", () => {
    const tmpDir = tmpdir();
    const badPath = join(tmpDir, `bad-json-${Date.now()}.json`);

    try {
      writeFileSync(badPath, "{ invalid json }", "utf-8");

      expect(() => {
        loadConfig(badPath);
      }).toThrow();
    } finally {
      if (existsSync(badPath)) {
        unlinkSync(badPath);
      }
    }
  });

  it("validates required fields: rest_key, project_key, app_keys", () => {
    const tmpDir = tmpdir();
    const badCredsPath = join(tmpDir, `bad-creds-${Date.now()}.json`);

    try {
      // Missing project_key
      const incomplete = {
        rest_key: "rk-test",
        app_keys: { ios_live: "app-test" },
      };

      writeFileSync(badCredsPath, JSON.stringify(incomplete), "utf-8");

      expect(() => {
        loadConfig(badCredsPath);
      }).toThrow(/project_key|required/i);
    } finally {
      if (existsSync(badCredsPath)) {
        unlinkSync(badCredsPath);
      }
    }
  });

  it("provides default api_base_url if not specified", () => {
    const tmpDir = tmpdir();
    const credsPath = join(tmpDir, `creds-${Date.now()}.json`);

    try {
      const creds = {
        rest_key: "rk-test",
        project_key: "proj-test",
        app_keys: { ios_live: "app-test" },
      };

      writeFileSync(credsPath, JSON.stringify(creds), "utf-8");

      const result = loadConfig(credsPath);

      expect(result.api_base_url).toBe("https://api.batch.com");
    } finally {
      if (existsSync(credsPath)) {
        unlinkSync(credsPath);
      }
    }
  });

  it("provides default_app_key if not specified", () => {
    const tmpDir = tmpdir();
    const credsPath = join(tmpDir, `creds-${Date.now()}.json`);

    try {
      const creds = {
        rest_key: "rk-test",
        project_key: "proj-test",
        app_keys: {
          ios_live: "app-ios-test",
          android_live: "app-android-test",
        },
      };

      writeFileSync(credsPath, JSON.stringify(creds), "utf-8");

      const result = loadConfig(credsPath);

      expect(result.default_app_key).toBe("ios_live");
    } finally {
      if (existsSync(credsPath)) {
        unlinkSync(credsPath);
      }
    }
  });

  it("uses specified default_app_key when provided", () => {
    const tmpDir = tmpdir();
    const credsPath = join(tmpDir, `creds-${Date.now()}.json`);

    try {
      const creds = {
        rest_key: "rk-test",
        project_key: "proj-test",
        app_keys: {
          ios_live: "app-ios-test",
          android_live: "app-android-test",
        },
        default_app_key: "android_live",
      };

      writeFileSync(credsPath, JSON.stringify(creds), "utf-8");

      const result = loadConfig(credsPath);

      expect(result.default_app_key).toBe("android_live");
    } finally {
      if (existsSync(credsPath)) {
        unlinkSync(credsPath);
      }
    }
  });

  it("validates app_keys has at least one entry", () => {
    const tmpDir = tmpdir();
    const credsPath = join(tmpDir, `creds-${Date.now()}.json`);

    try {
      const creds = {
        rest_key: "rk-test",
        project_key: "proj-test",
        app_keys: {},
      };

      writeFileSync(credsPath, JSON.stringify(creds), "utf-8");

      expect(() => {
        loadConfig(credsPath);
      }).toThrow(/app_keys|empty|required/i);
    } finally {
      if (existsSync(credsPath)) {
        unlinkSync(credsPath);
      }
    }
  });

  it("throws if default_app_key is not in app_keys", () => {
    const tmpDir = tmpdir();
    const credsPath = join(tmpDir, `creds-${Date.now()}.json`);

    try {
      const creds = {
        rest_key: "rk-test",
        project_key: "proj-test",
        app_keys: { ios_live: "app-test" },
        default_app_key: "nonexistent",
      };

      writeFileSync(credsPath, JSON.stringify(creds), "utf-8");

      expect(() => {
        loadConfig(credsPath);
      }).toThrow(/default_app_key.*not.*app_keys|not.*found/i);
    } finally {
      if (existsSync(credsPath)) {
        unlinkSync(credsPath);
      }
    }
  });

  it("provides helpful error message when file not found", () => {
    const nonExistent = "/nonexistent/path/batch-credentials.json";

    expect(() => {
      loadConfig(nonExistent);
    }).toThrow(/batch-credentials.json|not found|does not exist/i);
  });
});
