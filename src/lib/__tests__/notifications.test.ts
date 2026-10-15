import { describe, expect, it } from "vitest";

import type { ActionInput } from "../action-items";
import {
  airbnbNotification,
  morningSummary,
  requestNotification,
  reservationKey,
  unannouncedReservations,
} from "../notifications";
import type { Booking, CleaningRecord } from "../types";

const TODAY = "2026-10-15";
const booking = (o: Partial<Booking>): Booking => ({
  id: "b",
  guestName: "Guest",
  source: "direct",
  checkIn: "2026-10-20",
  checkOut: "2026-10-22",
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
} as Booking);
const cleaning = (o: Partial<CleaningRecord>): CleaningRecord => ({
  id: "c",
  date: TODAY,
  bookingId: null,
  cleanerName: "Ate Nene",
  status: "scheduled",
  paymentAmount: 500,
  paymentStatus: "unpaid",
  notes: "",
  createdBy: "t",
  ...o,
} as CleaningRecord);
const input = (o: Partial<ActionInput>): ActionInput => ({
  bookings: [],
  cleaning: [],
  expenses: [],
  bookingRequests: [],
  airbnbFinished: [],
  airbnbError: null,
  today: TODAY,
  now: new Date("2026-10-15T08:00:00+08:00"),
  ...o,
});

describe("notifications", () => {
  it("booking request: who, when, how many", () => {
    expect(requestNotification({ guestName: "Maria", checkIn: "2026-11-01", checkOut: "2026-11-03", guestsCount: 2 })).toEqual({
      title: "New booking request",
      body: "Maria · Nov 1 – Nov 3 · 2 nights · 2 guests",
      url: "/bookings",
      tag: "booking-request",
    });
  });

  it("morning summary: nothing on → no notification", () => {
    expect(morningSummary(input({ bookings: [booking({})] }))).toBeNull();
  });

  it("morning summary: check-ins, check-outs, then to-dos", () => {
    const n = morningSummary(
      input({
        bookings: [
          booking({ id: "in", guestName: "Dylan", checkIn: TODAY, checkOut: "2026-10-17" }),
          booking({ id: "out", guestName: "Claire", checkIn: "2026-10-13", checkOut: TODAY }),
        ],
        cleaning: [cleaning({ cleanerName: "" })],
      }),
    )!;
    expect(n.title).toBe("Today at ACs Homestay · 1 overdue");
    expect(n.body.split("\n")).toEqual(["Check-in: Dylan (2 nights)", "Check-out: Claire", "To do: Assign a cleaner"]);
    expect(n.url).toBe("/");
  });

  it("morning summary: names three to-dos, then '+ n more'; leaves out 'later' ones", () => {
    const n = morningSummary(
      input({
        cleaning: ["a", "b", "c", "d"].map((id, i) => cleaning({ id, date: `2026-10-1${i}`, status: "scheduled" })),
        expenses: [{ id: "e", date: TODAY, category: "supplies", description: "x", amount: 100, paidBy: "DK", receiptUrl: "", createdBy: "t", cleaningId: null, refundStatus: "owed", settledAmount: 0 } as never],
      }),
    )!;
    expect(n.body).toBe("To do: Mark cleaning done; Mark cleaning done; Mark cleaning done + 1 more");
    expect(n.body).not.toContain("Refund");
  });

  it("Airbnb: only reservations not announced yet; one notification for several", () => {
    const a = { code: "HMAAAAAAA1", checkIn: "2026-11-05", checkOut: "2026-11-07" };
    const b = { code: null, checkIn: "2026-10-30", checkOut: "2026-11-01" };
    expect(reservationKey(b)).toBe("2026-10-30_2026-11-01");
    expect(unannouncedReservations([a, b], new Set(["HMAAAAAAA1"]))).toEqual([b]);
    expect(airbnbNotification([])).toBeNull();
    expect(airbnbNotification([a])!.title).toBe("New Airbnb reservation");
    const two = airbnbNotification([a, b])!;
    expect(two.title).toBe("2 new Airbnb reservations");
    expect(two.body).toBe("Oct 30 – Nov 1 · 2 nights\nNov 5 – Nov 7 · 2 nights");
  });
});
