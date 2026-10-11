#!/usr/bin/env node
/**
 * Encrypt a backup folder into one file, or decrypt it back. Used by the
 * daily GitHub Action (.github/workflows/backup.yml): the repository is
 * public, so its saved files are downloadable by any signed-in GitHub user —
 * the guests' names and money records must only ever leave the runner
 * encrypted. The same script decrypts on your machine.
 *
 *   node backup-crypto.mjs encrypt <folder> <file.acsbackup>
 *   node backup-crypto.mjs decrypt <file.acsbackup> <folder>
 *
 * Key: BACKUP_ENCRYPTION_KEY, from the environment or the repo's .env.local.
 * Any long random text (e.g. `openssl rand -base64 32`); keep a copy in a
 * password manager — without it the backups can't be opened.
 *
 * Format: "ACSBK1\n" | salt (16) | iv (12) | auth tag (16) | ciphertext.
 * AES-256-GCM with a scrypt-derived key; the plaintext is a JSON bundle of
 * the folder's files. GCM's tag means a wrong key or a damaged file fails
 * loudly instead of producing garbage. No dependencies.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MAGIC = Buffer.from("ACSBK1\n");
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function key() {
  let value = process.env.BACKUP_ENCRYPTION_KEY;
  const envFile = join(repoRoot, ".env.local");
  if (!value && existsSync(envFile)) {
    const line = readFileSync(envFile, "utf8").split(/\r?\n/).find((l) => /^\s*BACKUP_ENCRYPTION_KEY\s*=/.test(l));
    value = line?.replace(/^\s*BACKUP_ENCRYPTION_KEY\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  }
  if (!value || value.length < 16) {
    console.error("BACKUP_ENCRYPTION_KEY is missing or too short (use at least 16 characters, e.g. `openssl rand -base64 32`).");
    process.exit(2);
  }
  return value;
}

function filesIn(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesIn(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function encrypt(folder, outFile) {
  const root = resolve(folder);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`Not a folder: ${folder}`);
  const files = Object.fromEntries(
    filesIn(root).map((f) => [relative(root, f).split(sep).join("/"), readFileSync(f).toString("base64")]),
  );
  if (Object.keys(files).length === 0) throw new Error(`Nothing to encrypt in ${folder}`);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(key(), salt, 32, SCRYPT), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ version: 1, files })), cipher.final()]);
  writeFileSync(outFile, Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]));
  console.log(`Encrypted ${Object.keys(files).length} files → ${outFile}`);
}

function decrypt(inFile, folder) {
  const data = readFileSync(inFile);
  if (!data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not an ACs Homestay backup file.");
  let o = MAGIC.length;
  const salt = data.subarray(o, (o += 16));
  const iv = data.subarray(o, (o += 12));
  const tag = data.subarray(o, (o += 16));
  const decipher = createDecipheriv("aes-256-gcm", scryptSync(key(), salt, 32, SCRYPT), iv);
  decipher.setAuthTag(tag);
  let json;
  try {
    json = Buffer.concat([decipher.update(data.subarray(o)), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Couldn't decrypt: wrong BACKUP_ENCRYPTION_KEY, or the file is damaged.");
  }
  const root = resolve(folder);
  const { files } = JSON.parse(json);
  for (const [name, b64] of Object.entries(files)) {
    const target = resolve(root, name);
    if (target !== root && !target.startsWith(root + sep)) throw new Error(`Refusing unsafe path in backup: ${name}`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(b64, "base64"));
  }
  console.log(`Decrypted ${Object.keys(files).length} files → ${root}`);
}

const [mode, from, to] = process.argv.slice(2);
try {
  if (mode === "encrypt" && from && to) encrypt(from, to);
  else if (mode === "decrypt" && from && to) decrypt(from, to);
  else {
    console.error("Usage: backup-crypto.mjs encrypt <folder> <file> | decrypt <file> <folder>");
    process.exit(2);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
