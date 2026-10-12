#!/usr/bin/env node
/**
 * Back up the live ACs Homestay Tracker: download each table's CSV export
 * from the deployed site into a new timestamped folder, plus a manifest.json
 * (row counts, sizes, SHA-256s), and compare row counts with the previous
 * backup. No dependencies — Node 18+ (built-in fetch and crypto).
 *
 *   node backup.mjs [--url <site>] [--out <dir>]
 *
 * The site sits behind a shared-password gate (src/proxy.ts). Its cookie is
 * HMAC-SHA256(SITE_PASSWORD, "granted") as hex, so the script computes the
 * same value from BACKUP_SITE_PASSWORD — read from the environment, or from
 * the repo's .env.local (gitignored). Deliberately a different name from
 * SITE_PASSWORD, which would also switch the gate on for local development.
 * The password itself is never printed or written anywhere.
 *
 * Exit codes: 0 ok · 1 a download or check failed (nothing kept) · 2 setup
 * problem (no password configured).
 */

import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TABLES = [
  { name: "bookings", firstColumn: "Guest Name" },
  { name: "expenses", firstColumn: "Date" },
  { name: "cleaning", firstColumn: "Date" },
  // Optional: a site deployed before blocked dates existed answers 404, and
  // that alone mustn't fail the backup of the other tables.
  { name: "blocked-dates", firstColumn: "First Day", optional: true },
];

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const siteUrl = arg("--url", "https://acs-homestay-tracker.vercel.app").replace(/\/+$/, "");
const outRoot = resolve(arg("--out", join(homedir(), "Documents", "acs-homestay-backups")));

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

/** Number of records in a CSV (quoted fields may contain commas and newlines). */
function countCsvRecords(text) {
  let records = 0;
  let inQuotes = false;
  let sawField = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') i++;
        else inQuotes = false;
      }
    } else if (ch === '"') {
      inQuotes = true;
      sawField = true;
    } else if (ch === "\n") {
      records++;
      sawField = false;
    } else if (ch !== "\r") {
      sawField = true;
    }
  }
  if (sawField) records++;
  return records;
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function previousManifest() {
  if (!existsSync(outRoot)) return null;
  const dirs = readdirSync(outRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(e.name))
    .map((e) => e.name)
    .sort();
  for (const name of dirs.reverse()) {
    const file = join(outRoot, name, "manifest.json");
    if (existsSync(file)) {
      try {
        return { name, manifest: JSON.parse(readFileSync(file, "utf8")) };
      } catch {
        /* skip a damaged manifest */
      }
    }
  }
  return null;
}

async function main() {
  const password =
    process.env.BACKUP_SITE_PASSWORD || readEnvFile(join(repoRoot, ".env.local")).BACKUP_SITE_PASSWORD;
  if (!password) {
    console.error(
      "No site password configured. Add this line to the repo's .env.local (it's gitignored):\n" +
        "  BACKUP_SITE_PASSWORD=<the site's access code>\n" +
        "or set BACKUP_SITE_PASSWORD in the environment for this run.",
    );
    process.exit(2);
  }
  const cookie = `site_gate=${createHmac("sha256", password).update("granted").digest("hex")}`;

  const takenAt = new Date();
  const folder = stamp(takenAt);
  const finalDir = join(outRoot, folder);
  const tmpDir = join(outRoot, `.${folder}.partial`);
  mkdirSync(tmpDir, { recursive: true });

  const tables = {};
  const skipped = [];
  try {
    for (const t of TABLES) {
      const url = `${siteUrl}/api/export/${t.name}`;
      let res;
      try {
        res = await fetch(url, { headers: { Cookie: cookie }, redirect: "manual" });
      } catch (e) {
        throw new Error(`${t.name}: couldn't reach ${siteUrl} (${e.cause?.code ?? e.message}).`);
      }
      if (res.status >= 300 && res.status < 400) {
        const where = res.headers.get("location") ?? "";
        throw new Error(
          where.includes("/gate")
            ? `${t.name}: the site rejected the access code — check BACKUP_SITE_PASSWORD matches the site's SITE_PASSWORD.`
            : `${t.name}: unexpected redirect to ${where}.`,
        );
      }
      if (res.status === 404 && t.optional) {
        skipped.push(t.name);
        continue;
      }
      if (res.status !== 200) {
        const body = (await res.text()).slice(0, 200);
        throw new Error(`${t.name}: HTTP ${res.status}${body ? ` — ${body}` : ""}`);
      }
      const type = res.headers.get("content-type") ?? "";
      const text = await res.text();
      const header = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0];
      if (!type.includes("text/csv") || !header.startsWith(t.firstColumn)) {
        throw new Error(`${t.name}: the response isn't the expected CSV (content-type "${type}", header "${header.slice(0, 60)}").`);
      }
      const file = `${t.name}.csv`;
      writeFileSync(join(tmpDir, file), text);
      tables[t.name] = {
        file,
        rows: Math.max(0, countCsvRecords(text) - 1),
        bytes: Buffer.byteLength(text),
        sha256: createHash("sha256").update(text).digest("hex"),
      };
    }

    const manifest = { source: siteUrl, takenAt: takenAt.toISOString(), tables };
    writeFileSync(join(tmpDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

    const prev = previousManifest();
    renameSync(tmpDir, finalDir);

    console.log(`Backup saved: ${finalDir}`);
    for (const [name, info] of Object.entries(tables)) {
      const before = prev?.manifest?.tables?.[name]?.rows;
      const change =
        before === undefined ? "" : info.rows === before ? " (no change)" : ` (${info.rows - before > 0 ? "+" : ""}${info.rows - before} since ${prev.name})`;
      console.log(`  ${name.padEnd(13)} ${String(info.rows).padStart(5)} rows  ${(info.bytes / 1024).toFixed(1)} KB${change}`);
    }
    if (skipped.length) {
      console.log(`Skipped (not on the live site yet): ${skipped.join(", ")}.`);
    }
    const shrank = prev && Object.entries(tables).filter(([n, i]) => (prev.manifest.tables?.[n]?.rows ?? 0) > i.rows);
    if (shrank && shrank.length) {
      console.log(`Note: fewer rows than the previous backup in ${shrank.map(([n]) => n).join(", ")} — fine if records were deleted on purpose.`);
    }
  } catch (e) {
    rmSync(tmpDir, { recursive: true, force: true });
    console.error(`Backup failed, nothing kept: ${e.message}`);
    process.exit(1);
  }
}

main();
