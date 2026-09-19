import { describe, expect, it } from "vitest";

import { parseAirbnbCsv, parseAirbnbDate, parseCsv, planImport } from "../airbnb-import";
import type { Booking } from "../types";

// Synthetic — same columns and quirks as Airbnb's "Transaction history" export.
const HEADER =
  "Date,Arriving by date,Type,Confirmation code,Booking date,Start date,End date,Nights,Guest,Listing,Details,Reference code,Currency,Amount,Paid out,Service fee,Fast pay fee,Cleaning fee,Gross earnings,Airbnb remitted tax,Earnings year";
const payout = '08/29/2026,09/04/2026,Payout,,,,,,,,"Transfer to Someone, 0200 (PHP)",,PHP,,20502.98,,,,,,';
const reservation = (o: { code?: string; guest?: string; start?: string; end?: string; amount?: string; fee?: string; cleaning?: string; currency?: string; type?: string } = {}) =>
  `08/29/2026,,${o.type ?? "Reservation"},${o.code ?? "HMAAAAAAA1"},08/10/2026,${o.start ?? "08/28/2026"},${o.end ?? "09/14/2026"},17,${o.guest ?? "Test Guest"},Some Listing,,,${o.currency ?? "PHP"},${o.amount ?? "20502.98"},,"${o.fee ?? "4,307.02"}",,${o.cleaning ?? "585.00"},24348.53,0.00,2026`;
const csv = (...lines: string[]) => [HEADER, ...lines].join("\n");

const stored = (o: Partial<Booking>): Booking => ({
  id: "b1", guestName: "Test Guest", source: "airbnb", checkIn: "2026-08-28", checkOut: "2026-09-14",
  guestsCount: 2, totalPayout: 20502.98, platformFee: 0, paymentStatus: "paid", contactInfo: "", notes: "",
  createdBy: "Owner", confirmationCode: null, ...o,
});

describe("csv reading", () => {
  it("handles quoted commas, escaped quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });
  it("reads Airbnb dates as MM/DD/YYYY and rejects impossible ones", () => {
    expect(parseAirbnbDate("08/28/2026")).toBe("2026-08-28");
    expect(parseAirbnbDate("13/01/2026")).toBeNull();
    expect(parseAirbnbDate("02/30/2026")).toBeNull();
    expect(parseAirbnbDate("2026-08-28")).toBeNull();
  });
});

describe("parseAirbnbCsv", () => {
  it("takes reservations only, and payout = Airbnb's amount (the cleaning fee is not subtracted)", () => {
    const { rows, problems } = parseAirbnbCsv(csv(payout, reservation()));
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      {
        confirmationCode: "HMAAAAAAA1",
        guestName: "Test Guest",
        checkIn: "2026-08-28",
        checkOut: "2026-09-14",
        totalPayout: 20502.98, // exactly Airbnb's amount
        platformFee: 4307.02, // "4,307.02" — comma inside quotes
      },
    ]);
  });

  it("sorts by check-in", () => {
    const { rows } = parseAirbnbCsv(
      csv(reservation({ code: "HMLATERRRR", start: "09/01/2026", end: "09/03/2026" }), reservation({ code: "HMEARLIERR", start: "01/01/2026", end: "01/03/2026" })),
    );
    expect(rows.map((r) => r.confirmationCode)).toEqual(["HMEARLIERR", "HMLATERRRR"]);
  });

  it("combines a reservation that Airbnb split over several rows", () => {
    const { rows, problems } = parseAirbnbCsv(
      csv(reservation({ amount: "1000.00", fee: "30.00", cleaning: "100.00", start: "03/01/2026", end: "03/03/2026" }),
          reservation({ amount: "500.00", fee: "15.00", cleaning: "0.00", start: "03/03/2026", end: "03/04/2026" })),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ totalPayout: 1500, platformFee: 45, checkIn: "2026-03-01", checkOut: "2026-03-04" });
    expect(problems[0]).toMatch(/combined/);
  });

  it.each([
    ["a refund", { amount: "-500.00" }, /refund or cancellation/],
    ["a foreign currency", { currency: "USD" }, /not PHP/],
    ["no confirmation code", { code: "" }, /no confirmation code/],
    ["a bad date", { start: "31/08/2026" }, /unreadable dates/],
    ["inverted dates", { start: "09/14/2026", end: "08/28/2026" }, /isn't after check-in/],
  ])("skips %s, and says so", (_n, o, message) => {
    const { rows, problems } = parseAirbnbCsv(csv(reservation(o)));
    expect(rows).toEqual([]);
    expect(problems.join(" ")).toMatch(message);
  });

  it("ignores the cleaning fee entirely — whatever it is, the payout is the amount", () => {
    for (const cleaning of ["0.00", "200.00", "585.00", "99999.00"]) {
      const { rows } = parseAirbnbCsv(csv(reservation({ amount: "1000.00", cleaning })));
      expect(rows[0].totalPayout).toBe(1000);
    }
  });

  it("explains a file that isn't an Airbnb export", () => {
    const { rows, problems } = parseAirbnbCsv("name,amount\nbob,5");
    expect(rows).toEqual([]);
    expect(problems[0]).toMatch(/missing columns/);
    expect(parseAirbnbCsv("").problems[0]).toMatch(/empty/);
  });
});

describe("planImport", () => {
  const { rows } = parseAirbnbCsv(csv(reservation()));

  it("creates a booking that isn't in the app yet", () => {
    expect(planImport(rows, [])[0].action).toBe("create");
  });

  it("updates a hand-entered booking with the same guest and dates (case-insensitive)", () => {
    const plan = planImport(rows, [stored({ guestName: "test guest" })]);
    expect(plan[0]).toMatchObject({ action: "update", bookingId: "b1" });
  });

  it("skips a confirmation code that was imported before", () => {
    expect(planImport(rows, [stored({ confirmationCode: "HMAAAAAAA1" })])[0].action).toBe("skip");
  });

  it("does not link a booking that already carries a different code", () => {
    expect(planImport(rows, [stored({ confirmationCode: "HMOTHER123" })])[0].action).toBe("create");
  });

  it("warns about an overlap with another booking", () => {
    const plan = planImport(rows, [stored({ id: "other", guestName: "Someone Else", checkIn: "2026-09-10", checkOut: "2026-09-12" })]);
    expect(plan[0].conflicts.map((c) => c.id)).toEqual(["other"]);
  });
});
