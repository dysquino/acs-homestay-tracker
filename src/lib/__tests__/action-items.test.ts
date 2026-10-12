import { describe, expect, it } from "vitest";

import { buildActionItems, type ActionInput } from "../action-items";
import type { Booking, BookingRequest, CleaningRecord, Expense } from "../types";

const TODAY = "2026-10-12";
const NOW = new Date("2026-10-12T10:00:00+08:00");

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
});
const cleaning = (o: Partial<CleaningRecord>): CleaningRecord => ({
  id: "c",
  date: "2026-10-20",
  bookingId: null,
  cleanerName: "Ate Nene",
  status: "scheduled",
  paymentAmount: 500,
  paymentStatus: "unpaid",
  notes: "",
  createdBy: "t",
  ...o,
});
const expense = (o: Partial<Expense>): Expense => ({
  id: "e",
  date: "2026-10-01",
  category: "supplies",
  description: "x",
  amount: 100,
  paidBy: "DK",
  receiptUrl: "",
  createdBy: "t",
  cleaningId: null,
  refundStatus: "refunded",
  ...o,
});
const request = (o: Partial<BookingRequest>): BookingRequest => ({
  id: "r",
  guestName: "Maria",
  contactInfo: "0917",
  checkIn: "2026-11-01",
  checkOut: "2026-11-03",
  guestsCount: 2,
  message: "",
  status: "pending",
  bookingId: null,
  decidedBy: null,
  hasPaymentScreenshot: false,
  paymentScreenshotMime: null,
  hasIdPhoto: false,
  idPhotoMime: null,
  createdAt: "2026-10-12T05:00:00+08:00",
  ...o,
});
const build = (o: Partial<ActionInput>) =>
  buildActionItems({
    bookings: [],
    cleaning: [],
    expenses: [],
    bookingRequests: [],
    airbnbFinished: [],
    airbnbError: null,
    today: TODAY,
    now: NOW,
    ...o,
  });
const ids = (o: Partial<ActionInput>) => build(o).map((i) => `${i.id}:${i.urgency}`);

describe("action items", () => {
  it("is empty when nothing needs doing", () => {
    expect(build({ bookings: [booking({})], cleaning: [cleaning({ status: "completed", paymentStatus: "paid" })] })).toEqual([]);
  });

  it("1. booking requests: one row; overdue once the oldest waited over 24 h", () => {
    expect(ids({ bookingRequests: [request({ id: "a" }), request({ id: "b" })] })).toEqual(["requests:soon"]);
    expect(build({ bookingRequests: [request({ id: "a" }), request({ id: "b" })] })[0].title).toBe("2 booking requests waiting");
    expect(ids({ bookingRequests: [request({ createdAt: "2026-10-11T08:00:00+08:00" })] })).toEqual(["requests:overdue"]);
    expect(ids({ bookingRequests: [request({ status: "declined" })] })).toEqual([]);
  });

  it("2. direct guest unpaid: soon within 3 days of check-in, overdue once checked in", () => {
    expect(ids({ bookings: [booking({ paymentStatus: "pending", checkIn: "2026-10-15" })] })).toEqual(["pay-b:soon"]);
    expect(ids({ bookings: [booking({ paymentStatus: "partial", checkIn: "2026-10-10" })] })).toEqual(["pay-b:overdue"]);
    expect(ids({ bookings: [booking({ paymentStatus: "pending", checkIn: "2026-10-16" })] })).toEqual([]); // 4 days out
    expect(ids({ bookings: [booking({ paymentStatus: "pending", checkIn: "2026-10-10", source: "airbnb" })] })).toEqual([]);
  });

  it("3. ₱0 payout: asks for the payout instead of a payment", () => {
    expect(ids({ bookings: [booking({ totalPayout: 0, paymentStatus: "pending", checkIn: "2026-10-13" })] })).toEqual(["payout-b:later"]);
    expect(ids({ bookings: [booking({ totalPayout: 0, checkIn: "2026-10-12" })] })).toEqual(["payout-b:soon"]);
  });

  it("4. unassigned cleaning in the next 3 days; overdue if today", () => {
    expect(ids({ cleaning: [cleaning({ cleanerName: "", date: "2026-10-14" })] })).toEqual(["assign-c:soon"]);
    expect(ids({ cleaning: [cleaning({ cleanerName: " ", date: TODAY })] })).toEqual(["assign-c:overdue"]);
    expect(ids({ cleaning: [cleaning({ cleanerName: "", date: "2026-10-16" })] })).toEqual([]);
  });

  it("5. a past cleaning still 'scheduled' must be marked done (not also 'assign')", () => {
    expect(ids({ cleaning: [cleaning({ cleanerName: "", date: "2026-10-11" })] })).toEqual(["done-c:overdue"]);
  });

  it("6. done but unpaid → pay the cleaner", () => {
    const items = build({ cleaning: [cleaning({ status: "completed", date: "2026-10-05" })] });
    expect(items.map((i) => `${i.id}:${i.urgency}`)).toEqual(["paycleaner-c:soon"]);
    expect(items[0].title).toBe("Pay Ate Nene ₱500");
  });

  it("7. unrefunded expenses: one row per person, 'soon' once older than 14 days", () => {
    const items = build({
      expenses: [
        expense({ id: "1", refundStatus: "owed", paidBy: "DK", amount: 800, date: "2026-10-10" }),
        expense({ id: "2", refundStatus: "owed", paidBy: "DK", amount: 200.5, date: "2026-09-20" }),
        expense({ id: "3", refundStatus: "owed", paidBy: "Kalur", amount: 50, date: "2026-10-11" }),
        expense({ id: "4", refundStatus: "refunded", paidBy: "Kalur", amount: 999 }),
      ],
    });
    expect(items.map((i) => `${i.id}:${i.urgency}`)).toEqual(["refund-DK:soon", "refund-Kalur:later"]);
    expect(items[0].title).toBe("Refund DK ₱1,000.5");
    expect(items[0].action).toEqual({ type: "link", href: "/expenses?refund=owed&paidBy=DK", label: "Review" });
  });

  it("8. finished Airbnb stays not imported; 9. Airbnb sync failure", () => {
    const finished = [{ code: "HMAAAAAAA1", checkIn: "2026-10-05", checkOut: "2026-10-07" }];
    expect(ids({ airbnbFinished: finished })).toEqual(["airbnb-import:later"]);
    expect(build({ airbnbFinished: finished })[0].title).toBe("Import 1 finished Airbnb stay");
    expect(ids({ airbnbError: "Airbnb answered HTTP 503" })).toEqual(["airbnb-sync:overdue"]);
  });

  it("orders overdue → soon → later, earliest first within each", () => {
    expect(
      ids({
        bookings: [booking({ id: "x", paymentStatus: "pending", checkIn: "2026-10-14" })],
        cleaning: [
          cleaning({ id: "late", date: "2026-10-09" }),
          cleaning({ id: "later", date: "2026-10-11" }),
          cleaning({ id: "a", cleanerName: "", date: "2026-10-13" }),
        ],
        expenses: [expense({ refundStatus: "owed", date: "2026-10-10" })],
      }),
    ).toEqual(["done-late:overdue", "done-later:overdue", "assign-a:soon", "pay-x:soon", "refund-DK:later"]);
  });
});
