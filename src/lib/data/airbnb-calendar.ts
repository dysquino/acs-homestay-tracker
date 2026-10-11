import "server-only";

import { parseAirbnbIcal, unmatchedReservations, type AirbnbReservation } from "@/lib/airbnb-ical";
import { homestayToday } from "@/lib/booking-link";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/validation";

import { bookingFromDb, isoToDate } from "./mappers";

/** Re-read Airbnb's feed at most this often; in between, the cached copy is used. */
const MAX_AGE_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;
const CACHE_ID = "airbnb";

export type AirbnbSyncStatus = {
  /** False when AIRBNB_ICAL_URL isn't set — the sync is simply off. */
  enabled: boolean;
  /** Last successful read of the feed (ISO timestamp). */
  fetchedAt: string | null;
  /** Why the last attempt failed, if it did (the cached copy is still used). */
  error: string | null;
};

/**
 * Airbnb's reservations, from the feed in AIRBNB_ICAL_URL. Reads it at most
 * every 10 minutes and keeps the last good copy in the database, so a slow or
 * failing Airbnb never blocks a save — the last known reservations keep
 * blocking. Never throws.
 */
export async function readAirbnbCalendar(): Promise<{ reservations: AirbnbReservation[]; status: AirbnbSyncStatus }> {
  const url = process.env.AIRBNB_ICAL_URL;
  if (!url) return { reservations: [], status: { enabled: false, fetchedAt: null, error: null } };

  let cache: Awaited<ReturnType<typeof prisma.airbnbCalendarCache.findUnique>> = null;
  try {
    cache = await prisma.airbnbCalendarCache.findUnique({ where: { id: CACHE_ID } });
  } catch {
    // Table missing (schema not pushed yet) — behave as if never fetched.
  }
  const cached = (cache?.reservations as AirbnbReservation[] | undefined) ?? [];
  const statusFrom = (c: typeof cache) => ({
    enabled: true,
    fetchedAt: c && c.fetchedAt.getTime() > 0 ? c.fetchedAt.toISOString() : null,
    error: c?.lastError ?? null,
  });
  if (cache && Date.now() - cache.checkedAt.getTime() < MAX_AGE_MS) {
    return { reservations: cached, status: statusFrom(cache) };
  }

  const now = new Date();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) throw new Error(`Airbnb answered HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("The Airbnb link didn't return a calendar");
    const reservations = parseAirbnbIcal(text);
    const saved = await prisma.airbnbCalendarCache.upsert({
      where: { id: CACHE_ID },
      create: { id: CACHE_ID, reservations, fetchedAt: now, checkedAt: now, lastError: null },
      update: { reservations, fetchedAt: now, checkedAt: now, lastError: null },
    });
    return { reservations, status: statusFrom(saved) };
  } catch (e) {
    // Never echo the URL (it's a secret) — just what went wrong.
    const reason =
      e instanceof Error && e.name === "TimeoutError" ? "Airbnb didn't answer in time" : e instanceof Error ? e.message : "Unknown error";
    try {
      const saved = await prisma.airbnbCalendarCache.upsert({
        where: { id: CACHE_ID },
        create: { id: CACHE_ID, reservations: [], fetchedAt: new Date(0), checkedAt: now, lastError: reason },
        update: { checkedAt: now, lastError: reason },
      });
      return { reservations: cached, status: statusFrom(saved) };
    } catch {
      return { reservations: cached, status: { enabled: true, fetchedAt: null, error: reason } };
    }
  }
}

/** Airbnb reservations not in the app yet (see unmatchedReservations), plus the sync status. */
export async function airbnbBlocks(): Promise<{ blocks: AirbnbReservation[]; status: AirbnbSyncStatus }> {
  const { reservations, status } = await readAirbnbCalendar();
  if (reservations.length === 0) return { blocks: [], status };
  const today = homestayToday();
  const rows = await prisma.booking.findMany({ where: { checkOut: { gt: isoToDate(today) } } });
  return { blocks: unmatchedReservations(reservations, rows.map(bookingFromDb), today), status };
}

/**
 * Refuses DIRECT booking dates that overlap an Airbnb reservation not yet in
 * the app. Airbnb bookings aren't checked: Airbnb already keeps its own
 * reservations apart, and an Airbnb booking being edited would otherwise
 * clash with its own reservation. Call before (not inside) a transaction —
 * it may read Airbnb's feed over the network.
 */
export async function assertNoAirbnbClash(checkIn: string, checkOut: string): Promise<void> {
  const { blocks } = await airbnbBlocks();
  const clash = blocks.find((b) => b.checkIn < checkOut && checkIn < b.checkOut);
  if (clash) {
    throw new ValidationError(
      `These dates overlap an Airbnb reservation (${clash.checkIn} to ${clash.checkOut}) that isn't in the app yet. Double bookings aren't allowed.`,
    );
  }
}
