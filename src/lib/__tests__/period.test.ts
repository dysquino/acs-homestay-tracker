import { describe, expect, it } from "vitest";

import {
  canStep,
  inPeriod,
  monthRange,
  periodLabel,
  periodRange,
  presetPeriod,
  samePeriod,
  stayInPeriod,
  stepPeriod,
} from "../period";

const TODAY = "2026-10-12";

describe("period", () => {
  it("presets cover the expected dates", () => {
    expect(periodRange(presetPeriod("thisMonth", TODAY), TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange(presetPeriod("lastMonth", TODAY), TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(periodRange(presetPeriod("nextMonth", TODAY), TODAY)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodRange(presetPeriod("last3", TODAY), TODAY)).toEqual({ from: "2026-08-01", to: "2026-10-31" });
    expect(periodRange(presetPeriod("lastYear", TODAY), TODAY)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(periodRange(presetPeriod("upcoming", TODAY), TODAY)).toEqual({ from: TODAY, to: null });
    expect(periodRange(presetPeriod("all", TODAY), TODAY)).toEqual({ from: null, to: null });
  });

  it("labels", () => {
    expect(periodLabel(presetPeriod("thisMonth", TODAY))).toBe("October 2026");
    expect(periodLabel(presetPeriod("thisYear", TODAY))).toBe("2026");
    expect(periodLabel(presetPeriod("last3", TODAY))).toBe("Aug – Oct 2026");
    expect(periodLabel(monthRange("2026-11-01", "2025-12-01"))).toBe("Dec 2025 – Nov 2026");
    expect(periodLabel(presetPeriod("all", TODAY))).toBe("All time");
  });

  it("arrows step months and years, across year ends", () => {
    expect(stepPeriod({ kind: "month", month: "2026-12-01" }, 1)).toEqual({ kind: "month", month: "2027-01-01" });
    expect(stepPeriod({ kind: "year", year: 2026 }, -1)).toEqual({ kind: "year", year: 2025 });
    expect(canStep({ kind: "all" })).toBe(false);
    expect(canStep(presetPeriod("last3", TODAY))).toBe(false);
  });

  it("a one-month custom range is just that month (so the arrows work)", () => {
    expect(monthRange("2026-05-01", "2026-05-01")).toEqual({ kind: "month", month: "2026-05-01" });
    expect(samePeriod(monthRange("2026-10-01", "2026-10-01"), presetPeriod("thisMonth", TODAY))).toBe(true);
  });

  it("dates and stays in a period", () => {
    const oct = presetPeriod("thisMonth", TODAY);
    expect(inPeriod("2026-10-31", oct, TODAY)).toBe(true);
    expect(inPeriod("2026-11-01", oct, TODAY)).toBe(false);
    // A stay spanning the month start counts; one checking out on the 1st doesn't.
    expect(stayInPeriod("2026-09-29", "2026-10-02", oct, TODAY)).toBe(true);
    expect(stayInPeriod("2026-09-29", "2026-10-01", oct, TODAY)).toBe(false);
    // Upcoming: anything not yet checked out, including a stay in progress.
    const up = presetPeriod("upcoming", TODAY);
    expect(stayInPeriod("2026-10-10", "2026-10-12", up, TODAY)).toBe(true);
    expect(stayInPeriod("2026-10-08", "2026-10-11", up, TODAY)).toBe(false);
  });
});
