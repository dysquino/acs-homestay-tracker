"use server";

import "server-only";

import { prisma } from "@/lib/prisma";
import { validatePaymentScreenshot } from "@/lib/payment-screenshot";

import { requireSiteAccess } from "./access";

/**
 * Owner-side management of the payment screenshot on a BookingRequest — the
 * guest may have uploaded one (handled in submitBookingRequest), or sent it
 * via Messenger and the owner attaches it themselves. Behind the access code.
 *
 * Bytes are validated at the API boundary — magic-byte sniff (Magic MIME
 * header) plus a 2 MB cap — so the database never stores a non-image or an
 * oversized payload. The list query doesn't include the bytes; this fetch
 * streams them when needed for the viewer's <img>.
 */

export type ScreenshotData = { mime: string; bytes: Uint8Array };

export async function getBookingRequestScreenshot(
  requestId: string,
): Promise<ScreenshotData | null> {
  await requireSiteAccess();
  const row = await prisma.bookingRequest.findUnique({
    where: { id: requestId },
    select: { paymentScreenshot: true, paymentScreenshotMime: true },
  });
  if (!row || !row.paymentScreenshot || !row.paymentScreenshotMime) return null;
  return { mime: row.paymentScreenshotMime, bytes: row.paymentScreenshot };
}

/**
 * Attach (or replace) a screenshot on a pending request. Returns the new
 * MIME for the caller to refresh UI state.
 */
export async function attachBookingRequestScreenshot(
  requestId: string,
  bytes: Uint8Array,
): Promise<{ mime: string } | { error: string }> {
  await requireSiteAccess();
  const validation = validatePaymentScreenshot(bytes);
  if (!validation.ok) return { error: validation.error };
  // The sniffed MIME is the source of truth — ignore the header the client lied with.
  await prisma.bookingRequest.update({
    where: { id: requestId },
    data: { paymentScreenshot: Buffer.from(bytes), paymentScreenshotMime: validation.mime },
  });
  return { mime: validation.mime };
}

/** Remove the screenshot from a request (used by the owner-side "Remove" action). */
export async function clearBookingRequestScreenshot(requestId: string): Promise<void> {
  await requireSiteAccess();
  await prisma.bookingRequest.update({
    where: { id: requestId },
    data: { paymentScreenshot: null, paymentScreenshotMime: null },
  });
}