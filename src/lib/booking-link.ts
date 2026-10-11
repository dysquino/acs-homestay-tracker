import "server-only";

import { timingSafeEqual } from "crypto";

/**
 * The secret in the guests' booking link (/book?k=...). It keeps bots and
 * strangers off the request form; changing BOOKING_LINK_KEY in Vercel
 * disables every old link. No key configured means no link works.
 */
export function bookingLinkKey(): string | null {
  return process.env.BOOKING_LINK_KEY || null;
}

export function isValidBookingKey(candidate: unknown): boolean {
  const key = bookingLinkKey();
  if (!key || typeof candidate !== "string") return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Today's date at the homestay (YYYY-MM-DD), whatever the server's timezone. */
export function homestayToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}
