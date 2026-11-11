"use server";

import { bookingLinkKey, homestayToday } from "@/lib/booking-link";
import { prisma } from "@/lib/prisma";
import { validatePaymentScreenshot } from "@/lib/payment-screenshot";
import type { Booking, BookingPaymentInput, BookingRequest, BookingPaymentMethod } from "@/lib/types";
import { ValidationError, validateBookingPayment } from "@/lib/validation";

import { requireSiteAccess } from "./access";
import { loadPendingRequests } from "./loaders";
import { assertNoAirbnbClash } from "./airbnb-calendar";
import { createBookingWithTurnover } from "./booking-create";
import { refreshPaymentStatus } from "./booking-payment-status";
import { bookingFromDb, bookingPaymentToDb, dateToISO } from "./mappers";

/** Owner-side handling of guests' booking requests (behind the access code). */

export async function listBookingRequests(): Promise<BookingRequest[]> {
  await requireSiteAccess();
  return loadPendingRequests();
}

export type DecideResult = { ok: true; booking?: Booking } | { ok: false; error: string };

/**
 * What the owner confirmed at approval time: what the stay is worth, and
 * whether the money has landed.
 *
 * `totalPayout` is the owner's override of the computed breakdown — it is the
 * amount the booking is worth, whatever the rates say. `paymentReceived` is the
 * owner's yes/no on "I checked the bank"; when true, `amountReceived` is how
 * much actually arrived, which may be a deposit, less than the total.
 */
export type ApproveWithPaymentInput = {
  /** What the stay is worth. Zero or more. */
  totalPayout: number;
  /** Whether the owner confirmed the money reached the bank. */
  paymentReceived: boolean;
  /** How much was deposited. Required when `paymentReceived` is true. */
  amountReceived?: number;
  /** YYYY-MM-DD — when the money arrived. Defaults to today at the homestay. */
  receivedDate?: string;
  /** How the money arrived. Defaults to a bank transfer. */
  method?: BookingPaymentMethod;
  /** Bank reference, when known. */
  reference?: string;
  /**
   * Proof uploaded in the approval modal. Optional — when it's absent the
   * guest's own payment screenshot (if they sent one) is used instead.
   */
  paymentScreenshot?: Uint8Array | null;
};

/**
 * Turns a pending request into a Direct booking and records what the owner
 * confirmed about the money, in one transaction.
 *
 * The booking is created with the owner's amount (not a placeholder zero), so
 * the stay is worth the right figure from the moment it exists. When the owner
 * says the money has arrived, the deposit is written as a `BookingPayment` row
 * — never as a hand-set `paymentStatus`, because that column is a cache
 * derived from the payment rows (§12.1) and writing it directly would leave
 * the two out of step.
 *
 * The deposit write is deliberately NOT behind the reconciliation toggle: "did
 * the guest pay?" is core booking data, and the toggle exists to hide the
 * matching workspace, not to forbid recording what happened.
 *
 * Returns an error instead of throwing so the owner sees why (e.g. the dates
 * were taken in the meantime).
 */
export async function approveBookingRequestWithPayment(
  id: string,
  actor: string,
  input: ApproveWithPaymentInput,
): Promise<DecideResult> {
  await requireSiteAccess();
  try {
    const who = String(actor ?? "").trim().slice(0, 200) || "Unknown";

    // The amount the stay is worth — the owner's override of the computed
    // breakdown. Zero is allowed (a stay the owner hasn't priced yet).
    const totalPayout = Number(input?.totalPayout);
    if (!Number.isFinite(totalPayout) || totalPayout < 0) {
      throw new ValidationError("Total payout must be zero or more.");
    }

    // Proof for the deposit: the modal's upload wins; otherwise the guest's
    // own screenshot is reused (it's the picture of what they sent).
    let uploaded: { bytes: Uint8Array; mime: string } | null = null;
    if (input.paymentScreenshot) {
      const validation = validatePaymentScreenshot(input.paymentScreenshot);
      if (!validation.ok) throw new ValidationError(validation.error);
      uploaded = { bytes: input.paymentScreenshot, mime: validation.mime };
    }

    // Before the transaction: this may read Airbnb's feed over the network.
    const pending = await prisma.bookingRequest.findUnique({ where: { id } });
    if (pending) await assertNoAirbnbClash(dateToISO(pending.checkIn), dateToISO(pending.checkOut));

    const booking = await prisma.$transaction(async (tx) => {
      const req = await tx.bookingRequest.findUnique({ where: { id } });
      if (!req || req.status !== "PENDING") {
        throw new ValidationError("This request was already handled — refresh to see the latest.");
      }
      const created = await createBookingWithTurnover(tx, {
        guestName: req.guestName,
        source: "direct",
        checkIn: dateToISO(req.checkIn),
        checkOut: dateToISO(req.checkOut),
        guestsCount: req.guestsCount,
        totalPayout,
        platformFee: 0,
        // A cache of the payment rows — recomputed below once the deposit
        // exists, and left as "pending" when there is no deposit yet.
        paymentStatus: "pending",
        contactInfo: req.contactInfo,
        notes: req.message,
        createdBy: who,
      });
      // Carry the guest's photos (payment screenshot + ID photo) onto the
      // new Booking, so the edit-booking modal and the list view can show
      // them after the request is approved. Same bytes, same MIMEs — the
      // guest already submitted them and we trust the original validation.
      await tx.booking.update({
        where: { id: created.id },
        data: {
          paymentScreenshot: req.paymentScreenshot ?? null,
          paymentScreenshotMime: req.paymentScreenshotMime ?? null,
          idPhoto: req.idPhoto ?? null,
          idPhotoMime: req.idPhotoMime ?? null,
        },
      });

      if (input.paymentReceived) {
        const payment: BookingPaymentInput = {
          bookingId: created.id,
          amount: Number(input.amountReceived),
          receivedDate: input.receivedDate || homestayToday(),
          method: input.method ?? "bank_transfer",
          reference: String(input.reference ?? "").trim(),
          notes: "",
          createdBy: who,
        };
        validateBookingPayment(payment);
        await tx.bookingPayment.create({
          data: {
            ...bookingPaymentToDb(payment),
            // The owner's upload is the more specific proof; the guest's
            // screenshot is the fallback. Either way the row may end up
            // without proof — the owner can attach one later.
            paymentScreenshot: uploaded
              ? Buffer.from(uploaded.bytes)
              : (req.paymentScreenshot ?? null),
            paymentScreenshotMime: uploaded ? uploaded.mime : (req.paymentScreenshotMime ?? null),
          },
        });
        // Recompute the booking's cached status from the receipt just written
        // (§12.1) so the badge reads "partial" / "paid" straight away.
        await refreshPaymentStatus(tx, created.id);
      }

      await tx.bookingRequest.update({
        where: { id },
        data: { status: "APPROVED", bookingId: created.id, decidedBy: who, decidedAt: new Date() },
      });
      // Re-read so the returned booking carries the derived payment status
      // rather than the placeholder written at creation.
      return tx.booking.findUniqueOrThrow({ where: { id: created.id } });
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
