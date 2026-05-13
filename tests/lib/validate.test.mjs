// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest";
import {
  validateAppKeyAlias,
  validateAudienceName,
  validateAudienceType,
  validateBatchEvent,
  validateCampaignState,
  validateCustomId,
  validateEmail,
  validateEventName,
  validateGroupId,
  validateInAppPriority,
  validateInAppSegment,
  validateLanguage,
  validatePriority,
  validatePushType,
  validateRecipients,
  validateRegion,
  validateRfcTimestamp,
  validateTopicPreference,
} from "../../skills/batch-cep/lib/validate.mjs";

describe("validateCustomId", () => {
  it("accepts non-empty string ≤512 chars", () => {
    expect(validateCustomId("u_123").ok).toBe(true);
  });
  it("rejects empty string", () => {
    expect(validateCustomId("").ok).toBe(false);
  });
  it("rejects >512 chars", () => {
    expect(validateCustomId("x".repeat(513)).ok).toBe(false);
  });
});

describe("validateAudienceName", () => {
  it("accepts valid kebab/snake", () => {
    expect(validateAudienceName("my_audience-1").ok).toBe(true);
  });
  it("rejects space", () => {
    expect(validateAudienceName("has space").ok).toBe(false);
  });
  it("rejects >255 chars", () => {
    expect(validateAudienceName("a".repeat(256)).ok).toBe(false);
  });
});

describe("validateEventName", () => {
  it("accepts lowercase + digits + underscore, ≤30 chars", () => {
    expect(validateEventName("order_completed").ok).toBe(true);
  });
  it("rejects uppercase", () => {
    expect(validateEventName("Order_Completed").ok).toBe(false);
  });
  it("rejects >30 chars", () => {
    expect(validateEventName("a".repeat(31)).ok).toBe(false);
  });
});

describe("validateAppKeyAlias", () => {
  it("accepts each known alias", () => {
    for (const a of ["ios_live", "ios_dev", "android_live", "android_dev", "web"]) {
      expect(validateAppKeyAlias(a).ok).toBe(true);
    }
  });
  it("rejects unknown alias", () => {
    expect(validateAppKeyAlias("ios_beta").ok).toBe(false);
  });
});

describe("validateAudienceType", () => {
  it("accepts each known type", () => {
    for (const t of ["custom_ids", "emails", "install_ids"]) {
      expect(validateAudienceType(t).ok).toBe(true);
    }
  });
  it("rejects unknown type", () => {
    expect(validateAudienceType("unknown").ok).toBe(false);
  });
});

describe("validateCampaignState", () => {
  it("accepts DRAFT/RUNNING/STOPPED", () => {
    for (const s of ["DRAFT", "RUNNING", "STOPPED"]) {
      expect(validateCampaignState(s).ok).toBe(true);
    }
  });
  it("rejects lowercase or unknown", () => {
    expect(validateCampaignState("draft").ok).toBe(false);
    expect(validateCampaignState("PAUSED").ok).toBe(false);
  });
});

describe("validatePriority", () => {
  it("accepts normal/high", () => {
    expect(validatePriority("normal").ok).toBe(true);
    expect(validatePriority("high").ok).toBe(true);
  });
  it("rejects other", () => {
    expect(validatePriority("low").ok).toBe(false);
  });
});

describe("validatePushType", () => {
  it("accepts alert/background", () => {
    expect(validatePushType("alert").ok).toBe(true);
    expect(validatePushType("background").ok).toBe(true);
  });
});

describe("validateInAppPriority", () => {
  it("accepts STANDARD/IMPORTANT/CRITICAL", () => {
    expect(validateInAppPriority("STANDARD").ok).toBe(true);
    expect(validateInAppPriority("IMPORTANT").ok).toBe(true);
    expect(validateInAppPriority("CRITICAL").ok).toBe(true);
  });
});

describe("validateInAppSegment", () => {
  it("accepts the 5 segments", () => {
    for (const s of ["NEW", "ONE_TIME", "ENGAGED", "DORMANT", "IMPORTED"]) {
      expect(validateInAppSegment(s).ok).toBe(true);
    }
  });
});

describe("validateGroupId", () => {
  it("accepts alnum + dash + underscore, ≤128", () => {
    expect(validateGroupId("order_confirmed-v2").ok).toBe(true);
  });
  it("rejects space", () => {
    expect(validateGroupId("order confirmed").ok).toBe(false);
  });
});

describe("validateRfcTimestamp", () => {
  it("accepts RFC 3339 with offset", () => {
    expect(validateRfcTimestamp("2026-05-13T10:00:00+02:00").ok).toBe(true);
    expect(validateRfcTimestamp("2026-05-13T10:00:00Z").ok).toBe(true);
  });
  it('accepts literal "now"', () => {
    expect(validateRfcTimestamp("now").ok).toBe(true);
  });
  it("rejects invalid", () => {
    expect(validateRfcTimestamp("not-a-date").ok).toBe(false);
  });
});

describe("validateEmail", () => {
  it("accepts basic email", () => {
    expect(validateEmail("a@b.com").ok).toBe(true);
  });
  it("rejects missing @", () => {
    expect(validateEmail("a.b.com").ok).toBe(false);
  });
});

describe("validateRegion", () => {
  it("accepts 2-letter ISO code", () => {
    expect(validateRegion("FR").ok).toBe(true);
  });
  it("rejects wrong length", () => {
    expect(validateRegion("FRA").ok).toBe(false);
  });
});

describe("validateLanguage", () => {
  it("accepts BCP-47 basic", () => {
    expect(validateLanguage("fr").ok).toBe(true);
    expect(validateLanguage("en-US").ok).toBe(true);
  });
});

describe("validateTopicPreference", () => {
  it("accepts lowercase + digits + dash/underscore", () => {
    expect(validateTopicPreference("news-letter_v1").ok).toBe(true);
  });
  it("rejects uppercase", () => {
    expect(validateTopicPreference("News").ok).toBe(false);
  });
});

describe("validateBatchEvent", () => {
  it("accepts minimal {name}", () => {
    expect(validateBatchEvent({ name: "order_completed" }).ok).toBe(true);
  });
  it("rejects missing name", () => {
    expect(validateBatchEvent({}).ok).toBe(false);
  });
  it("rejects bad name regex", () => {
    expect(validateBatchEvent({ name: "Order" }).ok).toBe(false);
  });
});

describe("validateRecipients", () => {
  it("accepts object with at least one recipient list", () => {
    expect(validateRecipients({ custom_ids: ["u_1"] }).ok).toBe(true);
  });
  it("rejects empty object", () => {
    expect(validateRecipients({}).ok).toBe(false);
  });
});
