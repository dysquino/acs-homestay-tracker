import type { CleaningSchedule } from "@prisma/client";

/**
 * The expense a paid cleaning produces. Shared by the sync
 * (cleaning-expense.ts) and the CSV import (import.ts) — kept in its own
 * file, apart from the actual database write, so this pure formatting logic
 * is unit-testable without a database (no `server-only` import here; only
 * a type from `@prisma/client`, erased at compile time).
 */
export function cleaningExpenseFields(cleaning: CleaningSchedule, guestName?: string) {
  const cleaner = cleaning.cleanerName.trim() || "Unassigned";
  return {
    date: cleaning.date,
    category: "CLEANING_PAYMENT" as const,
    description: `Cleaning payment — ${cleaner}${guestName ? ` (after ${guestName})` : ""}`,
    amount: cleaning.paymentAmount,
    // This is money the shared fund paid straight to the cleaner — never a
    // personal expense someone is owed back for, so it's always settled.
    refundStatus: "REFUNDED" as const,
  };
}
