import { describe, expect, it } from "vitest";

import { payoutDateDiverges, payoutMonthLabel } from "../payout-date";

describe("payoutDateDiverges", () => {
  it("is silent in the ordinary case, same month", () => {
    expect(payoutDateDiverges("2026-10-14", "2026-10-02")).toBe(false);
  });

  it("warns when a payout crosses the month boundary", () => {
    expect(payoutDateDiverges("2026-11-01", "2026-10-31")).toBe(true);
  });

  it("warns when an old record is paid today", () => {
    expect(payoutDateDiverges("2026-10-14", "2026-08-20")).toBe(true);
  });

  it("treats an unrecorded payout as not divergent, not as a warning", () => {
    expect(payoutDateDiverges("", "2026-10-02")).toBe(false);
  });

  it("ignores the day, because only the month decides the period", () => {
    expect(payoutDateDiverges("2026-10-01", "2026-10-31")).toBe(false);
  });

  it("crosses a year boundary", () => {
    expect(payoutDateDiverges("2027-01-05", "2026-12-30")).toBe(true);
    expect(payoutDateDiverges("2026-12-31", "2027-01-01")).toBe(true);
  });

  it("warns rather than hides when a value can't be read as a month", () => {
    expect(payoutDateDiverges("nonsense", "2026-10-02")).toBe(true);
  });
});

describe("payoutMonthLabel", () => {
  it("says 'this month' when the payout lands where we already are", () => {
    expect(payoutMonthLabel("2026-10-14", "2026-10-02")).toBe("this");
  });

  it("says 'that month' when it lands somewhere else", () => {
    expect(payoutMonthLabel("2026-08-20", "2026-10-14")).toBe("that");
  });
});