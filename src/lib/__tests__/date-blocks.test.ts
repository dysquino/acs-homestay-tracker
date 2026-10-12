import { describe, expect, it } from "vitest";

import { directBookingsIcal } from "../airbnb-ical";
import { blockDays, blockFromDays, dateBlockAsBooking, isDateBlock, validateDateBlock } from "../date-blocks";
import { findConflicts } from "../selectors";

const block = { id: "x1", checkIn: "2026-10-20", checkOut: "2026-10-23", reason: "Maintenance", createdBy: "Dys" };

describe("blocked dates", () => {
  it("days picked (inclusive) become nights, like a stay", () => {
    expect(blockFromDays("2026-10-20", "2026-10-22")).toEqual({ checkIn: "2026-10-20", checkOut: "2026-10-23" });
    expect(blockDays(blockFromDays("2026-10-20", "2026-10-20"))).toBe(1);
  });

  it("blocks bookings on its days but allows same-day turnovers at both ends", () => {
    const taken = [dateBlockAsBooking(block)];
    expect(findConflicts(taken, "2026-10-18", "2026-10-21")).toHaveLength(1);
    expect(findConflicts(taken, "2026-10-18", "2026-10-20")).toHaveLength(0); // check out the morning it starts
    expect(findConflicts(taken, "2026-10-23", "2026-10-25")).toHaveLength(0); // check in the day after it ends
    expect(isDateBlock(taken[0])).toBe(true);
    expect(taken[0].guestName).toBe("Blocked — Maintenance");
  });

  it("validates", () => {
    const base = { checkIn: "2026-10-20", checkOut: "2026-10-23", reason: "", createdBy: "Dys" };
    expect(() => validateDateBlock(base)).not.toThrow();
    expect(() => validateDateBlock({ ...base, checkOut: "2026-10-20" })).toThrow(/before/);
    expect(() => validateDateBlock({ ...base, checkOut: "2028-01-01" })).toThrow(/at most/);
    expect(() => validateDateBlock({ ...base, checkIn: "oops" })).toThrow();
  });

  it("goes out in the Airbnb feed as 'Not available', with no reason", () => {
    const ics = directBookingsIcal([
      { id: "b1", checkIn: "2026-10-10", checkOut: "2026-10-12" },
      { id: "x1", checkIn: "2026-10-20", checkOut: "2026-10-23", blocked: true },
    ]);
    expect(ics).toContain("SUMMARY:Direct booking");
    expect(ics).toContain("UID:x1@acs-homestay-tracker\r\nDTSTAMP");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261023\r\nSUMMARY:Not available");
    expect(ics).not.toContain("Maintenance");
  });
});
