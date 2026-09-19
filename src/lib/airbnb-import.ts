import { findConflicts } from "./selectors";
import type { Booking, ISODate } from "./types";

/**
 * Reads Airbnb's "Transaction history" CSV export and turns its Reservation
 * rows into bookings. Pure functions only, so the same code previews on the
 * client and is unit-tested; the server re-validates whatever it is sent.
 *
 * Money: payout = Airbnb's "Amount" column, exactly as Airbnb shows it (it
 * equals "Paid out" on the matching transfer). Airbnb's service fee is already
 * taken out of it, so it is kept for reference only. The guest's cleaning fee
 * is NOT part of the calculation: cleaners are paid a fixed amount, recorded
 * separately on the Cleaning page.
 */

export type ImportRow = {
  confirmationCode: string;
  guestName: string;
  checkIn: ISODate;
  checkOut: ISODate;
  /** Airbnb "Amount" (= "Paid out"). */
  totalPayout: number;
  /** Airbnb "Service fee" — reference only, already inside the payout. */
  platformFee: number;
};

export type ParseResult = {
  rows: ImportRow[];
  /** Rows that were skipped, and why — shown to the user, never silent. */
  problems: string[];
};

const REQUIRED = [
  "type",
  "confirmation code",
  "start date",
  "end date",
  "guest",
  "amount",
  "service fee",
] as const;

/** Minimal RFC 4180 reader: quoted fields, "" escapes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** `08/28/2026` (MM/DD/YYYY, as Airbnb exports it) → `2026-08-28`, or null if it isn't a real date. */
export function parseAirbnbDate(value: string): ISODate | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function amount(value: string): number {
  const n = Number(value.replace(/,/g, "").trim() || 0);
  return Number.isFinite(n) ? n : NaN;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function parseAirbnbCsv(text: string): ParseResult {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], problems: ["The file is empty."] };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((name) => !header.includes(name));
  if (missing.length > 0) {
    return {
      rows: [],
      problems: [
        `This doesn't look like an Airbnb transaction export — missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
      ],
    };
  }
  const col = (r: string[], name: string) => (r[header.indexOf(name)] ?? "").trim();
  const currencyAt = header.indexOf("currency");

  const byCode = new Map<string, ImportRow>();
  const problems: string[] = [];

  for (const r of table.slice(1)) {
    if (col(r, "type").toLowerCase() !== "reservation") continue; // payouts, adjustments, taxes…

    const code = col(r, "confirmation code");
    const guest = col(r, "guest");
    const label = `${guest || "Unnamed guest"}${code ? ` (${code})` : ""}`;
    const checkIn = parseAirbnbDate(col(r, "start date"));
    const checkOut = parseAirbnbDate(col(r, "end date"));
    const paidOut = amount(col(r, "amount"));
    const fee = amount(col(r, "service fee"));

    if (!code) problems.push(`${label}: no confirmation code — skipped.`);
    else if (!guest) problems.push(`${label}: no guest name — skipped.`);
    else if (!checkIn || !checkOut) problems.push(`${label}: unreadable dates — skipped.`);
    else if (checkOut <= checkIn) problems.push(`${label}: check-out isn't after check-in — skipped.`);
    else if (![paidOut, fee].every(Number.isFinite)) problems.push(`${label}: unreadable amounts — skipped.`);
    else if (currencyAt >= 0 && r[currencyAt]?.trim() && r[currencyAt].trim() !== "PHP") {
      problems.push(`${label}: currency is ${r[currencyAt].trim()}, not PHP — skipped.`);
    } else if (paidOut <= 0) {
      problems.push(`${label}: amount is ${paidOut} (a refund or cancellation?) — skipped.`);
    } else {
      const existing = byCode.get(code);
      if (existing) {
        // Airbnb can split one reservation over several rows (e.g. after a change): combine them.
        existing.totalPayout = cents(existing.totalPayout + paidOut);
        existing.platformFee = cents(existing.platformFee + fee);
        if (checkIn < existing.checkIn) existing.checkIn = checkIn;
        if (checkOut > existing.checkOut) existing.checkOut = checkOut;
        problems.push(`${label}: appears on more than one row — combined into one booking.`);
      } else {
        byCode.set(code, {
          confirmationCode: code,
          guestName: guest,
          checkIn,
          checkOut,
          totalPayout: cents(paidOut),
          platformFee: cents(fee),
        });
      }
    }
  }

  const rows = [...byCode.values()];
  rows.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  if (rows.length === 0 && problems.length === 0) {
    problems.push("No reservations found in this file.");
  }
  return { rows, problems };
}

/* ------------------------------------------------------------------ */
/* Planning: what would importing these rows do to the current data?  */
/* ------------------------------------------------------------------ */

export type PlannedRow =
  | { row: ImportRow; action: "create"; conflicts: Booking[] }
  /** Same guest and dates as a hand-entered booking: link it and correct its money. */
  | { row: ImportRow; action: "update"; bookingId: string; existing: Booking; conflicts: Booking[] }
  /** This confirmation code was imported before. */
  | { row: ImportRow; action: "skip"; conflicts: [] };

export function planImport(rows: ImportRow[], existing: Booking[]): PlannedRow[] {
  const codes = new Set(existing.map((b) => b.confirmationCode).filter(Boolean));

  return rows.map((row): PlannedRow => {
    if (codes.has(row.confirmationCode)) return { row, action: "skip", conflicts: [] };

    const match = existing.find(
      (b) =>
        !b.confirmationCode &&
        b.guestName.trim().toLowerCase() === row.guestName.trim().toLowerCase() &&
        b.checkIn === row.checkIn &&
        b.checkOut === row.checkOut,
    );
    if (match) {
      return {
        row,
        action: "update",
        bookingId: match.id,
        existing: match,
        conflicts: findConflicts(existing, row.checkIn, row.checkOut, match.id),
      };
    }
    return { row, action: "create", conflicts: findConflicts(existing, row.checkIn, row.checkOut) };
  });
}
