import {
  BOOKING_SOURCES,
  CLEANING_PAYMENT_STATUSES,
  CLEANING_STATUSES,
  EXPENSE_CATEGORIES,
  EXPENSE_REFUND_STATUSES,
  PAYMENT_STATUSES,
  type BookingInput,
  type CleaningRecord,
  type ExpenseInput,
} from "./types";

/**
 * Server-side input rules. The forms validate for a friendly UX, but server
 * actions are plain endpoints — anything can call them — so every write is
 * re-checked here before it reaches the database. Each validator throws an
 * Error naming the first problem it finds.
 */

const MAX_MONEY = 99_999_999.99; // Decimal(10, 2)
const MAX_TEXT = 2000;
const MAX_NAME = 200;

export class ValidationError extends Error {}

function fail(message: string): never {
  throw new ValidationError(message);
}

export function isValidISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

function date(value: unknown, field: string): void {
  if (!isValidISODate(value)) fail(`${field} must be a valid date.`);
}

function money(value: unknown, field: string, { min }: { min: "zero" | "positive" }): void {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${field} must be a number.`);
  if (min === "positive" ? value <= 0 : value < 0) {
    fail(min === "positive" ? `${field} must be greater than zero.` : `${field} cannot be negative.`);
  }
  if (value > MAX_MONEY) fail(`${field} is too large.`);
}

function text(value: unknown, field: string, { max, required }: { max: number; required?: boolean }): void {
  if (typeof value !== "string") fail(`${field} must be text.`);
  if (required && !value.trim()) fail(`${field} is required.`);
  if (value.length > max) fail(`${field} is too long.`);
}

function oneOf(value: unknown, options: { value: string }[], field: string): void {
  if (!options.some((o) => o.value === value)) fail(`${field} is not a valid option.`);
}

/** Validates a complete booking (for a patch, merge it over the stored row first). */
export function validateBooking(b: BookingInput): void {
  text(b.guestName, "Guest name", { max: MAX_NAME, required: true });
  oneOf(b.source, BOOKING_SOURCES, "Source");
  date(b.checkIn, "Check-in");
  date(b.checkOut, "Check-out");
  if (b.checkOut <= b.checkIn) fail("Check-out must be after check-in.");
  if (!Number.isInteger(b.guestsCount) || b.guestsCount < 1 || b.guestsCount > 1000) {
    fail("Number of guests must be a whole number of at least 1.");
  }
  money(b.totalPayout, "Total payout", { min: "zero" });
  money(b.platformFee, "Platform fee", { min: "zero" });
  oneOf(b.paymentStatus, PAYMENT_STATUSES, "Payment status");
  text(b.contactInfo, "Contact info", { max: MAX_NAME });
  text(b.notes, "Notes", { max: MAX_TEXT });
  text(b.createdBy, "Created by", { max: MAX_NAME });
}

export function validateExpense(e: ExpenseInput): void {
  date(e.date, "Date");
  oneOf(e.category, EXPENSE_CATEGORIES, "Category");
  text(e.description, "Description", { max: MAX_TEXT, required: true });
  money(e.amount, "Amount", { min: "positive" });
  text(e.paidBy, "Paid by", { max: MAX_NAME });
  text(e.receiptUrl, "Receipt", { max: MAX_TEXT });
  text(e.createdBy, "Created by", { max: MAX_NAME });
  oneOf(e.refundStatus, EXPENSE_REFUND_STATUSES, "Refund status");
}

export function validateCleaning(c: Omit<CleaningRecord, "id">): void {
  date(c.date, "Date");
  text(c.cleanerName, "Cleaner", { max: MAX_NAME });
  oneOf(c.status, CLEANING_STATUSES, "Status");
  money(c.paymentAmount, "Payment amount", { min: "zero" });
  oneOf(c.paymentStatus, CLEANING_PAYMENT_STATUSES, "Payment status");
  text(c.notes, "Notes", { max: MAX_TEXT });
  text(c.createdBy, "Created by", { max: MAX_NAME });
}
