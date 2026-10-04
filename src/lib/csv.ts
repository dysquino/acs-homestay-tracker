/**
 * A minimal RFC 4180 CSV writer — the export feature's counterpart to the
 * reader in airbnb-import.ts. Kept symmetric with that file: same quoting
 * rule (wrap in quotes and double any internal quote whenever a field
 * contains a comma, quote, or newline), same CRLF row endings.
 */

function escapeField(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeField).join(","));
  // A leading BOM so Excel opens the UTF-8 file (₱, —, etc.) without mangling it.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** A `Response` that downloads as a named file instead of rendering inline. */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
