import { describe, expect, it } from "vitest";

import { directBookingsIcal, finishedUnimported, parseAirbnbIcal, unmatchedReservations } from "../airbnb-ical";

// Synthetic — same shape as Airbnb's export: CRLF, folded lines, two kinds of events.
const feed = [
  "BEGIN:VCALENDAR",
  "PRODID;X-RICAL-TZSOURCE=TZINFO:-//Airbnb Inc//Hosting Calendar 1.0//EN",
  "CALSCALE:GREGORIAN",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "DTEND;VALUE=DATE:20261012",
  "DTSTART;VALUE=DATE:20261010",
  "UID:aaa@airbnb.com",
  "DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMAAAAAAA1\\nPhone Num",
  " ber (Last 4 Digits): 1234",
  "SUMMARY:Reserved",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTEND;VALUE=DATE:20261113",
  "DTSTART;VALUE=DATE:20261111",
  "UID:bbb@airbnb.com",
  "SUMMARY:Airbnb (Not available)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTEND;VALUE=DATE:20261023",
  "DTSTART;VALUE=DATE:20261021",
  "UID:ccc@airbnb.com",
  "DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMBBBBBBB2",
  "SUMMARY:Reserved",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const booking = (o: { source?: "airbnb" | "direct"; checkIn: string; checkOut: string; confirmationCode?: string | null }) => ({
  source: o.source ?? "airbnb",
  checkIn: o.checkIn,
  checkOut: o.checkOut,
  confirmationCode: o.confirmationCode ?? null,
});

describe("parseAirbnbIcal", () => {
  it("reads reservations (dates + code) and ignores 'Not available' blocks", () => {
    expect(parseAirbnbIcal(feed)).toEqual([
      { code: "HMAAAAAAA1", checkIn: "2026-10-10", checkOut: "2026-10-12" },
      { code: "HMBBBBBBB2", checkIn: "2026-10-21", checkOut: "2026-10-23" },
    ]);
  });

  it("keeps a 'Reserved' event without a reservation link, and skips broken dates", () => {
    const noLink = "BEGIN:VEVENT\nDTSTART;VALUE=DATE:20261201\nDTEND;VALUE=DATE:20261203\nSUMMARY:Reserved\nEND:VEVENT";
    const broken = "BEGIN:VEVENT\nDTSTART;VALUE=DATE:20261205\nDTEND;VALUE=DATE:20261205\nSUMMARY:Reserved\nEND:VEVENT";
    expect(parseAirbnbIcal(noLink + broken)).toEqual([{ code: null, checkIn: "2026-12-01", checkOut: "2026-12-03" }]);
  });

  it("returns nothing for an empty or unrelated file", () => {
    expect(parseAirbnbIcal("")).toEqual([]);
    expect(parseAirbnbIcal("<html>nope</html>")).toEqual([]);
  });
});

describe("unmatchedReservations", () => {
  const reservations = parseAirbnbIcal(feed);
  const today = "2026-10-01";

  it("blocks reservations that aren't in the app", () => {
    expect(unmatchedReservations(reservations, [], today).map((r) => r.code)).toEqual(["HMAAAAAAA1", "HMBBBBBBB2"]);
  });

  it("treats a booking with the same code, or an Airbnb booking with the same dates, as already in the app", () => {
    const bookings = [
      booking({ checkIn: "2026-01-01", checkOut: "2026-01-02", confirmationCode: "HMAAAAAAA1" }), // code match (dates may differ)
      booking({ checkIn: "2026-10-21", checkOut: "2026-10-23" }), // hand-entered, no code, same dates
    ];
    expect(unmatchedReservations(reservations, bookings, today)).toEqual([]);
  });

  it("does NOT treat a direct booking on the same dates as the Airbnb reservation (that's a real clash)", () => {
    const bookings = [booking({ source: "direct", checkIn: "2026-10-21", checkOut: "2026-10-23" })];
    expect(unmatchedReservations(reservations, bookings, today).map((r) => r.code)).toEqual(["HMAAAAAAA1", "HMBBBBBBB2"]);
  });

  it("drops stays that are over", () => {
    expect(unmatchedReservations(reservations, [], "2026-10-15").map((r) => r.code)).toEqual(["HMBBBBBBB2"]);
  });
});

describe("finishedUnimported", () => {
  const reservations = parseAirbnbIcal(feed); // Oct 10–12 and Oct 21–23

  it("lists stays that have ended and aren't in the app", () => {
    expect(finishedUnimported(reservations, [], "2026-10-15").map((r) => r.code)).toEqual(["HMAAAAAAA1"]);
    expect(finishedUnimported(reservations, [], "2026-10-12").map((r) => r.code)).toEqual(["HMAAAAAAA1"]); // check-out day
  });

  it("leaves out stays already in the app (by code, or same dates for an Airbnb booking)", () => {
    expect(finishedUnimported(reservations, [booking({ checkIn: "2026-10-10", checkOut: "2026-10-12" })], "2026-10-30")).toEqual([
      { code: "HMBBBBBBB2", checkIn: "2026-10-21", checkOut: "2026-10-23" },
    ]);
    expect(finishedUnimported(reservations, [booking({ checkIn: "2026-01-01", checkOut: "2026-01-02", confirmationCode: "HMBBBBBBB2" }), booking({ checkIn: "2026-10-10", checkOut: "2026-10-12" })], "2026-10-30")).toEqual([]);
  });
});

describe("directBookingsIcal", () => {
  const ics = directBookingsIcal(
    [{ id: "b1", checkIn: "2026-11-02", checkOut: "2026-11-05" }],
    new Date("2026-10-11T09:30:00Z"),
  );

  it("is a valid all-day iCal feed with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261102\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261105\r\n");
    expect(ics).toContain("UID:b1@acs-homestay-tracker\r\n");
    expect(ics).toContain("DTSTAMP:20261011T093000Z\r\n");
  });

  it("carries no names — just 'Direct booking'", () => {
    expect(ics).toContain("SUMMARY:Direct booking");
  });

  it("round-trips through the parser as dates (the format Airbnb reads)", () => {
    const back = ics.replace("SUMMARY:Direct booking", "SUMMARY:Reserved");
    expect(parseAirbnbIcal(back)).toEqual([{ code: null, checkIn: "2026-11-02", checkOut: "2026-11-05" }]);
  });
});
