import { describe, expect, it } from "vitest";

import { addDays, addMonths } from "../dates";
import {
  amountOwedByCleaner,
  bookingNetIncome,
  knownCleaners,
  monthSeries,
  monthSummary,
  occupancyInMonth,
  pendingGuestPayments,
  unpaidCleanings,
  upcomingEvents,
} from "../selectors";
import type { Booking, CleaningRecord } from "../types";

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
