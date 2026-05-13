#!/usr/bin/env node
// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only

const [, , resource, action, ...rest] = process.argv;

if (!resource || resource === "help") {
  console.log(
    JSON.stringify(
      {
        ok: true,
        hint: "Run `node bin/batch.mjs <resource> <action>` — see SKILL.md for the command table.",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const RESOURCE_MAP = {
  // CEP
  profiles: "cep/profiles.mjs",
  audiences: "cep/audiences.mjs",
  campaigns: "cep/campaigns.mjs",
  catalogs: "cep/catalogs.mjs",
  orchestrations: "cep/orchestrations.mjs",
  exports: "cep/exports.mjs",
  segments: "cep/segments.mjs",
  // MEP
  transactional: "mep/transactional.mjs",
  "trigger-events": "mep/trigger-events.mjs",
  "mep-campaigns": "mep/campaigns.mjs",
  "in-app": "mep/in-app-campaigns.mjs",
  "custom-audience": "mep/custom-audience.mjs",
  "custom-data": "mep/custom-data.mjs",
  "app-data": "mep/app-data.mjs",
  gdpr: "mep/gdpr.mjs",
  "mep-export": "mep/exports.mjs",
};

const scriptPath = RESOURCE_MAP[resource];
if (!scriptPath) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        command: resource,
        error: {
          error_code: "UNKNOWN_RESOURCE",
          error_message: `Unknown resource: ${resource}`,
          hint: "Run `node bin/batch.mjs` for help.",
        },
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

try {
  const mod = await import(new URL(`../scripts/${scriptPath}`, import.meta.url));
  await mod.dispatch(action, rest);
} catch (err) {
  if (err.code === "ERR_MODULE_NOT_FOUND") {
    console.error(
      JSON.stringify(
        {
          ok: false,
          command: `${resource} ${action || ""}`.trim(),
          error: {
            error_code: "SCRIPT_NOT_IMPLEMENTED",
            error_message: `Script ${scriptPath} not yet implemented`,
            hint: "Implementation in progress.",
          },
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  throw err;
}
