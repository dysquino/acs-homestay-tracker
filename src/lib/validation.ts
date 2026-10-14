import { toCentavos } from "./finance";
import {
  BOOKING_PAYMENT_METHODS,
  BOOKING_SOURCES,
  CLEANING_PAYMENT_STATUSES,
  CLEANING_STATUSES,
  EXPENSE_CATEGORIES,
  EXPENSE_REFUND_STATUSES,
  PAYMENT_STATUSES,
  SETTLEMENT_TYPES,
  type BookingInput,
  type BookingPaymentInput,
  type BookingRequestInput,
  type CleaningRecord,
  type ExpenseInput,
  type ExpenseSettlementInput,
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

/**
 * A money amount on the financial-event models, checked through the exact
 * centavos helpers rather than by range comparison alone.
 *
 * A `number` can pass `> 0 && <= MAX` and still be un-schedulable: `1234.565`
 * has to become either ₱1,234.56 or ₱1,234.57 depending on the rounding rule,
 * which is exactly the centavo drift §8.6 forbids. So we convert first and let
 * the conversion reject anything that isn't exactly two decimals.
 */
function exactMoney(value: unknown, field: string, { min }: { min: "zero" | "positive" }): void {
  money(value, field, { min });
  try {
    toCentavos(value as number);
  } catch {
    fail(`${field} can't have more than 2 decimal places.`);
  }
}

function id(value: unknown, field: string, { required }: { required: boolean }): void {
  if (value === undefined || value === null || value === "") {
    if (required) fail(`${field} is required.`);
    return;
  }
  text(value, field, { max: MAX_NAME, required: true });
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

/**
 * One receipt against a booking. Amount must be positive — direction is implied
 * by the row type, never by a sign (§4.2), so a negative here is a mistake
 * rather than a refund. Refunds are ExpenseSettlements.
 */
export function validateBookingPayment(p: BookingPaymentInput): void {
  id(p.bookingId, "Booking", { required: true });
  exactMoney(p.amount, "Amount", { min: "positive" });
  date(p.receivedDate, "Received date");
  oneOf(p.method, BOOKING_PAYMENT_METHODS, "Method");
  text(p.reference, "Reference", { max: MAX_TEXT });
  text(p.notes, "Notes", { max: MAX_TEXT });
  text(p.createdBy, "Created by", { max: MAX_NAME });
}

/**
 * One outflow against an expense — or a guest refund against a booking. Which
 * of the two is decided by `settlementType`, so the pair of ids is validated
 * against it rather than accepted as-is: a refund must name a booking and must
 * not name an expense, and everything else is the reverse (§4.2).
 */
export function validateExpenseSettlement(s: ExpenseSettlementInput): void {
  exactMoney(s.amount, "Amount", { min: "positive" });
  date(s.paidDate, "Paid date");
  oneOf(s.settlementType, SETTLEMENT_TYPES, "Settlement type");
  text(s.reference, "Reference", { max: MAX_TEXT });
  text(s.notes, "Notes", { max: MAX_TEXT });
  text(s.createdBy, "Created by", { max: MAX_NAME });

  if (s.settlementType === "guest_refund") {
    id(s.refundForBookingId, "Booking", { required: true });
    if (s.expenseId) fail("A guest refund is against a booking, not an expense.");
    if (s.reimbursedTo) fail("A guest refund isn't a reimbursement — leave who was reimbursed blank.");
    return;
  }

  id(s.expenseId, "Expense", { required: true });
  if (s.refundForBookingId) fail("Only a guest refund is against a booking.");
  // Only a reimbursement has someone to reimburse; anything else carrying a
  // name here would double-report a payee already on the expense.
  if (s.settlementType === "owner_reimbursement") {
    text(s.reimbursedTo, "Reimbursed to", { max: MAX_NAME, required: true });
  } else if (s.reimbursedTo) {
    fail("Only a reimbursement records who was reimbursed.");
  }
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

export const MAX_REQUEST_NIGHTS = 30;
const MAX_REQUEST_DAYS_AHEAD = 365;
const MAX_REQUEST_GUESTS = 20;

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * A guest's booking request, from a public page — so stricter than the
 * owners' booking form: required contact, no past dates, a cap on length and
 * how far ahead. `today` is the homestay's local date (Asia/Manila).
 */
export function validateBookingRequest(r: BookingRequestInput, today: string): void {
  text(r.guestName, "Your name", { max: 100, required: true });
  text(r.contactInfo, "Contact number or email", { max: 100, required: true });
  text(r.message, "Message", { max: 1000 });
  date(r.checkIn, "Check-in");
  date(r.checkOut, "Check-out");
  if (r.checkOut <= r.checkIn) fail("Check-out must be after check-in.");
  if (r.checkIn < today) fail("Check-in can't be in the past.");
  if (r.checkIn > addDaysISO(today, MAX_REQUEST_DAYS_AHEAD)) fail("Please choose dates within the next year.");
  if (r.checkOut > addDaysISO(r.checkIn, MAX_REQUEST_NIGHTS)) {
    fail(`Stays can be at most ${MAX_REQUEST_NIGHTS} nights — message us for longer stays.`);
  }
  if (!Number.isInteger(r.guestsCount) || r.guestsCount < 1 || r.guestsCount > MAX_REQUEST_GUESTS) {
    fail(`Number of guests must be between 1 and ${MAX_REQUEST_GUESTS}.`);
  }
}
