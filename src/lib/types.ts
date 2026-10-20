/**
 * Core domain types. Dates are stored as plain `YYYY-MM-DD` strings so that
 * everything stays timezone-agnostic (a check-in on the 3rd is the 3rd
 * regardless of where the manager's phone thinks it is).
 */

export type ISODate = string; // YYYY-MM-DD

export type BookingSource = "airbnb" | "direct";
/**
 * Cached from the booking's payments — see RECONCILIATION_SPEC §12.1.
 * `overpaid` means received exceeds `totalPayout`: not an error, but it needs
 * a refund or a recorded explanation before it clears.
 */
export type PaymentStatus = "paid" | "pending" | "partial" | "overpaid";

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

/** Lifecycle of a single receipt. VOIDED means it was entered in error. */
export type BookingPaymentStatus = "active" | "voided" | "refunded";

export type BookingPaymentMethod =
  | "airbnb_payout"
  | "bank_transfer"
  | "instapay"
  | "cash_deposit"
  | "other";

/**
 * One actual receipt of money against a booking — a deposit, an installment,
 * an Airbnb payout, the final balance. A booking can have none, one, or many;
 * their sum is what the booking has received (RECONCILIATION_SPEC §4.2).
 */
export type BookingPayment = {
  id: string;
  bookingId: string;
  amount: number;
  /** When the money arrived — not the stay date. A July stay paid in June is a June receipt. */
  receivedDate: ISODate;
  method: BookingPaymentMethod;
  /** Bank reference or Airbnb confirmation code when known. */
  reference: string;
  notes: string;
  /** Proof is fetched on demand so payment lists never send image bytes. */
  hasPaymentScreenshot: boolean;
  paymentScreenshotMime: string | null;
  status: BookingPaymentStatus;
  createdBy: string;
  createdAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
};

/** What a client may submit. `status` and the void fields are server-owned. */
export type BookingPaymentInput = Pick<
  BookingPayment,
  "bookingId" | "amount" | "receivedDate" | "method" | "reference" | "notes" | "createdBy"
>;

export type SettlementType =
  | "direct_vendor_payment"
  | "owner_reimbursement"
  | "cleaner_payment"
  | "guest_refund"
  | "other";

export type ExpenseSettlementStatus = "active" | "voided";

/**
 * One actual movement of money out of the homestay bank. An expense records
 * what a cost was for; a settlement records when the money actually left, which
 * may be much later (or later at all — an owner-fronted cost has no settlement
 * until they're reimbursed). See RECONCILIATION_SPEC §4.5.
 */
export type ExpenseSettlement = {
  id: string;
  /** Set for every type except `guest_refund`. */
  expenseId: string | null;
  /** Set only for `guest_refund` — the booking the money went back to. */
  refundForBookingId: string | null;
  amount: number;
  /** When the money left the bank, not when the cost was incurred. */
  paidDate: ISODate;
  settlementType: SettlementType;
  /** Who was reimbursed, for `owner_reimbursement`. */
  reimbursedTo: string;
  reference: string;
  notes: string;
  status: ExpenseSettlementStatus;
  createdBy: string;
  createdAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
};

/**
 * What a client may submit. The server derives which of `expenseId` /
 * `refundForBookingId` is set from `settlementType`, so neither is part of the
 * input — a client can't point a guest refund at an arbitrary expense.
 */
export type ExpenseSettlementInput = Pick<
  ExpenseSettlement,
  "amount" | "paidDate" | "settlementType" | "reimbursedTo" | "reference" | "notes" | "createdBy"
> & {
  /** Required for every type except `guest_refund`, which needs a bookingId instead. */
  expenseId?: string | null;
  /** Required when `settlementType` is `guest_refund`. */
  refundForBookingId?: string | null;
};

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

  /**
   * How much of this expense has been recorded as actually leaving the bank.
   *
   * Distinct from `refundStatus`, which answers "is the person who fronted
   * this still owed?" and is `refunded` for the majority of expenses whether or
   * not the money has moved. Without this figure an expense can be fully paid
   * and still have no payout date on record, which is invisible from the list.
   */
  settledAmount: number;
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
/** Derived from settlements, never submitted — excluded from the input shape. */
export type ExpenseInput = Omit<Expense, "id" | "cleaningId" | "settledAmount">;

/** The fixed roster who can be recorded as having paid an expense. */
export const PAID_BY: { value: string; label: string }[] = [
  { value: "Dys", label: "Dys" },
  { value: "Kalur", label: "Kalur" },
  { value: "Rayhla", label: "Rayhla" },
  { value: "Gervin", label: "Gervin" },
  { value: "DK", label: "DK" },
];

/**
 * The homestay bank account, as a payer in its own right — money that left the
 * account directly, so nobody fronted it and nobody is owed back.
 */
export const BANK_PAYER = "Bank";

/**
 * Who an expense can be recorded as paid by: the five people, plus the bank
 * account.
 *
 * Bank is deliberately kept out of `PAID_BY` above. That list is also the
 * roster of people who use this tracker (identity.tsx) and the only ones who
 * can be reimbursed (the "who was paid" pickers) — a bank account is neither a
 * user nor someone to hand money back to.
 */
export const PAID_BY_OPTIONS: { value: string; label: string }[] = [
  ...PAID_BY,
  { value: BANK_PAYER, label: BANK_PAYER },
];

/** Whether this payer is the bank account rather than one of the people. */
export function isBankPayer(paidBy: string): boolean {
  return paidBy.trim() === BANK_PAYER;
}

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
  { value: "overpaid", label: "Overpaid" },
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

/** The physical room's readiness — shown as a colour-coded pill on the dashboard. */
export type RoomStatus = "clean" | "dirty" | "in_use";

export const ROOM_STATUSES: { value: RoomStatus; label: string }[] = [
  { value: "clean", label: "Clean" },
  { value: "dirty", label: "Dirty" },
  { value: "in_use", label: "In-Use" },
];

export const BOOKING_PAYMENT_METHODS: {
  value: BookingPaymentMethod;
  label: string;
}[] = [
  { value: "airbnb_payout", label: "Airbnb payout" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "instapay", label: "InstaPay" },
  { value: "cash_deposit", label: "Cash deposit" },
  { value: "other", label: "Other" },
];

export const SETTLEMENT_TYPES: { value: SettlementType; label: string }[] = [
  { value: "direct_vendor_payment", label: "Paid vendor directly" },
  { value: "owner_reimbursement", label: "Reimbursed an owner" },
  { value: "cleaner_payment", label: "Paid a cleaner" },
  { value: "guest_refund", label: "Refunded a guest" },
  { value: "other", label: "Other" },
];

export function labelFor<T extends string>(
  options: { value: T; label: string }[],
  value: T,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}
