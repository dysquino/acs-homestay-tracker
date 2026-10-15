import { timingSafeEqual } from "crypto";

import { homestayToday } from "@/lib/booking-link";
import { airbnbBlocks } from "@/lib/data/airbnb-calendar";
import { loadBookings, loadCleaning, loadExpenses, loadPendingRequests } from "@/lib/data/loaders";
import {
  airbnbNotification,
  morningSummary,
  reservationKey,
  unannouncedReservations,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { notifyOwners, pushConfigured } from "@/lib/push-server";

/**
 * Scheduled notifications, called by .github/workflows/notify.yml:
 *   POST /api/cron/notify?job=summary   — the 8 AM summary
 *   POST /api/cron/notify?job=airbnb    — new Airbnb reservations (hourly)
 * Outside the access gate (a scheduler can't log in); it checks
 * `Authorization: Bearer <CRON_SECRET>` instead. Read-only for the app's
 * data — it only records which Airbnb reservations were announced.
 */

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return new Response("Not found", { status: 404 });
  if (!pushConfigured()) return Response.json({ ok: false, reason: "VAPID keys not set" }, { status: 503 });

  const job = new URL(request.url).searchParams.get("job");
  if (job === "summary") return Response.json(await summaryJob());
  if (job === "airbnb") return Response.json(await airbnbJob());
  return Response.json({ ok: false, reason: "unknown job" }, { status: 400 });
}

async function summaryJob() {
  const [bookings, cleaning, expenses, bookingRequests, airbnb] = await Promise.all([
    loadBookings(),
    loadCleaning(),
    loadExpenses(),
    loadPendingRequests(),
    airbnbBlocks(),
  ]);
  const payload = morningSummary({
    bookings,
    cleaning,
    expenses,
    bookingRequests,
    airbnbFinished: airbnb.finished,
    airbnbError: airbnb.status.enabled ? airbnb.status.error : null,
    today: homestayToday(),
    now: new Date(),
  });
  if (!payload) return { ok: true, job: "summary", skipped: "nothing to report today" };
  return { ok: true, job: "summary", ...(await notifyOwners("summary", payload)) };
}

/** Marks that the first Airbnb run (which announces nothing) has happened. */
const SEEDED = "__seeded__";

async function airbnbJob() {
  const { blocks, status } = await airbnbBlocks();
  if (!status.enabled) return { ok: true, job: "airbnb", skipped: "Airbnb calendar not connected" };

  const announced = new Set((await prisma.airbnbNotified.findMany({ select: { key: true } })).map((r) => r.key));
  const fresh = unannouncedReservations(blocks, announced);

  // The very first run only remembers what's already there — announcing
  // every existing reservation at once would be noise, not news. A marker
  // row records that it happened, even when there was nothing to remember.
  if (!announced.has(SEEDED)) {
    await prisma.airbnbNotified.createMany({
      data: [{ key: SEEDED }, ...fresh.map((r) => ({ key: reservationKey(r) }))],
      skipDuplicates: true,
    });
    return { ok: true, job: "airbnb", seeded: fresh.length };
  }
  if (fresh.length === 0) return { ok: true, job: "airbnb", fresh: 0 };

  await prisma.airbnbNotified.createMany({
    data: fresh.map((r) => ({ key: reservationKey(r) })),
    skipDuplicates: true,
  });
  const payload = airbnbNotification(fresh)!;
  return { ok: true, job: "airbnb", fresh: fresh.length, ...(await notifyOwners("airbnb", payload)) };
}
