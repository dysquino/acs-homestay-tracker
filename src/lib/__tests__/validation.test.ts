import { describe, expect, it } from "vitest";

import type { BookingInput, CleaningRecord, ExpenseInput } from "../types";
import {
  isValidISODate,
  validateBooking,
  validateBookingRequest,
  validateCleaning,
  validateExpense,
} from "../validation";

const booking: BookingInput = {
  guestName: "Maria",
  source: "airbnb",
  checkIn: "2026-03-01",
  checkOut: "2026-03-04",
  guestsCount: 2,
  totalPayout: 3000,
  platformFee: 100,
  paymentStatus: "pending",
  contactInfo: "",
  notes: "",
  createdBy: "Owner",
};
const expense: ExpenseInput = {
  date: "2026-03-01",
  category: "utility",
  description: "Meralco",
  amount: 100,
  paidBy: "Owner",
  receiptUrl: "",
  createdBy: "Owner",
  refundStatus: "refunded",
};
const clean: Omit<CleaningRecord, "id"> = {
  date: "2026-03-04",
  bookingId: null,
  cleanerName: "",
  status: "scheduled",
  paymentAmount: 800,
  paymentStatus: "unpaid",
  notes: "",
  createdBy: "Owner",
};

describe("dates", () => {
  it("accepts real calendar dates only", () => {
    expect(isValidISODate("2026-02-28")).toBe(true);
    expect(isValidISODate("2028-02-29")).toBe(true);
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("03/01/2026")).toBe(false);
    expect(isValidISODate("")).toBe(false);
  });
});

describe("bookings", () => {
  it("accepts a good booking", () => {
    expect(() => validateBooking(booking)).not.toThrow();
  });

  it.each([
    ["inverted dates", { checkIn: "2026-03-04", checkOut: "2026-03-01" }],
    ["zero-night stay", { checkOut: "2026-03-01" }],
    ["fractional guests", { guestsCount: 1.5 }],
    ["zero guests", { guestsCount: 0 }],
    ["negative payout", { totalPayout: -1 }],
    ["negative fee", { platformFee: -5 }],
    ["NaN payout", { totalPayout: NaN }],
    ["payout beyond the column", { totalPayout: 1e9 }],
    ["blank name", { guestName: "   " }],
    ["unknown source", { source: "expedia" as never }],
    ["unknown status", { paymentStatus: "refunded" as never }],
  ])("rejects %s", (_name, override) => {
    expect(() => validateBooking({ ...booking, ...override })).toThrow();
  });
});

describe("expenses", () => {
  it("accepts a good expense", () => {
    expect(() => validateExpense(expense)).not.toThrow();
  });
  it("accepts an expense paid straight from the bank account", () => {
    expect(() => validateExpense({ ...expense, paidBy: "Bank" })).not.toThrow();
  });
  it("rejects a bank-paid expense waiting for a refund — nobody is owed", () => {
    expect(() =>
      validateExpense({ ...expense, paidBy: "Bank", refundStatus: "owed" }),
    ).toThrow();
  });
  it.each([
    ["zero amount", { amount: 0 }],
    ["negative amount", { amount: -10 }],
    ["blank description", { description: " " }],
    ["bad category", { category: "gambling" as never }],
    ["bad date", { date: "2026-02-31" }],
    ["bad refund status", { refundStatus: "half" as never }],
  ])("rejects %s", (_name, override) => {
    expect(() => validateExpense({ ...expense, ...override })).toThrow();
  });
});

describe("cleanings", () => {
  it("accepts a good cleaning, including a zero fee", () => {
    expect(() => validateCleaning(clean)).not.toThrow();
    expect(() => validateCleaning({ ...clean, paymentAmount: 0 })).not.toThrow();
  });
  it.each([
    ["negative fee", { paymentAmount: -1 }],
    ["bad status", { status: "done" as never }],
    ["bad payment status", { paymentStatus: "maybe" as never }],
  ])("rejects %s", (_name, override) => {
    expect(() => validateCleaning({ ...clean, ...override })).toThrow();
  });
});

describe("validateBookingRequest (guests' booking page)", () => {
  const today = "2026-10-11";
  const ok = {
    guestName: "Maria",
    contactInfo: "0917 555 0143",
    checkIn: "2026-11-02",
    checkOut: "2026-11-05",
    guestsCount: 2,
    message: "",
  };
  const v = (o: Partial<typeof ok>) => () => validateBookingRequest({ ...ok, ...o }, today);

  it("accepts a normal request, including check-in today", () => {
    expect(v({})).not.toThrow();
    expect(v({ checkIn: today, checkOut: "2026-10-12" })).not.toThrow();
  });

  it("requires a name and a way to reach the guest", () => {
    expect(v({ guestName: "  " })).toThrow(/name/i);
    expect(v({ contactInfo: "" })).toThrow(/contact/i);
  });

  it("rejects past dates, inverted dates, long stays and far-future dates", () => {
    expect(v({ checkIn: "2026-10-10", checkOut: "2026-10-12" })).toThrow(/past/);
    expect(v({ checkOut: "2026-11-02" })).toThrow(/after check-in/);
    expect(v({ checkOut: "2026-12-03" })).toThrow(/at most 30 nights/);
    expect(v({ checkIn: "2027-11-01", checkOut: "2027-11-03" })).toThrow(/within the next year/);
  });

  it("limits guests and text length", () => {
    expect(v({ guestsCount: 0 })).toThrow(/guests/);
    expect(v({ guestsCount: 2.5 })).toThrow(/guests/);
    expect(v({ guestsCount: 21 })).toThrow(/guests/);
    expect(v({ message: "x".repeat(1001) })).toThrow(/too long/);
  });
});
