"use server";

import { DEFAULT_CLEANING_FEE } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import type { BookingInput } from "@/lib/types";
import { ValidationError, validateBooking } from "@/lib/validation";

import { cleaningExpenseFields } from "./cleaning-expense";
import { bookingToDb, isoToDate } from "./mappers";

/** One row of a previewed Airbnb import, already turned into a decision. */
export type ImportInstruction = {
  action: "create" | "update";
  /** For "update": the hand-entered booking to link and correct. */
  bookingId?: string;
  confirmationCode: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  totalPayout: number;
  platformFee: number;
};

export type ImportResult = { created: number; updated: number; skipped: number };

const MAX_ROWS = 500;
const CODE = /^[A-Za-z0-9]{6,32}$/;

/**
 * Applies a previewed Airbnb import in ONE transaction — all rows or none.
 *
 * - create: a Paid Airbnb booking, plus a completed, paid turnover cleaning at
 *   the fixed cleaning fee (which in turn creates its cleaning expense).
 * - update: a hand-entered booking with the same guest and dates gets the
 *   confirmation code and the corrected payout; nothing else is touched.
 * - a confirmation code that already exists is skipped, so importing the same
 *   file twice is harmless.
 *
 * The client's preview is not trusted: every row is validated again here.
 */
export async function importAirbnbBookings(
  items: ImportInstruction[],
  actor: string,
): Promise<ImportResult> {
  if (!Array.isArray(items) || items.length === 0) throw new ValidationError("Nothing to import.");
  if (items.length > MAX_ROWS) throw new ValidationError(`Import at most ${MAX_ROWS} bookings at a time.`);
  if (typeof actor !== "string" || !actor.trim()) throw new ValidationError("Missing user.");

  const candidates = items.map((item) => {
    if (typeof item.confirmationCode !== "string" || !CODE.test(item.confirmationCode)) {
      throw new ValidationError("A row has an invalid confirmation code.");
    }
    const input: BookingInput = {
      guestName: item.guestName,
      source: "airbnb",
      checkIn: item.checkIn,
      checkOut: item.checkOut,
      guestsCount: 1, // the export doesn't include a guest count
      totalPayout: item.totalPayout,
      platformFee: item.platformFee,
      paymentStatus: "paid",
      contactInfo: "",
      notes: "",
      createdBy: actor.trim(),
    };
    validateBooking(input);
    return { item, input };
  });

  const codes = candidates.map((c) => c.item.confirmationCode);
  if (new Set(codes).size !== codes.length) {
    throw new ValidationError("The same confirmation code appears twice in this import.");
  }

  return prisma.$transaction(
    async (tx) => {
      const already = new Set(
        (
          await tx.booking.findMany({
            where: { confirmationCode: { in: codes } },
            select: { confirmationCode: true },
          })
        ).map((b) => b.confirmationCode),
      );

      let skipped = 0;
      let updated = 0;
      const toCreate: typeof candidates = [];

      for (const c of candidates) {
        if (already.has(c.item.confirmationCode)) {
          skipped++;
        } else if (c.item.action === "update") {
          const existing = c.item.bookingId
            ? await tx.booking.findUnique({ where: { id: c.item.bookingId } })
            : null;
          if (!existing || existing.confirmationCode) {
            throw new ValidationError(`Can't link ${c.item.guestName}: that booking changed. Reload and try again.`);
          }
          await tx.booking.update({
            where: { id: existing.id },
            data: {
              confirmationCode: c.item.confirmationCode,
              source: "AIRBNB",
              totalPayout: c.input.totalPayout,
              platformFee: c.input.platformFee,
              paymentStatus: "PAID",
            },
          });
          updated++;
        } else {
          toCreate.push(c);
        }
      }

      if (toCreate.length > 0) {
        const bookings = await tx.booking.createManyAndReturn({
          data: toCreate.map((c) => ({
            ...bookingToDb(c.input),
            confirmationCode: c.item.confirmationCode,
          })),
        });
        const guestById = new Map(bookings.map((b) => [b.id, b.guestName]));

        const cleanings = await tx.cleaningSchedule.createManyAndReturn({
          data: bookings.map((b) => ({
            date: isoToDate(b.checkOut.toISOString().slice(0, 10)),
            bookingId: b.id,
            cleanerName: "",
            status: "COMPLETED" as const,
            paymentAmount: DEFAULT_CLEANING_FEE,
            paymentStatus: "PAID" as const,
            notes: "",
            createdBy: actor.trim(),
          })),
        });
        await tx.expense.createMany({
          data: cleanings.map((cl) => ({
            ...cleaningExpenseFields(cl, cl.bookingId ? guestById.get(cl.bookingId) : undefined),
            paidBy: actor.trim(),
            receiptUrl: "",
            createdBy: actor.trim(),
            cleaningId: cl.id,
          })),
        });
      }

      return { created: toCreate.length, updated, skipped };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}
