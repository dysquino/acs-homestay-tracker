import { describe, expect, it } from "vitest";

import { cleaningExpenseFields } from "../data/cleaning-expense-fields";

// Prisma's Decimal type isn't worth constructing for a test that only
// forwards this field unread — a number stands in fine, hence the cast
// through `unknown`.
const cleaning = {
  id: "c1",
  date: new Date("2026-03-04T00:00:00.000Z"),
  bookingId: null,
  cleanerName: "Ate Nene",
  status: "COMPLETED",
  paymentAmount: 800,
  paymentStatus: "PAID",
  notes: "",
  createdBy: "Owner",
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Parameters<typeof cleaningExpenseFields>[0];

describe("cleaningExpenseFields", () => {
  it("is always refunded — the shared fund paid the cleaner directly, nobody is owed back", () => {
    expect(cleaningExpenseFields(cleaning).refundStatus).toBe("REFUNDED");
    expect(cleaningExpenseFields({ ...cleaning, cleanerName: "" }).refundStatus).toBe("REFUNDED");
  });

  it("names the cleaner in the description, or 'Unassigned' when there isn't one", () => {
    expect(cleaningExpenseFields(cleaning).description).toBe("Cleaning payment — Ate Nene");
    expect(cleaningExpenseFields({ ...cleaning, cleanerName: "  " }).description).toBe(
      "Cleaning payment — Unassigned",
    );
  });

  it("appends the guest when one is given", () => {
    expect(cleaningExpenseFields(cleaning, "Maria Santos").description).toBe(
      "Cleaning payment — Ate Nene (after Maria Santos)",
    );
  });

  it("dates and prices the expense from the cleaning, in the CLEANING_PAYMENT category", () => {
    const fields = cleaningExpenseFields(cleaning);
    expect(fields.date).toBe(cleaning.date);
    expect(fields.amount).toBe(cleaning.paymentAmount);
    expect(fields.category).toBe("CLEANING_PAYMENT");
  });
});
