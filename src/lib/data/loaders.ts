import "server-only";

import { toAmount, toCentavos } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import type { Booking, BookingRequest, CleaningRecord, Expense } from "@/lib/types";

import { bookingFromDb, bookingRequestFromDb, cleaningFromDb, expenseFromDb } from "./mappers";

/**
 * The plain reads behind the list actions, without the access check — for
 * callers that have already checked access their own way (the list actions
 * call requireSiteAccess; the scheduled notifications check CRON_SECRET).
 * Not a "use server" file, so none of this is reachable from a browser.
 */

export async function loadBookings(): Promise<Booking[]> {
  const rows = await prisma.booking.findMany({ orderBy: { checkIn: "asc" } });
  return rows.map(bookingFromDb);
}

export async function loadExpenses(): Promise<Expense[]> {
  // Active settlements only: a voided one releases its amount back, and this is
  // what decides whether the expense still needs a payout date.
  const rows = await prisma.expense.findMany({
    orderBy: { date: "desc" },
    include: { settlements: { where: { status: "ACTIVE" }, select: { amount: true } } },
  });
  return rows.map((row) => {
    let settled = 0n;
    for (const s of row.settlements) settled += toCentavos(s.amount.toString());
    return { ...expenseFromDb(row), settledAmount: toAmount(settled) };
  });
}

export async function loadCleaning(): Promise<CleaningRecord[]> {
  const rows = await prisma.cleaningSchedule.findMany({ orderBy: { date: "desc" } });
  return rows.map(cleaningFromDb);
}

export async function loadPendingRequests(): Promise<BookingRequest[]> {
  const rows = await prisma.bookingRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(bookingRequestFromDb);
}
