"use server";

import { homestayToday, isValidBookingKey } from "@/lib/booking-link";
import { prisma } from "@/lib/prisma";
import { validateIdPhoto, validatePaymentScreenshot } from "@/lib/payment-screenshot";
import type { BookingRequestInput } from "@/lib/types";
import { ValidationError, validateBookingRequest } from "@/lib/validation";

import { airbnbBlocks } from "./airbnb-calendar";
import { isoToDate } from "./mappers";

/**
 * The ONE server action guests can call — from the private booking page,
 * without the site's access code. Instead of requireSiteAccess() it checks
 * the booking link's key, and it can only ever add a pending request: it
 * reads nothing back and touches no other table. Everything a guest sends is
 * re-validated here; the form's own checks are just for a friendly UX.
 *
 * Returns a result instead of throwing, because production hides thrown
 * error messages from the browser and the guest needs to know what's wrong.
 */

export type SubmitResult = { ok: true } | { ok: false; error: string };

/** Open requests one guest may have at once, and in total — a spam brake. */
const MAX_PENDING_PER_CONTACT = 2;
const MAX_PENDING_TOTAL = 30;

const normalizeContact = (s: string) => s.toLowerCase().replace(/[\s\-()+.]/g, "");

export async function submitBookingRequest(
  key: string,
  input: BookingRequestInput & {
    website?: string;
    paymentScreenshot?: Uint8Array | null;
    idPhoto?: Uint8Array | null;
  },
): Promise<SubmitResult> {
  if (!isValidBookingKey(key)) {
    return { ok: false, error: "This booking link isn't valid anymore. Please ask us for a new one." };
  }
  // Honeypot: a field people never see. Bots fill it in — pretend it worked.
  if (input?.website) return { ok: true };

  const request: BookingRequestInput = {
    guestName: String(input?.guestName ?? "").trim(),
    contactInfo: String(input?.contactInfo ?? "").trim(),
    checkIn: String(input?.checkIn ?? ""),
    checkOut: String(input?.checkOut ?? ""),
    guestsCount: Number(input?.guestsCount),
    message: String(input?.message ?? "").trim(),
  };
  try {
    validateBookingRequest(request, homestayToday());
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    throw e;
  }

  // Optional screenshot — magic-byte sniff before we touch the DB. The
  // client's `Content-Type` is ignored; the bytes are the truth.
  let screenshot: { bytes: Uint8Array; mime: string } | null = null;
  const raw = input?.paymentScreenshot;
  if (raw && raw.length > 0) {
    const validation = validatePaymentScreenshot(raw);
    if (!validation.ok) return { ok: false, error: validation.error };
    screenshot = { bytes: raw, mime: validation.mime };
  }

  // ID photo — required at the form level, but the server stays permissive
  // for old clients. Same magic-byte sniff; bytes are the truth.
  let idPhoto: { bytes: Uint8Array; mime: string } | null = null;
  const rawId = input?.idPhoto;
  if (rawId && rawId.length > 0) {
    const validation = validateIdPhoto(rawId);
    if (!validation.ok) return { ok: false, error: validation.error };
    idPhoto = { bytes: rawId, mime: validation.mime };
  }

  const checkIn = isoToDate(request.checkIn);
  const checkOut = isoToDate(request.checkOut);
  const taken = await prisma.booking.count({
    where: { checkIn: { lt: checkOut }, checkOut: { gt: checkIn } },
  });
  const { blocks } = await airbnbBlocks();
  const airbnbTaken = blocks.some((b) => b.checkIn < request.checkOut && request.checkIn < b.checkOut);
  if (taken > 0 || airbnbTaken) {
    return { ok: false, error: "Sorry, some of those nights were just booked. Please pick other dates." };
  }

  const pending = await prisma.bookingRequest.findMany({
    where: { status: "PENDING" },
    select: { contactInfo: true },
  });
  if (pending.length >= MAX_PENDING_TOTAL) {
    return { ok: false, error: "We can't take new requests online right now. Please message us directly." };
  }
  const mine = normalizeContact(request.contactInfo);
  if (pending.filter((p) => normalizeContact(p.contactInfo) === mine).length >= MAX_PENDING_PER_CONTACT) {
    return { ok: false, error: "You already have requests waiting for our reply — we'll get back to you soon." };
  }

  await prisma.bookingRequest.create({
    data: {
      ...request,
      checkIn,
      checkOut,
      paymentScreenshot: screenshot ? Buffer.from(screenshot.bytes) : undefined,
      paymentScreenshotMime: screenshot?.mime ?? null,
      idPhoto: idPhoto ? Buffer.from(idPhoto.bytes) : undefined,
      idPhotoMime: idPhoto?.mime ?? null,
    },
  });
  return { ok: true };
}
