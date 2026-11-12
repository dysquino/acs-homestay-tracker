import { describe, expect, it } from "vitest";

import { validatePaymentForm } from "@/lib/payment-form";

/**
 * The payment form's rules, pinned down.
 *
 * The screenshot rule is the one that matters: it used to be enforced on
 * every submit, including edits — where there is no upload field at all. The
 * form then refused to submit a rule it could never satisfy, and the message
 * it set was never shown on that branch, so "Save changes" did nothing at all.
 */
describe("validatePaymentForm", () => {
  const valid = {
    amount: "1500",
    receivedDate: "2026-11-01",
  };

  it("accepts a new payment with a screenshot", () => {
    const result = validatePaymentForm(valid, {
      isEditing: false,
      hasScreenshot: true,
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.screenshotError).toBeNull();
  });

  it("requires a screenshot only for a new payment", () => {
    const result = validatePaymentForm(valid, {
      isEditing: false,
      hasScreenshot: false,
    });
    expect(result.ok).toBe(false);
    expect(result.screenshotError).toBe("A payment screenshot is required.");
  });

  it("does not require a screenshot when editing — the bug that blocked every edit", () => {
    const result = validatePaymentForm(valid, {
      isEditing: true,
      hasScreenshot: false,
    });
    expect(result.ok).toBe(true);
    expect(result.screenshotError).toBeNull();
    expect(result.errors).toEqual({});
  });

  it("still validates the amount when editing", () => {
    const result = validatePaymentForm(
      { ...valid, amount: "" },
      { isEditing: true, hasScreenshot: false },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.amount).toBe("Enter an amount greater than zero.");
  });

  it("rejects a zero amount", () => {
    const result = validatePaymentForm(
      { ...valid, amount: "0" },
      { isEditing: true, hasScreenshot: false },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.amount).toBe("Enter an amount greater than zero.");
  });

  it("still requires a received date when editing", () => {
    const result = validatePaymentForm(
      { ...valid, receivedDate: "" },
      { isEditing: true, hasScreenshot: false },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.receivedDate).toBe("Received date is required.");
  });

  it("reports both problems at once", () => {
    const result = validatePaymentForm(
      { amount: "", receivedDate: "" },
      { isEditing: false, hasScreenshot: false },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.amount).toBeDefined();
    expect(result.errors.receivedDate).toBeDefined();
    expect(result.screenshotError).toBeDefined();
  });
});
