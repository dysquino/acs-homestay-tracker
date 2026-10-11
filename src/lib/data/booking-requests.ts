"use server";

import { bookingLinkKey } from "@/lib/booking-link";
import { prisma } from "@/lib/prisma";
import type { Booking, BookingRequest } from "@/lib/types";
import { ValidationError } from "@/lib/validation";

import { requireSiteAccess } from "./access";
import { assertNoAirbnbClash } from "./airbnb-calendar";
import { createBookingWithTurnover } from "./booking-create";
import { bookingFromDb, bookingRequestFromDb, dateToISO } from "./mappers";

/** Owner-side handling of guests' booking requests (behind the access code). */

export async function listBookingRequests(): Promise<BookingRequest[]> {
  await requireSiteAccess();
  const rows = await prisma.bookingRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(bookingRequestFromDb);
}

export type DecideResult = { ok: true; booking?: Booking } | { ok: false; error: string };

/**
 * Turns a pending request into a Direct booking (payment pending, payout 0
 * until the owner fills it in) with its turnover cleaning — the same path as
 * adding a booking by hand, so the double-booking rule applies. Returns an
 * error instead of throwing so the owner sees why (e.g. the dates were taken
 * in the meantime).
 */
export async function approveBookingRequest(id: string, actor: string): Promise<DecideResult> {
  await requireSiteAccess();
  try {
    // Before the transaction: this may read Airbnb's feed over the network.
    const pending = await prisma.bookingRequest.findUnique({ where: { id } });
    if (pending) await assertNoAirbnbClash(dateToISO(pending.checkIn), dateToISO(pending.checkOut));
    const booking = await prisma.$transaction(async (tx) => {
      const req = await tx.bookingRequest.findUnique({ where: { id } });
      if (!req || req.status !== "PENDING") {
        throw new ValidationError("This request was already handled — refresh to see the latest.");
      }
      const who = String(actor ?? "").trim().slice(0, 200) || "Unknown";
      const created = await createBookingWithTurnover(tx, {
        guestName: req.guestName,
        source: "direct",
        checkIn: dateToISO(req.checkIn),
        checkOut: dateToISO(req.checkOut),
        guestsCount: req.guestsCount,
        totalPayout: 0,
        platformFee: 0,
        paymentStatus: "pending",
        contactInfo: req.contactInfo,
        notes: req.message,
        createdBy: who,
      });
      await tx.bookingRequest.update({
        where: { id },
        data: { status: "APPROVED", bookingId: created.id, decidedBy: who, decidedAt: new Date() },
      });
      return created;
    });
    return { ok: true, booking: bookingFromDb(booking) };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function declineBookingRequest(id: string, actor: string): Promise<DecideResult> {
  await requireSiteAccess();
  const who = String(actor ?? "").trim().slice(0, 200) || "Unknown";
  const { count } = await prisma.bookingRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "DECLINED", decidedBy: who, decidedAt: new Date() },
  });
  return count === 1 ? { ok: true } : { ok: false, error: "This request was already handled — refresh to see the latest." };
}

/** The guests' booking link (path + key), for the owners to share. Null if no key is set. */
export async function getBookingLinkPath(): Promise<string | null> {
  await requireSiteAccess();
  const key = bookingLinkKey();
  return key ? `/book?k=${encodeURIComponent(key)}` : null;
}
