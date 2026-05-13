// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load and validate batch-credentials.json.
 *
 * @param {string} credentialsPath - path to batch-credentials.json (defaults to cwd)
 * @returns {Object} validated credentials with defaults applied
 * @throws {Error} if file not found, invalid JSON, or validation fails
 */
export function loadConfig(credentialsPath) {
  let filePath;

  if (credentialsPath) {
    filePath = resolve(credentialsPath);
  } else {
    filePath = resolve(process.cwd(), "batch-credentials.json");
  }

  let text;
  try {
    text = readFileSync(filePath, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        `batch-credentials.json not found at ${filePath}. Create a credentials file with rest_key, project_key, app_keys, and optional default_app_key.`,
      );
    }
    throw new Error(`Failed to read batch-credentials.json: ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`batch-credentials.json has invalid JSON: ${err.message}`);
  }

  // Validate required fields
  if (!data.rest_key || typeof data.rest_key !== "string") {
    throw new Error("batch-credentials.json: rest_key is required (string)");
  }

  if (!data.project_key || typeof data.project_key !== "string") {
    throw new Error("batch-credentials.json: project_key is required (string)");
  }

  // app_keys is optional — only required for MEP commands.
  // If present, validate it is a non-empty object of strings.
  let appKeys = null;
  let defaultAppKey = null;

  if (data.app_keys !== undefined) {
    if (typeof data.app_keys !== "object" || Array.isArray(data.app_keys)) {
      throw new Error("batch-credentials.json: app_keys must be an object");
    }

    const appKeyEntries = Object.entries(data.app_keys);

    // Validate all provided app_keys are strings
    for (const [key, value] of appKeyEntries) {
      if (typeof value !== "string") {
        throw new Error(`batch-credentials.json: app_keys.${key} must be a string`);
      }
    }

    if (appKeyEntries.length > 0) {
      appKeys = data.app_keys;

      // Determine default_app_key only when app_keys are present
      defaultAppKey = data.default_app_key ?? null;
      if (!defaultAppKey) {
        // Default to ios_live if it exists, otherwise first in the object
        defaultAppKey = data.app_keys.ios_live ? "ios_live" : appKeyEntries[0][0];
      }

      // Validate that default_app_key exists in app_keys
      if (!data.app_keys[defaultAppKey]) {
        throw new Error(
          `batch-credentials.json: default_app_key "${defaultAppKey}" is not found in app_keys`,
        );
      }
    }
  } else if (data.default_app_key) {
    // default_app_key without app_keys is harmless — just ignore it
  }

  // Return validated config with defaults
  return {
    rest_key: data.rest_key,
    project_key: data.project_key,
    app_keys: appKeys,
    default_app_key: defaultAppKey,
    api_base_url: data.api_base_url ?? "https://api.batch.com",
  };
}
