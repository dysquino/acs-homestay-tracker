import { NextRequest } from "next/server";

import { listBookings } from "@/lib/data/bookings";
import { listExpenses } from "@/lib/data/expenses";
import { listCleaning } from "@/lib/data/cleaning";
import { listDateBlocks } from "@/lib/data/date-blocks";
import { listReconciliationLedger } from "@/lib/data/reconciliation-audit";
import { csvResponse, toCsv } from "@/lib/csv";
import { addDays, daysBetween, nightCount, today } from "@/lib/dates";
import {
  BOOKING_SOURCES,
  CLEANING_PAYMENT_STATUSES,
  CLEANING_STATUSES,
  EXPENSE_CATEGORIES,
  EXPENSE_REFUND_STATUSES,
  PAYMENT_STATUSES,
  labelFor,
} from "@/lib/types";

/**
 * Download the live data as a CSV — one table per request. Sits behind the
 * same site-wide access gate as every other route (src/proxy.ts doesn't
 * exempt /api/export, so an unauthenticated visitor can't reach this).
 *
 * This exists for the same reason the Excel workbook does: if the database
 * ever becomes unreachable again, whatever was exported last is a real,
 * standalone backup — not something that depends on this app still running.
 */

const TABLES = ["bookings", "expenses", "cleaning", "blocked-dates", "reconciliation"] as const;
type Table = (typeof TABLES)[number];

function isTable(value: string): value is Table {
  return (TABLES as readonly string[]).includes(value);
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  if (!isTable(table)) {
    return new Response(`Unknown export: ${table}`, { status: 404 });
  }

  const csv = await buildCsv(table);
  return csvResponse(`acs-homestay-${table}-${today()}.csv`, csv);
}

async function buildCsv(table: Table): Promise<string> {
  if (table === "bookings") {
    const bookings = await listBookings();
    return toCsv(
      [
        "Guest Name", "Source", "Check-in", "Check-out", "Nights", "Guests",
        "Total Payout", "Platform Fee (ref only)", "Payment Status",
        "Contact Info", "Notes", "Confirmation Code",
      ],
      bookings.map((b) => [
        b.guestName,
        labelFor(BOOKING_SOURCES, b.source),
        b.checkIn,
        b.checkOut,
        nightCount(b.checkIn, b.checkOut),
        b.guestsCount,
        b.totalPayout,
        b.platformFee,
        labelFor(PAYMENT_STATUSES, b.paymentStatus),
        b.contactInfo,
        b.notes,
        b.confirmationCode ?? "",
      ]),
    );
  }

  if (table === "expenses") {
    const expenses = await listExpenses();
    return toCsv(
      ["Date", "Category", "Description", "Amount", "Paid By", "Refund Status", "From a paid cleaning?"],
      expenses.map((e) => [
        e.date,
        labelFor(EXPENSE_CATEGORIES, e.category),
        e.description,
        e.amount,
        e.paidBy,
        labelFor(EXPENSE_REFUND_STATUSES, e.refundStatus),
        e.cleaningId ? "Yes" : "",
      ]),
    );
  }

  if (table === "reconciliation") {
    // The ledger, not the raw match rows. A spreadsheet of movements with a
    // running balance can be checked by eye and pivoted by month; a dump of
    // match ids cannot. The period's statement figures ride along on every row
    // so the file is self-contained — the point is that it still means
    // something when the app isn't there to ask.
    const ledger = await listReconciliationLedger();
    return toCsv(
      [
        "Month", "Period Status",
        "Bank Posted", "Record Date", "Category", "Guest / Payee", "Detail",
        "In", "Out", "Running Balance", "Recorded By", "Reference", "Statement Group",
        "Statement Opening", "Statement Closing", "Calculated Balance", "Difference",
        "Finalized By", "Finalized At", "Version",
      ],
      ledger.map((r) => [
        r.month,
        r.status,
        r.bankPostedDate ?? "",
        r.recordDate ?? "",
        r.category,
        r.label,
        r.detail,
        r.inflow === 0 ? "" : r.inflow,
        r.outflow === 0 ? "" : r.outflow,
        r.runningBalance,
        r.recordedBy,
        r.reference,
        r.statementGroup,
        r.statementOpening,
        r.statementClosing,
        r.calculatedBalance ?? "",
        r.difference ?? "",
        r.finalizedBy ?? "",
        r.finalizedAt ?? "",
        r.version,
      ]),
    );
  }

  if (table === "blocked-dates") {
    // Days as the owners picked them: the last day is the one before the
    // first free day (stored like a check-out).
    const blocks = await listDateBlocks();
    return toCsv(
      ["First Day", "Last Day", "Days", "Reason", "Created By"],
      blocks.map((b) => [b.checkIn, addDays(b.checkOut, -1), daysBetween(b.checkIn, b.checkOut), b.reason, b.createdBy]),
    );
  }

  // Cleaning — resolve each record's linked booking to a guest name.
  const [cleaning, bookings] = await Promise.all([listCleaning(), listBookings()]);
  const guestById = new Map(bookings.map((b) => [b.id, b.guestName]));
  return toCsv(
    ["Date", "Linked Booking (Guest)", "Cleaner Name", "Status", "Payment Amount", "Payment Status", "Notes"],
    cleaning.map((c) => [
      c.date,
      c.bookingId ? (guestById.get(c.bookingId) ?? "") : "",
      c.cleanerName,
      labelFor(CLEANING_STATUSES, c.status),
      c.paymentAmount,
      labelFor(CLEANING_PAYMENT_STATUSES, c.paymentStatus),
      c.notes,
    ]),
  );
}
