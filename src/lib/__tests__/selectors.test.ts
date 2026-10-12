import { describe, expect, it } from "vitest";

import { addDays, addMonths } from "../dates";
import {
  amountOwedByCleaner,
  bookingNetIncome,
  cleaningsKeptOnDelete,
  knownCleaners,
  moneyInBank,
  monthSeries,
  monthSummary,
  occupancyInMonth,
  pendingGuestPayments,
  unpaidCleanings,
  unrefundedExpenses,
  upcomingEvents,
} from "../selectors";
import type { Booking, CleaningRecord, Expense } from "../types";

const booking = (o: Partial<Booking>): Booking => ({
  id: "b",
  guestName: "Guest",
  source: "airbnb",
  checkIn: "2026-03-01",
  checkOut: "2026-03-04",
  guestsCount: 2,
  totalPayout: 3000,
  platformFee: 0,
  paymentStatus: "paid",
  contactInfo: "",
  notes: "",
  createdBy: "t",
  confirmationCode: null,
  hasPaymentScreenshot: false,
  paymentScreenshotMime: null,
  hasIdPhoto: false,
  idPhotoMime: null,
  ...o,
});

const cleaning = (o: Partial<CleaningRecord>): CleaningRecord => ({
  id: "c",
  date: "2026-03-04",
  bookingId: null,
  cleanerName: "",
  status: "completed",
  paymentAmount: 800,
  paymentStatus: "unpaid",
  notes: "",
  createdBy: "t",
  ...o,
});

const expense = (o: Partial<Expense>): Expense => ({
  id: "e",
  date: "2026-03-04",
  category: "supplies",
  description: "x",
  amount: 100,
  paidBy: "",
  receiptUrl: "",
  createdBy: "t",
  cleaningId: null,
  refundStatus: "refunded",
  ...o,
});

describe("collected profit by month", () => {
  it("counts only paid bookings and paid-out expenses, split by nights like income", () => {
    const summary = monthSummary(
      [
        booking({ id: "1", checkIn: "2026-03-01", checkOut: "2026-03-04", totalPayout: 3000, paymentStatus: "paid" }),
        booking({ id: "2", checkIn: "2026-03-10", checkOut: "2026-03-12", totalPayout: 2000, paymentStatus: "pending" }),
        booking({ id: "3", checkIn: "2026-03-20", checkOut: "2026-03-21", totalPayout: 1000, paymentStatus: "partial" }),
        // paid, half its nights in March
        booking({ id: "4", checkIn: "2026-03-31", checkOut: "2026-04-02", totalPayout: 800, paymentStatus: "paid" }),
      ],
      [
        expense({ id: "a", date: "2026-03-05", amount: 500, refundStatus: "refunded" }),
        expense({ id: "b", date: "2026-03-06", amount: 300, refundStatus: "owed" }),
        expense({ id: "c", date: "2026-04-01", amount: 999, refundStatus: "refunded" }), // other month
      ],
      "2026-03-15",
    );
    expect(summary.net).toBe(3000 + 2000 + 1000 + 400 - 800);
    expect(summary.collected).toBe(3000 + 400 - 500);
  });
});

describe("income by month", () => {
  it("splits a stay that crosses a month boundary by nights", () => {
    const b = booking({ checkIn: "2026-01-30", checkOut: "2026-02-03", totalPayout: 4000 });
    expect(monthSummary([b], [], "2026-01-10").income).toBe(2000);
    expect(monthSummary([b], [], "2026-02-10").income).toBe(2000);
  });

  it("uses the payout as the net — the platform fee is already deducted from it", () => {
    expect(bookingNetIncome(booking({ totalPayout: 8400, platformFee: 1050 }))).toBe(8400);
    expect(monthSummary([booking({ totalPayout: 3000, platformFee: 500 })], [], "2026-03-15").income).toBe(3000);
  });

  it("never loses or invents money: monthly shares add back up to the net", () => {
    // Deterministic pseudo-random stays, so a failure is reproducible.
    let seed = 42;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 300; i++) {
      const checkIn = addDays("2026-01-01", Math.floor(rand() * 300));
      const b = booking({
        checkIn,
        checkOut: addDays(checkIn, 1 + Math.floor(rand() * 45)),
        totalPayout: Math.round(rand() * 5_000_000) / 100,
        platformFee: Math.round(rand() * 200_000) / 100,
      });
      const total = monthSeries([b], [], addMonths("2026-01-01", 14), 15).reduce(
        (s, m) => s + m.income,
        0,
      );
      expect(total).toBeCloseTo(bookingNetIncome(b), 6);
    }
  });

  it("subtracts expenses to get profit", () => {
    const s = monthSummary(
      [booking({ totalPayout: 3000 })],
      [
        {
          id: "e",
          date: "2026-03-10",
          category: "utility",
          description: "x",
          amount: 500,
          paidBy: "",
          receiptUrl: "",
          createdBy: "t",
          cleaningId: null,
          refundStatus: "refunded",
        },
      ],
      "2026-03-15",
    );
    expect(s).toMatchObject({ income: 3000, expenses: 500, net: 2500 });
  });
});

describe("what is owed to cleaners", () => {
  it("counts only cleanings that are completed and unpaid", () => {
    const records = [
      cleaning({ id: "done", status: "completed", paymentAmount: 800 }),
      cleaning({ id: "future", status: "scheduled", paymentAmount: 800 }),
      cleaning({ id: "paid", status: "completed", paymentStatus: "paid" }),
    ];
    expect(unpaidCleanings(records).map((c) => c.id)).toEqual(["done"]);
    expect(amountOwedByCleaner(records)).toEqual([{ cleaner: "Unassigned", total: 800, count: 1 }]);
  });

  it("treats 'Ate Nene' and 'ate nene' as one cleaner", () => {
    const records = [
      cleaning({ id: "1", cleanerName: "Ate Nene" }),
      cleaning({ id: "2", cleanerName: " ate nene " }),
    ];
    expect(amountOwedByCleaner(records)).toEqual([{ cleaner: "Ate Nene", total: 1600, count: 2 }]);
    expect(knownCleaners(records)).toEqual(["Ate Nene"]);
  });
});

describe("guest payments", () => {
  it("lists pending and partial bookings, not paid ones", () => {
    const list = pendingGuestPayments([
      booking({ id: "a", paymentStatus: "paid" }),
      booking({ id: "b", paymentStatus: "pending" }),
      booking({ id: "c", paymentStatus: "partial" }),
    ]);
    expect(list.map((b) => b.id).sort()).toEqual(["b", "c"]);
  });
});

describe("unrefunded expenses", () => {
  it("lists only expenses someone is still owed for, oldest first", () => {
    const list = unrefundedExpenses([
      expense({ id: "later", date: "2026-05-01", refundStatus: "owed" }),
      expense({ id: "settled", refundStatus: "refunded" }),
      expense({ id: "earlier", date: "2026-01-01", refundStatus: "owed" }),
    ]);
    expect(list.map((e) => e.id)).toEqual(["earlier", "later"]);
  });
});

describe("upcoming events", () => {
  it("lists the departing guest before the arriving one on a turnover day", () => {
    const events = upcomingEvents(
      [
        booking({ id: "in", guestName: "Arriving", checkIn: "2026-05-10", checkOut: "2026-05-12" }),
        booking({ id: "out", guestName: "Leaving", checkIn: "2026-05-01", checkOut: "2026-05-10" }),
      ],
      30,
      "2026-05-01",
    ).filter((e) => e.date === "2026-05-10");
    expect(events.map((e) => e.kind)).toEqual(["check-out", "check-in"]);
  });
});

describe("occupancy", () => {
  it("leaves the check-out day free and counts double-booked nights once", () => {
    const { bookedNights, days } = occupancyInMonth(
      [
        booking({ id: "1", checkIn: "2026-03-01", checkOut: "2026-03-04" }), // nights 1,2,3
        booking({ id: "2", checkIn: "2026-03-03", checkOut: "2026-03-06" }), // overlaps night 3
      ],
      "2026-03-15",
    );
    expect(days).toHaveLength(31);
    expect(bookedNights).toBe(5); // 1,2,3,4,5
    expect(days.find((d) => d.date === "2026-03-06")?.booked).toBe(false);
  });
});

describe("money in the bank", () => {
  it("is paid booking income minus settled expenses, all time", () => {
    const result = moneyInBank(
      [
        booking({ id: "1", totalPayout: 9000, paymentStatus: "paid" }),
        booking({ id: "2", totalPayout: 6000, paymentStatus: "paid", checkIn: "2025-01-10", checkOut: "2025-01-12" }),
        booking({ id: "3", totalPayout: 5000, paymentStatus: "pending" }),
        booking({ id: "4", totalPayout: 4000, paymentStatus: "partial" }),
      ],
      [
        expense({ id: "a", amount: 1200, refundStatus: "refunded" }),
        expense({ id: "b", amount: 300, refundStatus: "refunded", date: "2025-01-15" }),
        expense({ id: "c", amount: 800, refundStatus: "owed" }),
      ],
    );
    expect(result).toEqual({ income: 15000, incomeCount: 2, spent: 1500, expenseCount: 2, balance: 13500 });
  });

  it("is zero with no data and can go negative", () => {
    expect(moneyInBank([], []).balance).toBe(0);
    expect(moneyInBank([], [expense({ amount: 500 })]).balance).toBe(-500);
  });
});

describe("cleanings kept when a booking is deleted", () => {
  it("keeps only the booking's cleanings that have work or money recorded", () => {
    const records = [
      cleaning({ id: "untouched", bookingId: "b1", status: "scheduled", paymentStatus: "unpaid" }),
      cleaning({ id: "imported", bookingId: "b1", status: "completed", paymentStatus: "paid" }),
      cleaning({ id: "assigned", bookingId: "b1", status: "scheduled", paymentStatus: "unpaid", cleanerName: "Ate Nene" }),
      cleaning({ id: "noted", bookingId: "b1", status: "scheduled", paymentStatus: "unpaid", notes: "bring linens" }),
      cleaning({ id: "other", bookingId: "b2", status: "completed", paymentStatus: "paid" }),
    ];
    expect(cleaningsKeptOnDelete(records, "b1").map((c) => c.id)).toEqual(["imported", "assigned", "noted"]);
  });
});
