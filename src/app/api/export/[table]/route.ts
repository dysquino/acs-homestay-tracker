import { NextRequest } from "next/server";

import { listBookings } from "@/lib/data/bookings";
import { listExpenses } from "@/lib/data/expenses";
import { listCleaning } from "@/lib/data/cleaning";
import { csvResponse, toCsv } from "@/lib/csv";
import { nightCount, today } from "@/lib/dates";
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

const TABLES = ["bookings", "expenses", "cleaning"] as const;
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
