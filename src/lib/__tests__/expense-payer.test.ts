import { describe, expect, it } from "vitest";

import { BANK_PAYER, PAID_BY, PAID_BY_OPTIONS, isBankPayer } from "../types";

describe("expense payer roster", () => {
  it("offers the five people plus the bank account as payers", () => {
    expect(PAID_BY_OPTIONS.map((p) => p.value)).toEqual([
      "Dys",
      "Kalur",
      "Rayhla",
      "Gervin",
      "DK",
      "Bank",
    ]);
  });

  it("keeps the bank account out of the people roster", () => {
    // PAID_BY also builds the identity picker's account list and both
    // "who was paid" lists — a bank account is neither a user of this tracker
    // nor someone to hand money back to.
    expect(PAID_BY.map((p) => p.value)).not.toContain(BANK_PAYER);
  });

  it("recognises the bank account however it was typed", () => {
    expect(isBankPayer("Bank")).toBe(true);
    expect(isBankPayer(" Bank ")).toBe(true);
    expect(isBankPayer("DK")).toBe(false);
    expect(isBankPayer("")).toBe(false);
  });
});
