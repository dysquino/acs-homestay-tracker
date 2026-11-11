import { describe, expect, it } from "vitest";

import { calculateStayPrice, DEFAULT_LONG_STAY_THRESHOLD, type RateConfig } from "../pricing";

/** The owner's standard rates: ₱1,500 a night, ₱500 cleaning, ₱300 for 5+ nights. */
const RATES: RateConfig = {
  nightlyRate: 1500,
  cleaningFee: 500,
  cleaningFeeLong: 300,
  longStayThresholdNights: 5,
};

describe("calculateStayPrice", () => {
  it("multiplies the nightly rate by the nights", () => {
    const price = calculateStayPrice(RATES, 3);
    expect(price.nights).toBe(3);
    expect(price.subtotal).toBe(4500);
  });

  it("adds the short-stay cleaning fee below the threshold", () => {
    const price = calculateStayPrice(RATES, 4);
    expect(price.isLongStay).toBe(false);
    expect(price.cleaningFee).toBe(500);
    expect(price.total).toBe(6500);
  });

  it("switches to the long-stay cleaning fee at the threshold", () => {
    const price = calculateStayPrice(RATES, 5);
    expect(price.isLongStay).toBe(true);
    expect(price.cleaningFee).toBe(300);
    expect(price.total).toBe(7800);
    expect(price.tierLabel).toContain("5+ nights");
  });

  it("honours an owner-tuned threshold", () => {
    const price = calculateStayPrice({ ...RATES, longStayThresholdNights: 2 }, 2);
    expect(price.isLongStay).toBe(true);
    expect(price.cleaningFee).toBe(300);
  });

  it("falls back to the default threshold when the owner hasn't set one", () => {
    const price = calculateStayPrice({ ...RATES, longStayThresholdNights: 0 }, DEFAULT_LONG_STAY_THRESHOLD);
    expect(price.isLongStay).toBe(true);
  });

  it("falls back to the short fee when no long-stay fee is set", () => {
    const price = calculateStayPrice({ ...RATES, cleaningFeeLong: 0 }, 10);
    expect(price.cleaningFee).toBe(500);
    expect(price.tierLabel).toBe("Cleaning fee");
  });

  it("falls back to the long fee when no short-stay fee is set", () => {
    const price = calculateStayPrice({ ...RATES, cleaningFee: 0 }, 2);
    expect(price.cleaningFee).toBe(300);
  });

  it("reports itself unconfigured when no rate is set at all", () => {
    const price = calculateStayPrice(
      { nightlyRate: 0, cleaningFee: 0, cleaningFeeLong: 0, longStayThresholdNights: 5 },
      3,
    );
    expect(price.configured).toBe(false);
  });

  it("treats a zero-night stay as nothing to price", () => {
    const price = calculateStayPrice(RATES, 0);
    expect(price.nights).toBe(0);
    expect(price.subtotal).toBe(0);
  });

  it("keeps the total exact where float addition would drift", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in JavaScript — a centavo out on a
    // total is exactly what §8.6 refuses to reconcile.
    const price = calculateStayPrice(
      { nightlyRate: 0.1, cleaningFee: 0.2, cleaningFeeLong: 0, longStayThresholdNights: 5 },
      3,
    );
    expect(price.subtotal).toBe(0.3);
    expect(price.total).toBe(0.5);
  });
});
