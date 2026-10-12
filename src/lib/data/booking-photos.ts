"use server";

import "server-only";

import { prisma } from "@/lib/prisma";
import {
  validateIdPhoto,
  validatePaymentScreenshot,
} from "@/lib/payment-screenshot";

import { requireSiteAccess } from "./access";

/**
 * Owner-side management of the payment screenshot and ID photo on a
 * Booking (not a BookingRequest). Mirrors `payment-screenshot.ts` and
 * `id-photo.ts` in shape; same magic-byte + 2 MB cap. The Booking gets
 * these fields by:
 *  - Direct bookings created by the owner: optional, set here.
 *  - Bookings approved from a BookingRequest: copied on approval, then
 *    editable from the edit-booking modal.
 *
 * The bytes stay off the list query — owners fetch on demand when they
 * open the modal.
 */

export type ScreenshotData = { mime: string; bytes: Uint8Array };
export type IdPhotoData = { mime: string; bytes: Uint8Array };

// -------- Payment screenshot --------

export async function getBookingScreenshot(bookingId: string): Promise<ScreenshotData | null> {
  await requireSiteAccess();
  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { paymentScreenshot: true, paymentScreenshotMime: true },
  });
  if (!row || !row.paymentScreenshot || !row.paymentScreenshotMime) return null;
  return { mime: row.paymentScreenshotMime, bytes: row.paymentScreenshot };
}

export async function attachBookingScreenshot(
  bookingId: string,
  bytes: Uint8Array,
): Promise<{ mime: string } | { error: string }> {
  await requireSiteAccess();
  const validation = validatePaymentScreenshot(bytes);
  if (!validation.ok) return { error: validation.error };
  await prisma.booking.update({
    where: { id: bookingId },
    data: { paymentScreenshot: Buffer.from(bytes), paymentScreenshotMime: validation.mime },
  });
  return { mime: validation.mime };
}

export async function clearBookingScreenshot(bookingId: string): Promise<void> {
  await requireSiteAccess();
  await prisma.booking.update({
    where: { id: bookingId },
    data: { paymentScreenshot: null, paymentScreenshotMime: null },
  });
}

// -------- ID photo --------

export async function getBookingIdPhoto(bookingId: string): Promise<IdPhotoData | null> {
  await requireSiteAccess();
  const row = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { idPhoto: true, idPhotoMime: true },
  });
  if (!row || !row.idPhoto || !row.idPhotoMime) return null;
  return { mime: row.idPhotoMime, bytes: row.idPhoto };
}

export async function attachBookingIdPhoto(
  bookingId: string,
  bytes: Uint8Array,
): Promise<{ mime: string } | { error: string }> {
  await requireSiteAccess();
  const validation = validateIdPhoto(bytes);
  if (!validation.ok) return { error: validation.error };
  await prisma.booking.update({
    where: { id: bookingId },
    data: { idPhoto: Buffer.from(bytes), idPhotoMime: validation.mime },
  });
  return { mime: validation.mime };
}

export async function clearBookingIdPhoto(bookingId: string): Promise<void> {
  await requireSiteAccess();
  await prisma.booking.update({
    where: { id: bookingId },
    data: { idPhoto: null, idPhotoMime: null },
  });
}
