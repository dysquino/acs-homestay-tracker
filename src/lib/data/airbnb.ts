"use server";

import type { AirbnbReservation } from "@/lib/airbnb-ical";

import { requireSiteAccess } from "./access";
import { airbnbBlocks, type AirbnbSyncStatus } from "./airbnb-calendar";

/** Owner-side view of the Airbnb calendar sync (behind the access code). */

export async function listAirbnbBlocks(): Promise<{ blocks: AirbnbReservation[]; status: AirbnbSyncStatus }> {
  await requireSiteAccess();
  try {
    return await airbnbBlocks();
  } catch {
    // Never let the sync stop the app from loading its own data.
    return { blocks: [], status: { enabled: Boolean(process.env.AIRBNB_ICAL_URL), fetchedAt: null, error: "Couldn't check the Airbnb calendar" } };
  }
}

/** The path of the direct-bookings feed Airbnb imports, or null if no key is set. */
export async function getCalendarFeedPath(): Promise<string | null> {
  await requireSiteAccess();
  const key = process.env.CALENDAR_FEED_KEY;
  return key ? `/api/calendar/${encodeURIComponent(key)}.ics` : null;
}
