/**
 * Core domain types. Dates are stored as plain `YYYY-MM-DD` strings so that
 * everything stays timezone-agnostic (a check-in on the 3rd is the 3rd
 * regardless of where the manager's phone thinks it is).
 */

export type ISODate = string; // YYYY-MM-DD

export type BookingSource = "airbnb" | "direct";
export type PaymentStatus = "paid" | "pending" | "partial";

export type Booking = {
  id: string;
  guestName: string;
  source: BookingSource;
  checkIn: ISODate;
  checkOut: ISODate;
  guestsCount: number;
  totalPayout: number;
  platformFee: number;
  paymentStatus: PaymentStatus;
  contactInfo: string;
  notes: string;
  createdBy: string;
  /** Airbnb's reservation code — set only by the CSV import. */
  confirmationCode: string | null;
  /**
   * Whether a payment screenshot is on file — without dragging the bytes
   * through every list query. The bytes are fetched on demand via
   * `getBookingScreenshot(id)`. Copied from the BookingRequest on approval.
   */
  hasPaymentScreenshot: boolean;
  paymentScreenshotMime: string | null;
  /**
   * Whether an ID photo is on file. Bytes fetched on demand via
   * `getBookingIdPhoto(id)`. Copied from the BookingRequest on approval.
   */
  hasIdPhoto: boolean;
  idPhotoMime: string | null;
};

/** What a client may submit — `confirmationCode` is only set by the import.
 *  Photo fields are derived (set/cleared via their own server actions), so
 *  they aren't part of the input shape. */
export type BookingInput = Omit<
  Booking,
  | "id"
  | "confirmationCode"
  | "hasPaymentScreenshot"
  | "paymentScreenshotMime"
  | "hasIdPhoto"
  | "idPhotoMime"
>;

export type ExpenseCategory =
  | "utility"
  | "dues"
  | "repairs"
  | "supplies"
  | "cleaning"
  | "other";

export type Expense = {
  id: string;
  date: ISODate;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paidBy: string;
  receiptUrl: string;
  createdBy: string;
  /** Set when the app created this expense for a paid cleaning. Such
   * expenses are managed from the Cleaning page, not edited by hand. */
  cleaningId: string | null;
  /**
   * Whether whoever is in `paidBy` has been paid back for fronting this,
   * e.g. an owner buying supplies out of pocket. NOT whether the expense
   * itself is settled (it inherently is — that's what "expense" means).
   * Most expenses need no reimbursement, so "refunded" is the default.
   */
  refundStatus: ExpenseRefundStatus;
};

export type ExpenseRefundStatus = "refunded" | "owed";

export const EXPENSE_REFUND_STATUSES: {
  value: ExpenseRefundStatus;
  label: string;
}[] = [
  { value: "refunded", label: "Refunded" },
  { value: "owed", label: "Not yet refunded" },
];

/** What a client may submit — `cleaningId` is only ever set by the server. */
export type ExpenseInput = Omit<Expense, "id" | "cleaningId">;

/** The fixed roster who can be recorded as having paid an expense. */
export const PAID_BY: { value: string; label: string }[] = [
  { value: "Dys", label: "Dys" },
  { value: "Kalur", label: "Kalur" },
  { value: "Rayhla", label: "Rayhla" },
  { value: "Gervin", label: "Gervin" },
  { value: "DK", label: "DK" },
];

export type CleaningStatus = "scheduled" | "completed";
export type CleaningPaymentStatus = "paid" | "unpaid";

export type CleaningRecord = {
  id: string;
  date: ISODate;
  bookingId: string | null;
  cleanerName: string;
  status: CleaningStatus;
  paymentAmount: number;
  paymentStatus: CleaningPaymentStatus;
  notes: string;
  createdBy: string;
};

/**
 * Dates closed with no guest (maintenance, owners' own use). `checkIn` /
 * `checkOut` work like a booking's — `checkOut` is the first free day — so
 * the same overlap rules apply.
 */
export type DateBlock = {
  id: string;
  checkIn: ISODate;
  checkOut: ISODate;
  reason: string;
  createdBy: string;
};

export type DateBlockInput = Omit<DateBlock, "id">;

export type BookingRequestStatus = "pending" | "approved" | "declined";

/** A stay a guest asked for through the private booking link. */
export type BookingRequest = {
  id: string;
  guestName: string;
  contactInfo: string;
  checkIn: ISODate;
  checkOut: ISODate;
  guestsCount: number;
  message: string;
  status: BookingRequestStatus;
  /** The booking it became, once approved. */
  bookingId: string | null;
  decidedBy: string | null;
  /**
   * Whether a payment screenshot is on file — without dragging the bytes
   * through every list query. The bytes are fetched on demand via
   * `getBookingRequestScreenshot(id)` when the owner clicks "View".
   */
  hasPaymentScreenshot: boolean;
  paymentScreenshotMime: string | null;
  /**
   * Whether an ID photo is on file. Bytes fetched on demand via
   * `getBookingRequestIdPhoto(id)`. Required by the guest-side form
   * for seamless check-in, but the server doesn't enforce it (old clients
   * stay compatible).
   */
  hasIdPhoto: boolean;
  idPhotoMime: string | null;
  /** When the guest sent it (ISO timestamp). */
  createdAt: string;
};

/** What a guest submits from the booking page. */
export type BookingRequestInput = Pick<
  BookingRequest,
  "guestName" | "contactInfo" | "checkIn" | "checkOut" | "guestsCount" | "message"
>;

export type User = {
  id: string;
  name: string;
  email: string;
};

/* ------------------------------------------------------------------ */
/* Option lists — single source of truth for dropdowns and badges.    */
/* ------------------------------------------------------------------ */

export const BOOKING_SOURCES: { value: BookingSource; label: string }[] = [
  { value: "airbnb", label: "Airbnb" },
  { value: "direct", label: "Direct" },
];

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
];

export const EXPENSE_CATEGORIES: {
  value: ExpenseCategory;
  label: string;
}[] = [
  { value: "utility", label: "Utility bill" },
  { value: "dues", label: "Association dues" },
  { value: "repairs", label: "Repairs" },
  { value: "supplies", label: "Supplies" },
  { value: "cleaning", label: "Cleaning payment" },
  { value: "other", label: "Other" },
];

export const CLEANING_STATUSES: { value: CleaningStatus; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
];

export const CLEANING_PAYMENT_STATUSES: {
  value: CleaningPaymentStatus;
  label: string;
}[] = [
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
];

export function labelFor<T extends string>(
  options: { value: T; label: string }[],
  value: T,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}
