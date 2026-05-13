// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure validators for Batch CEP/MEP inputs.
 * Each returns { ok: true } or { ok: false, error: "<message>" }.
 */

const VALID_APP_KEY_ALIASES = new Set([
  "ios_live",
  "ios_dev",
  "android_live",
  "android_dev",
  "web",
]);
const VALID_AUDIENCE_TYPES = new Set(["custom_ids", "emails", "install_ids"]);
const VALID_CAMPAIGN_STATES = new Set(["DRAFT", "RUNNING", "STOPPED"]);
const VALID_PRIORITIES = new Set(["normal", "high"]);
const VALID_PUSH_TYPES = new Set(["alert", "background"]);
const VALID_IN_APP_PRIORITIES = new Set(["STANDARD", "IMPORTANT", "CRITICAL"]);
const VALID_IN_APP_SEGMENTS = new Set(["NEW", "ONE_TIME", "ENGAGED", "DORMANT", "IMPORTED"]);
const VALID_RECIPIENT_KEYS = new Set(["tokens", "custom_ids", "install_ids", "advertising_ids"]);

export function validateCustomId(value) {
  if (typeof value !== "string") return { ok: false, error: "custom_id must be string" };
  if (value.length === 0) return { ok: false, error: "custom_id must be non-empty" };
  if (value.length > 512) return { ok: false, error: "custom_id max 512 chars" };
  return { ok: true };
}

export function validateAudienceName(value) {
  if (typeof value !== "string") return { ok: false, error: "audience_name must be string" };
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(value)) {
    return { ok: false, error: "audience_name must match [A-Za-z0-9_-], max 255 chars" };
  }
  return { ok: true };
}

export function validateEventName(value) {
  if (typeof value !== "string") return { ok: false, error: "event_name must be string" };
  if (!/^[a-z0-9_]{1,30}$/.test(value)) {
    return { ok: false, error: "event_name must match [a-z0-9_], max 30 chars" };
  }
  return { ok: true };
}

export function validateAppKeyAlias(value) {
  if (!VALID_APP_KEY_ALIASES.has(value)) {
    return {
      ok: false,
      error: `app_key must be one of: ${Array.from(VALID_APP_KEY_ALIASES).join(", ")}`,
    };
  }
  return { ok: true };
}

export function validateAudienceType(value) {
  if (!VALID_AUDIENCE_TYPES.has(value)) {
    return {
      ok: false,
      error: `audience_type must be one of: ${Array.from(VALID_AUDIENCE_TYPES).join(", ")}`,
    };
  }
  return { ok: true };
}

export function validateCampaignState(value) {
  if (!VALID_CAMPAIGN_STATES.has(value)) {
    return {
      ok: false,
      error: `campaign_state must be one of: ${Array.from(VALID_CAMPAIGN_STATES).join(", ")}`,
    };
  }
  return { ok: true };
}

export function validatePriority(value) {
  if (!VALID_PRIORITIES.has(value)) {
    return {
      ok: false,
      error: `priority must be one of: ${Array.from(VALID_PRIORITIES).join(", ")}`,
    };
  }
  return { ok: true };
}

export function validatePushType(value) {
  if (!VALID_PUSH_TYPES.has(value)) {
    return {
      ok: false,
      error: `push_type must be one of: ${Array.from(VALID_PUSH_TYPES).join(", ")}`,
    };
  }
  return { ok: true };
}

export function validateInAppPriority(value) {
  if (!VALID_IN_APP_PRIORITIES.has(value)) {
    return {
      ok: false,
      error: `in_app_priority must be one of: ${Array.from(VALID_IN_APP_PRIORITIES).join(", ")}`,
    };
  }
  return { ok: true };
}

export function validateInAppSegment(value) {
  if (!VALID_IN_APP_SEGMENTS.has(value)) {
    return {
      ok: false,
      error: `in_app_segment must be one of: ${Array.from(VALID_IN_APP_SEGMENTS).join(", ")}`,
    };
  }
  return { ok: true };
}

export function validateGroupId(value) {
  if (typeof value !== "string") return { ok: false, error: "group_id must be string" };
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return { ok: false, error: "group_id must match [A-Za-z0-9_-]" };
  }
  if (value.length > 128) {
    return { ok: false, error: "group_id max 128 chars" };
  }
  return { ok: true };
}

export function validateRfcTimestamp(value) {
  if (typeof value !== "string") return { ok: false, error: "timestamp must be string" };
  if (value === "now") return { ok: true };
  // Check RFC 3339 format: YYYY-MM-DDTHH:mm:ss followed by offset or Z
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/.test(value)) {
    return { ok: false, error: "timestamp must be RFC 3339 with offset (or literal 'now')" };
  }
  // Validate it parses as valid date
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: "timestamp is not a valid date" };
  }
  return { ok: true };
}

export function validateEmail(value) {
  if (typeof value !== "string") return { ok: false, error: "email must be string" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { ok: false, error: "email must be valid format" };
  }
  return { ok: true };
}

export function validateRegion(value) {
  if (typeof value !== "string") return { ok: false, error: "region must be string" };
  if (!/^[A-Z]{2}$/.test(value)) {
    return { ok: false, error: "region must be 2-letter ISO code (uppercase)" };
  }
  return { ok: true };
}

export function validateLanguage(value) {
  if (typeof value !== "string") return { ok: false, error: "language must be string" };
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(value)) {
    return { ok: false, error: "language must be BCP-47 format (e.g. 'en' or 'en-US')" };
  }
  return { ok: true };
}

export function validateTopicPreference(value) {
  if (typeof value !== "string") return { ok: false, error: "topic_preference must be string" };
  if (!/^[a-z0-9_-]{1,300}$/.test(value)) {
    return { ok: false, error: "topic_preference must match [a-z0-9_-], max 300 chars" };
  }
  return { ok: true };
}

export function validateBatchEvent(value) {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "event must be object" };
  }
  if (!("name" in value)) {
    return { ok: false, error: "event.name is required" };
  }
  const nameResult = validateEventName(value.name);
  if (!nameResult.ok) return nameResult;
  if ("label" in value && typeof value.label === "string" && value.label.length > 255) {
    return { ok: false, error: "event.label max 255 chars" };
  }
  if ("data" in value && (typeof value.data !== "object" || value.data === null)) {
    return { ok: false, error: "event.data must be object" };
  }
  if ("time" in value) {
    const timeResult = validateRfcTimestamp(value.time);
    if (!timeResult.ok) return timeResult;
  }
  return { ok: true };
}

export function validateRecipients(value) {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "recipients must be object" };
  }
  // Check at least one valid recipient key with a non-empty array
  const hasRecipient = Array.from(VALID_RECIPIENT_KEYS).some(
    (key) => key in value && Array.isArray(value[key]) && value[key].length > 0,
  );
  if (!hasRecipient) {
    return {
      ok: false,
      error: `recipients must have at least one of: ${Array.from(VALID_RECIPIENT_KEYS).join(", ")} (as non-empty array)`,
    };
  }
  return { ok: true };
}
