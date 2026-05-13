#!/usr/bin/env node
// Copyright (C) 2026 Drivenlabs — Alexandre Bouchez
// SPDX-License-Identifier: AGPL-3.0-only
//
// Example: Sync a CSV of users to Batch via /profiles/mass-update.
//
// This script demonstrates bulk user sync from a CSV file. It:
// 1. Parses a CSV file (first column must be "custom_id")
// 2. Converts each row to a Batch profile edit
// 3. Chunks edits into batches (max 10,000 per call)
// 4. Sends each chunk via batch-cep CLI
// 5. Reports results and any errors
//
// Usage:
//   node csv-sync.mjs path/to/users.csv
//
// CSV Format:
//   custom_id,firstname,lastname,$email_address,tier,signup_date
//   u_123,Jane,Doe,jane@example.com,premium,2026-01-15
//   u_456,John,Smith,john@example.com,free,2026-02-20
//
// Notes:
// - First column MUST be "custom_id"
// - Remaining columns are attribute names (e.g., firstname, $email_address)
// - Attribute names starting with $ are reserved identifiers (email, phone, etc.)
// - See https://developer.batch.com for full identifier list
// - Empty cells are skipped (not sent as null)
// - For production, replace simple split() with csv-parse npm package for quoted values
//
// Rate limits:
// - /profiles/mass-update: 10,000 edits max per call
// - No per-ID rate limit for mass-update (unlike /profiles/update which is 300/s)
// - However, total throughput is still subject to general Batch rate limits
//
// Error handling:
// - Stops on first failure (exit code 1)
// - Reports chunk number and error details
// - Partial successes are NOT rolled back

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get CSV path from CLI args
const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node csv-sync.mjs <path-to-csv>");
  console.error("Example: node csv-sync.mjs ./users.csv");
  process.exit(1);
}

// Check file exists
if (!existsSync(csvPath)) {
  console.error(`File not found: ${csvPath}`);
  process.exit(1);
}

// Parse CSV (simple implementation for demo — use csv-parse in production)
console.log(`Reading ${csvPath}...`);
const lines = readFileSync(csvPath, "utf-8").trim().split("\n");

if (lines.length === 0) {
  console.error("CSV file is empty.");
  process.exit(1);
}

// Parse header
const headers = lines[0].split(",").map((h) => h.trim());
if (headers[0] !== "custom_id") {
  console.error("Error: First CSV column must be 'custom_id'.");
  console.error(`Found: ${headers[0]}`);
  process.exit(1);
}

console.log(`Found columns: ${headers.join(", ")}`);

// Parse data rows into Batch edits
const edits = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue; // Skip empty lines

  const values = line.split(",").map((v) => v.trim());
  const customId = values[0];

  if (!customId) {
    console.warn(`Warning: Row ${i + 1} has empty custom_id. Skipping.`);
    continue;
  }

  // Build attributes from remaining columns
  const attributes = {};
  for (let j = 1; j < headers.length; j++) {
    const value = values[j];
    // Only include non-empty cells
    if (value && value.length > 0) {
      attributes[headers[j]] = value;
    }
  }

  edits.push({
    identifiers: { custom_id: customId },
    attributes,
  });
}

console.log(`Parsed ${edits.length} edits from ${lines.length - 1} data rows.`);

if (edits.length === 0) {
  console.error("No valid edits found in CSV.");
  process.exit(1);
}

// Chunk edits into groups of 10,000 (max per /profiles/mass-update call)
const CHUNK_SIZE = 10000;
const chunks = [];
for (let i = 0; i < edits.length; i += CHUNK_SIZE) {
  chunks.push(edits.slice(i, i + CHUNK_SIZE));
}

console.log(`Divided into ${chunks.length} chunk(s).`);

// Send each chunk via batch-cep CLI
let totalUpdated = 0;
let failedChunk = null;

for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i];
  const chunkNum = i + 1;
  const chunkTotal = chunks.length;

  console.log(`\n[${chunkNum}/${chunkTotal}] Sending ${chunk.length} edits to Batch...`);

  try {
    // Call batch-cep CLI with serialized JSON
    // Path: ${SKILL_PATH}/scripts/cep/profiles.mjs mass-update <json>
    const skillPath = process.env.SKILL_PATH || `${__dirname}/../scripts`; /* fallback to local */
    const cmd = `node "${skillPath}/cep/profiles.mjs" mass-update '${JSON.stringify(chunk)}'`;

    const result = execSync(cmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const parsed = JSON.parse(result);

    if (!parsed.ok) {
      console.error(`❌ Chunk ${chunkNum} failed:`);
      console.error(JSON.stringify(parsed.error, null, 2));
      failedChunk = chunkNum;
      break;
    }

    const count = parsed.result?.count || chunk.length;
    totalUpdated += count;

    console.log(`✅ Chunk ${chunkNum} applied: ${count} profiles updated`);
  } catch (err) {
    console.error(`❌ Chunk ${chunkNum} failed with error:`);
    console.error(err.message);
    if (err.stdout) console.error("STDOUT:", err.stdout);
    if (err.stderr) console.error("STDERR:", err.stderr);
    failedChunk = chunkNum;
    break;
  }
}

// Report final results
console.log(`\n${"=".repeat(50)}`);
if (failedChunk) {
  console.error(`\n❌ Sync stopped at chunk ${failedChunk}/${chunks.length}.`);
  console.error(`${totalUpdated} profiles updated before failure.`);
  console.error("\nTo retry failed chunks:");
  console.error("- Fix any issues (CSV format, credentials, Batch errors)");
  console.error(`- Re-run: node csv-sync.mjs ${csvPath}`);
  process.exit(1);
} else {
  console.log(`\n✅ Sync complete! ${totalUpdated} profiles updated.`);
  console.log(`All ${chunks.length} chunk(s) sent successfully.`);
  process.exit(0);
}
