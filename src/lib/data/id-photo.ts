"use server";

import "server-only";

import { prisma } from "@/lib/prisma";
import { validateIdPhoto } from "@/lib/payment-screenshot";

import { requireSiteAccess } from "./access";

/**
 * Owner-side management of the ID photo on a BookingRequest. Same shape as
 * the payment screenshot — bytes are validated at the API boundary
 * (magic-byte sniff + 2 MB cap) and fetched on demand for the viewer's
 * <img>. Behind the access code.
 */

export type IdPhotoData = { mime: string; bytes: Uint8Array };

export async function getBookingRequestIdPhoto(
  requestId: string,
): Promise<IdPhotoData | null> {
  await requireSiteAccess();
  const row = await prisma.bookingRequest.findUnique({
    where: { id: requestId },
    select: { idPhoto: true, idPhotoMime: true },
  });
  if (!row || !row.idPhoto || !row.idPhotoMime) return null;
  return { mime: row.idPhotoMime, bytes: row.idPhoto };
}

/** Attach (or replace) the ID photo on a pending request. */
export async function attachBookingRequestIdPhoto(
  requestId: string,
  bytes: Uint8Array,
): Promise<{ mime: string } | { error: string }> {
  await requireSiteAccess();
  const validation = validateIdPhoto(bytes);
  if (!validation.ok) return { error: validation.error };
  await prisma.bookingRequest.update({
    where: { id: requestId },
    data: { idPhoto: Buffer.from(bytes), idPhotoMime: validation.mime },
  });
  return { mime: validation.mime };
}

/** Remove the ID photo from a request. */
export async function clearBookingRequestIdPhoto(requestId: string): Promise<void> {
  await requireSiteAccess();
  await prisma.bookingRequest.update({
    where: { id: requestId },
    data: { idPhoto: null, idPhotoMime: null },
  });
}
