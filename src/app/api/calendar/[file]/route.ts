import { timingSafeEqual } from "crypto";

import { directBookingsIcal } from "@/lib/airbnb-ical";
import { homestayToday } from "@/lib/booking-link";
import { dateToISO, isoToDate } from "@/lib/data/mappers";
import { prisma } from "@/lib/prisma";

/**
 * Calendar feed of the DIRECT bookings, for Airbnb's "Import calendar", so
 * Airbnb blocks those nights too. Lives outside the access gate (Airbnb's
 * servers can't log in) and is protected by the secret in its URL instead:
 * /api/calendar/<CALENDAR_FEED_KEY>.ics. Dates only — no names or amounts.
 * Airbnb bookings are left out: Airbnb already knows them, and re-importing
 * them would block their own dates.
 */

function validKey(candidate: string): boolean {
  const key = process.env.CALENDAR_FEED_KEY;
  if (!key) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!validKey(decodeURIComponent(file).replace(/\.ics$/, ""))) {
    return new Response("Not found", { status: 404 });
  }

  // From a month back, so a stay in progress stays blocked.
  const since = isoToDate(homestayToday());
  since.setUTCDate(since.getUTCDate() - 30);
  const rows = await prisma.booking.findMany({
    where: { source: "DIRECT", checkOut: { gt: since } },
    select: { id: true, checkIn: true, checkOut: true },
    orderBy: { checkIn: "asc" },
  });
  const ics = directBookingsIcal(rows.map((r) => ({ id: r.id, checkIn: dateToISO(r.checkIn), checkOut: dateToISO(r.checkOut) })));
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
