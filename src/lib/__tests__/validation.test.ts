import { describe, expect, it } from "vitest";

import type { BookingInput, CleaningRecord, ExpenseInput } from "../types";
import {
  isValidISODate,
  validateBooking,
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
  it.each([
    ["zero amount", { amount: 0 }],
    ["negative amount", { amount: -10 }],
    ["blank description", { description: " " }],
    ["bad category", { category: "gambling" as never }],
    ["bad date", { date: "2026-02-31" }],
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
