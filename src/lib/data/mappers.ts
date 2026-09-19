import "server-only";

import type {
  Booking as DbBooking,
  CleaningSchedule as DbCleaning,
  Expense as DbExpense,
  BookingSource as DbBookingSource,
  PaymentStatus as DbPaymentStatus,
  ExpenseCategory as DbExpenseCategory,
  CleaningStatus as DbCleaningStatus,
  CleaningPaymentStatus as DbCleaningPaymentStatus,
} from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";

import type {
  Booking,
  BookingInput,
  CleaningPaymentStatus,
  CleaningRecord,
  CleaningStatus,
  Expense,
  ExpenseCategory,
  ExpenseInput,
  ISODate,
  PaymentStatus,
  BookingSource,
} from "@/lib/types";

/**
 * Translation layer between Prisma rows (UPPER_CASE enums, DateTime,
 * Decimal) and the frontend's domain types (lowercase enums, YYYY-MM-DD
 * strings, plain numbers). Kept separate from `dates.ts`, which is
 * deliberately local-timezone for browser display — storage needs a
 * timezone-independent round trip regardless of what timezone the server
 * process happens to run in.
 */

export function dateToISO(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function isoToDate(iso: ISODate): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function decimalToNumber(value: Decimal): number {
  return Number(value);
}

const BOOKING_SOURCE_TO_DB: Record<BookingSource, DbBookingSource> = {
  airbnb: "AIRBNB",
  direct: "DIRECT",
};
const BOOKING_SOURCE_FROM_DB: Record<DbBookingSource, BookingSource> = {
  AIRBNB: "airbnb",
  DIRECT: "direct",
};

const PAYMENT_STATUS_TO_DB: Record<PaymentStatus, DbPaymentStatus> = {
  paid: "PAID",
  pending: "PENDING",
  partial: "PARTIAL",
};
const PAYMENT_STATUS_FROM_DB: Record<DbPaymentStatus, PaymentStatus> = {
  PAID: "paid",
  PENDING: "pending",
  PARTIAL: "partial",
};

const EXPENSE_CATEGORY_TO_DB: Record<ExpenseCategory, DbExpenseCategory> = {
  utility: "UTILITY_BILL",
  dues: "ASSOCIATION_DUES",
  repairs: "REPAIRS",
  supplies: "SUPPLIES",
  cleaning: "CLEANING_PAYMENT",
  other: "OTHER",
};
const EXPENSE_CATEGORY_FROM_DB: Record<DbExpenseCategory, ExpenseCategory> = {
  UTILITY_BILL: "utility",
  ASSOCIATION_DUES: "dues",
  REPAIRS: "repairs",
  SUPPLIES: "supplies",
  CLEANING_PAYMENT: "cleaning",
  OTHER: "other",
};

const CLEANING_STATUS_TO_DB: Record<CleaningStatus, DbCleaningStatus> = {
  scheduled: "SCHEDULED",
  completed: "COMPLETED",
};
const CLEANING_STATUS_FROM_DB: Record<DbCleaningStatus, CleaningStatus> = {
  SCHEDULED: "scheduled",
  COMPLETED: "completed",
};

const CLEANING_PAYMENT_STATUS_TO_DB: Record<
  CleaningPaymentStatus,
  DbCleaningPaymentStatus
> = {
  paid: "PAID",
  unpaid: "UNPAID",
};
const CLEANING_PAYMENT_STATUS_FROM_DB: Record<
  DbCleaningPaymentStatus,
  CleaningPaymentStatus
> = {
  PAID: "paid",
  UNPAID: "unpaid",
};

export function bookingFromDb(row: DbBooking): Booking {
  return {
    id: row.id,
    guestName: row.guestName,
    source: BOOKING_SOURCE_FROM_DB[row.source],
    checkIn: dateToISO(row.checkIn),
    checkOut: dateToISO(row.checkOut),
    guestsCount: row.guestsCount,
    totalPayout: decimalToNumber(row.totalPayout),
    platformFee: decimalToNumber(row.platformFee),
    paymentStatus: PAYMENT_STATUS_FROM_DB[row.paymentStatus],
    contactInfo: row.contactInfo,
    notes: row.notes,
    createdBy: row.createdBy,
    confirmationCode: row.confirmationCode,
  };
}

/** Never writes `confirmationCode` — only the CSV import sets it. */
export function bookingToDb(input: BookingInput) {
  return {
    guestName: input.guestName,
    source: BOOKING_SOURCE_TO_DB[input.source],
    checkIn: isoToDate(input.checkIn),
    checkOut: isoToDate(input.checkOut),
    guestsCount: input.guestsCount,
    totalPayout: input.totalPayout,
    platformFee: input.platformFee,
    paymentStatus: PAYMENT_STATUS_TO_DB[input.paymentStatus],
    contactInfo: input.contactInfo,
    notes: input.notes,
    createdBy: input.createdBy,
  };
}

export function bookingPatchToDb(patch: Partial<BookingInput>) {
  const out: Record<string, unknown> = {};
  if (patch.guestName !== undefined) out.guestName = patch.guestName;
  if (patch.source !== undefined) out.source = BOOKING_SOURCE_TO_DB[patch.source];
  if (patch.checkIn !== undefined) out.checkIn = isoToDate(patch.checkIn);
  if (patch.checkOut !== undefined) out.checkOut = isoToDate(patch.checkOut);
  if (patch.guestsCount !== undefined) out.guestsCount = patch.guestsCount;
  if (patch.totalPayout !== undefined) out.totalPayout = patch.totalPayout;
  if (patch.platformFee !== undefined) out.platformFee = patch.platformFee;
  if (patch.paymentStatus !== undefined)
    out.paymentStatus = PAYMENT_STATUS_TO_DB[patch.paymentStatus];
  if (patch.contactInfo !== undefined) out.contactInfo = patch.contactInfo;
  if (patch.notes !== undefined) out.notes = patch.notes;
  if (patch.createdBy !== undefined) out.createdBy = patch.createdBy;
  return out;
}

export function expenseFromDb(row: DbExpense): Expense {
  return {
    id: row.id,
    date: dateToISO(row.date),
    category: EXPENSE_CATEGORY_FROM_DB[row.category],
    description: row.description,
    amount: decimalToNumber(row.amount),
    paidBy: row.paidBy,
    receiptUrl: row.receiptUrl,
    createdBy: row.createdBy,
    cleaningId: row.cleaningId,
  };
}

/** Never writes `cleaningId` — only the cleaning sync links an expense. */
export function expenseToDb(input: ExpenseInput) {
  return {
    date: isoToDate(input.date),
    category: EXPENSE_CATEGORY_TO_DB[input.category],
    description: input.description,
    amount: input.amount,
    paidBy: input.paidBy,
    receiptUrl: input.receiptUrl,
    createdBy: input.createdBy,
  };
}

export function expensePatchToDb(patch: Partial<ExpenseInput>) {
  const out: Record<string, unknown> = {};
  if (patch.date !== undefined) out.date = isoToDate(patch.date);
  if (patch.category !== undefined)
    out.category = EXPENSE_CATEGORY_TO_DB[patch.category];
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.amount !== undefined) out.amount = patch.amount;
  if (patch.paidBy !== undefined) out.paidBy = patch.paidBy;
  if (patch.receiptUrl !== undefined) out.receiptUrl = patch.receiptUrl;
  if (patch.createdBy !== undefined) out.createdBy = patch.createdBy;
  return out;
}

export function cleaningFromDb(row: DbCleaning): CleaningRecord {
  return {
    id: row.id,
    date: dateToISO(row.date),
    bookingId: row.bookingId,
    cleanerName: row.cleanerName,
    status: CLEANING_STATUS_FROM_DB[row.status],
    paymentAmount: decimalToNumber(row.paymentAmount),
    paymentStatus: CLEANING_PAYMENT_STATUS_FROM_DB[row.paymentStatus],
    notes: row.notes,
    createdBy: row.createdBy,
  };
}

export function cleaningToDb(input: Omit<CleaningRecord, "id">) {
  return {
    date: isoToDate(input.date),
    bookingId: input.bookingId,
    cleanerName: input.cleanerName,
    status: CLEANING_STATUS_TO_DB[input.status],
    paymentAmount: input.paymentAmount,
    paymentStatus: CLEANING_PAYMENT_STATUS_TO_DB[input.paymentStatus],
    notes: input.notes,
    createdBy: input.createdBy,
  };
}

export function cleaningPatchToDb(patch: Partial<Omit<CleaningRecord, "id">>) {
  const out: Record<string, unknown> = {};
  if (patch.date !== undefined) out.date = isoToDate(patch.date);
  if (patch.bookingId !== undefined) out.bookingId = patch.bookingId;
  if (patch.cleanerName !== undefined) out.cleanerName = patch.cleanerName;
  if (patch.status !== undefined)
    out.status = CLEANING_STATUS_TO_DB[patch.status];
  if (patch.paymentAmount !== undefined)
    out.paymentAmount = patch.paymentAmount;
  if (patch.paymentStatus !== undefined)
    out.paymentStatus = CLEANING_PAYMENT_STATUS_TO_DB[patch.paymentStatus];
  if (patch.notes !== undefined) out.notes = patch.notes;
  if (patch.createdBy !== undefined) out.createdBy = patch.createdBy;
  return out;
}
