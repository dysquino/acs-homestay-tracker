import "server-only";

import type {
  Booking as DbBooking,
  DateBlock as DbDateBlock,
  BookingPayment as DbBookingPayment,
  BookingPaymentMethod as DbBookingPaymentMethod,
  BookingPaymentStatus as DbBookingPaymentStatus,
  BookingRequest as DbBookingRequest,
  CleaningSchedule as DbCleaning,
  Expense as DbExpense,
  ExpenseSettlement as DbExpenseSettlement,
  ExpenseSettlementStatus as DbExpenseSettlementStatus,
  BookingSource as DbBookingSource,
  PaymentStatus as DbPaymentStatus,
  ExpenseCategory as DbExpenseCategory,
  CleaningStatus as DbCleaningStatus,
  CleaningPaymentStatus as DbCleaningPaymentStatus,
  ExpenseRefundStatus as DbExpenseRefundStatus,
  SettlementType as DbSettlementType,
} from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";

import type {
  Booking,
  DateBlock,
  BookingInput,
  BookingPayment,
  BookingPaymentInput,
  BookingPaymentMethod,
  BookingPaymentStatus,
  BookingRequest,
  CleaningPaymentStatus,
  CleaningRecord,
  CleaningStatus,
  Expense,
  ExpenseCategory,
  ExpenseInput,
  ExpenseRefundStatus,
  ExpenseSettlement,
  ExpenseSettlementInput,
  ExpenseSettlementStatus,
  ISODate,
  PaymentStatus,
  SettlementType,
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
  overpaid: "OVERPAID",
};
const PAYMENT_STATUS_FROM_DB: Record<DbPaymentStatus, PaymentStatus> = {
  PAID: "paid",
  PENDING: "pending",
  PARTIAL: "partial",
  OVERPAID: "overpaid",
};

// No *_STATUS_TO_DB map for BookingPayment or ExpenseSettlement, unlike the
// other enums here: status is server-owned (only the void actions write it),
// so a client can never supply a value that needs translating.

const BOOKING_PAYMENT_STATUS_FROM_DB: Record<DbBookingPaymentStatus, BookingPaymentStatus> = {
  ACTIVE: "active",
  VOIDED: "voided",
  REFUNDED: "refunded",
};

const BOOKING_PAYMENT_METHOD_TO_DB: Record<BookingPaymentMethod, DbBookingPaymentMethod> = {
  airbnb_payout: "AIRBNB_PAYOUT",
  bank_transfer: "BANK_TRANSFER",
  instapay: "INSTAPAY",
  cash_deposit: "CASH_DEPOSIT",
  other: "OTHER",
};
const BOOKING_PAYMENT_METHOD_FROM_DB: Record<DbBookingPaymentMethod, BookingPaymentMethod> = {
  AIRBNB_PAYOUT: "airbnb_payout",
  BANK_TRANSFER: "bank_transfer",
  INSTAPAY: "instapay",
  CASH_DEPOSIT: "cash_deposit",
  OTHER: "other",
};

const SETTLEMENT_TYPE_TO_DB: Record<SettlementType, DbSettlementType> = {
  direct_vendor_payment: "DIRECT_VENDOR_PAYMENT",
  owner_reimbursement: "OWNER_REIMBURSEMENT",
  cleaner_payment: "CLEANER_PAYMENT",
  guest_refund: "GUEST_REFUND",
  other: "OTHER",
};
const SETTLEMENT_TYPE_FROM_DB: Record<DbSettlementType, SettlementType> = {
  DIRECT_VENDOR_PAYMENT: "direct_vendor_payment",
  OWNER_REIMBURSEMENT: "owner_reimbursement",
  CLEANER_PAYMENT: "cleaner_payment",
  GUEST_REFUND: "guest_refund",
  OTHER: "other",
};

const EXPENSE_SETTLEMENT_STATUS_FROM_DB: Record<
  DbExpenseSettlementStatus,
  ExpenseSettlementStatus
> = {
  ACTIVE: "active",
  VOIDED: "voided",
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

const EXPENSE_REFUND_STATUS_TO_DB: Record<ExpenseRefundStatus, DbExpenseRefundStatus> = {
  refunded: "REFUNDED",
  owed: "OWED",
};
const EXPENSE_REFUND_STATUS_FROM_DB: Record<DbExpenseRefundStatus, ExpenseRefundStatus> = {
  REFUNDED: "refunded",
  OWED: "owed",
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
    // Photo bytes live on the row; the list query selects these flag fields
    // but not the bytes themselves — owners fetch via getBookingScreenshot
    // / getBookingIdPhoto when they actually open the modal.
    hasPaymentScreenshot: row.paymentScreenshot !== null,
    paymentScreenshotMime: row.paymentScreenshotMime,
    hasIdPhoto: row.idPhoto !== null,
    idPhotoMime: row.idPhotoMime,
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
    refundStatus: EXPENSE_REFUND_STATUS_FROM_DB[row.refundStatus],
    // Derived from the settlements relation, which this base row doesn't carry.
    // `listExpenses` includes it and overrides this with the real total.
    settledAmount: 0,
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
    refundStatus: EXPENSE_REFUND_STATUS_TO_DB[input.refundStatus],
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
  if (patch.refundStatus !== undefined)
    out.refundStatus = EXPENSE_REFUND_STATUS_TO_DB[patch.refundStatus];
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

export function bookingRequestFromDb(row: DbBookingRequest): BookingRequest {
  return {
    id: row.id,
    guestName: row.guestName,
    contactInfo: row.contactInfo,
    checkIn: dateToISO(row.checkIn),
    checkOut: dateToISO(row.checkOut),
    guestsCount: row.guestsCount,
    message: row.message,
    status: row.status.toLowerCase() as BookingRequest["status"],
    bookingId: row.bookingId,
    decidedBy: row.decidedBy,
    // The bytes live on the row; we don't pull them through this mapper — the
    // list query doesn't even select them. The owner fetches via
    // getBookingRequestScreenshot when they actually want to look at one.
    hasPaymentScreenshot: row.paymentScreenshot !== null,
    paymentScreenshotMime: row.paymentScreenshotMime,
    hasIdPhoto: row.idPhoto !== null,
    idPhotoMime: row.idPhotoMime,
    createdAt: row.createdAt.toISOString(),
  };
}

export function dateBlockFromDb(row: DbDateBlock): DateBlock {
  return {
    id: row.id,
    checkIn: dateToISO(row.startDate),
    checkOut: dateToISO(row.endDate),
    reason: row.reason,
    createdBy: row.createdBy,
  };
}

/* ------------------------------------------------------------------ */
/* BookingPayment — one actual receipt of money against a booking.      */
/* ------------------------------------------------------------------ */

export function bookingPaymentFromDb(
  row: Omit<DbBookingPayment, "paymentScreenshot"> & {
    paymentScreenshot?: Uint8Array | null;
  },
): BookingPayment {
  return {
    id: row.id,
    bookingId: row.bookingId,
    amount: decimalToNumber(row.amount),
    receivedDate: dateToISO(row.receivedDate),
    method: BOOKING_PAYMENT_METHOD_FROM_DB[row.method],
    reference: row.reference,
    notes: row.notes,
    // List queries intentionally omit the bytea column; MIME is the lightweight
    // presence flag because every writer stores and clears both fields together.
    hasPaymentScreenshot: row.paymentScreenshotMime !== null,
    paymentScreenshotMime: row.paymentScreenshotMime,
    status: BOOKING_PAYMENT_STATUS_FROM_DB[row.status],
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidedBy: row.voidedBy,
  };
}

/** Never writes `status` or the void fields — those are server-owned (§7.13). */
export function bookingPaymentToDb(input: BookingPaymentInput) {
  return {
    bookingId: input.bookingId,
    amount: input.amount,
    receivedDate: isoToDate(input.receivedDate),
    method: BOOKING_PAYMENT_METHOD_TO_DB[input.method],
    reference: input.reference,
    notes: input.notes,
    createdBy: input.createdBy,
  };
}

export function bookingPaymentPatchToDb(patch: Partial<BookingPaymentInput>) {
  const out: Record<string, unknown> = {};
  if (patch.bookingId !== undefined) out.bookingId = patch.bookingId;
  if (patch.amount !== undefined) out.amount = patch.amount;
  if (patch.receivedDate !== undefined) out.receivedDate = isoToDate(patch.receivedDate);
  if (patch.method !== undefined) out.method = BOOKING_PAYMENT_METHOD_TO_DB[patch.method];
  if (patch.reference !== undefined) out.reference = patch.reference;
  if (patch.notes !== undefined) out.notes = patch.notes;
  if (patch.createdBy !== undefined) out.createdBy = patch.createdBy;
  return out;
}

/* ------------------------------------------------------------------ */
/* ExpenseSettlement — one actual outflow against an expense or refund. */
/* ------------------------------------------------------------------ */

export function expenseSettlementFromDb(row: DbExpenseSettlement): ExpenseSettlement {
  return {
    id: row.id,
    expenseId: row.expenseId,
    refundForBookingId: row.refundForBookingId,
    amount: decimalToNumber(row.amount),
    paidDate: dateToISO(row.paidDate),
    settlementType: SETTLEMENT_TYPE_FROM_DB[row.settlementType],
    reimbursedTo: row.reimbursedTo,
    reference: row.reference,
    notes: row.notes,
    status: EXPENSE_SETTLEMENT_STATUS_FROM_DB[row.status],
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidedBy: row.voidedBy,
  };
}

/**
 * Never writes `status` or the void fields. Which of `expenseId` /
 * `refundForBookingId` lands is decided by the write action from
 * `settlementType`, so a client can't attach a guest refund to an unrelated
 * expense.
 */
export function expenseSettlementToDb(input: ExpenseSettlementInput) {
  const isRefund = input.settlementType === "guest_refund";
  return {
    expenseId: isRefund ? null : (input.expenseId ?? null),
    refundForBookingId: isRefund ? (input.refundForBookingId ?? null) : null,
    amount: input.amount,
    paidDate: isoToDate(input.paidDate),
    settlementType: SETTLEMENT_TYPE_TO_DB[input.settlementType],
    reimbursedTo: input.reimbursedTo,
    reference: input.reference,
    notes: input.notes,
    createdBy: input.createdBy,
  };
}

export function expenseSettlementPatchToDb(patch: Partial<ExpenseSettlementInput>) {
  const out: Record<string, unknown> = {};
  if (patch.amount !== undefined) out.amount = patch.amount;
  if (patch.paidDate !== undefined) out.paidDate = isoToDate(patch.paidDate);
  if (patch.settlementType !== undefined)
    out.settlementType = SETTLEMENT_TYPE_TO_DB[patch.settlementType];
  if (patch.reimbursedTo !== undefined) out.reimbursedTo = patch.reimbursedTo;
  if (patch.reference !== undefined) out.reference = patch.reference;
  if (patch.notes !== undefined) out.notes = patch.notes;
  if (patch.createdBy !== undefined) out.createdBy = patch.createdBy;
  // Deliberately no expenseId / refundForBookingId: retargeting a settlement
  // at a different source record would rewrite which cost it settles. Void and
  // re-create instead.
  return out;
}
