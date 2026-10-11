---
name: backup-live-data
description: Back up the live ACs Homestay Tracker data (bookings, expenses, cleaning) from https://acs-homestay-tracker.vercel.app into a timestamped folder of CSVs with a manifest, and compare row counts with the previous backup. Use this whenever the user asks to back up, export, download, save, snapshot or archive the app's data or the production/live/deployed site's records — including before a deployment, a database change or migration, a bulk delete, or "just in case" — even if they don't say the word "backup".
---

# Back up the live tracker data

The deployed site has a CSV export per table (`/api/export/bookings`, `/expenses`, `/cleaning` — see `src/app/api/export/[table]/route.ts`). They exist so there's always a copy that doesn't depend on the app or database staying up (the database was once unreachable for 11 days). This skill downloads all three into a new folder in one go.

## Run it

From the repo root:

```bash
node .claude/skills/backup-live-data/scripts/backup.mjs
```

Options, only when the user asks for something different:
- `--out <dir>` — where backups go. Default: `~/Documents/acs-homestay-backups/`, outside the repo on purpose: the files contain guests' names and money records, and must never be committed.
- `--url <site>` — a different deployment (e.g. a Vercel preview URL).

Each run creates `<out>/YYYY-MM-DD_HHMMSS/` with `bookings.csv`, `expenses.csv`, `cleaning.csv` and `manifest.json` (source, time, and per table: rows, bytes, SHA-256). It's all-or-nothing: if any table fails, the partial folder is removed, so a folder that exists is always a complete backup.

## Automatic daily backups

`.github/workflows/backup.yml` runs the same script every night at 02:00 Manila time (and on demand from GitHub → Actions → **Daily backup** → **Run workflow**). The repository is public, so it encrypts the backup with `scripts/backup-crypto.mjs` before saving it as a run artifact, kept 90 days. To open one, download the artifact (a zip containing a `.acsbackup` file), then:

```bash
node .claude/skills/backup-live-data/scripts/backup-crypto.mjs decrypt <file.acsbackup> <folder>
```

It needs `BACKUP_ENCRYPTION_KEY` — the same value as the GitHub secret — in the environment or `.env.local`. A wrong key or a damaged file fails with a clear message rather than producing garbage. If someone asks for a backup "from last week", it's probably one of these artifacts rather than a new run.

## The access code

The site is behind a shared-password gate. The script reads the code from `BACKUP_SITE_PASSWORD` — in the environment, or in the repo's `.env.local` (gitignored). It's a different name from `SITE_PASSWORD` because that one would also switch the gate on for local development.

If the script exits with code 2 (no password configured), ask the user to add `BACKUP_SITE_PASSWORD=<access code>` to `.env.local` themselves in their editor. Don't ask them to paste the code into the chat and don't put it in a command line — either would leave it in the conversation or shell history. Then run the script again.

If it reports the site **rejected the access code**, the value doesn't match the site's current `SITE_PASSWORD` (set in Vercel → Project → Settings → Environment Variables); the user needs to update `.env.local`.

## Report back

Tell the user, briefly:
- where the backup was saved (the full folder path),
- the row count for each table, and the change since the previous backup (the script prints both),
- any "fewer rows than the previous backup" note it printed — usually a deliberate delete, but worth a look since that's exactly what a backup is for catching.

Don't paste the CSV contents into the chat; the user can open the files. If they want to check one, a row count or a few lines is enough.

## When it fails

- **Couldn't reach the site**: check the URL and the internet connection; the site may be redeploying — try again in a minute.
- **HTTP 503 "Access is not configured"**: the deployment has no `SITE_PASSWORD` set — a Vercel settings problem, not a backup problem. Tell the user.
- **"isn't the expected CSV"**: the export route changed shape, or the URL points at something else. Look at the route file before changing the script's expected first column.
