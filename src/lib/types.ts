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
};

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
