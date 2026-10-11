import type { Booking, ISODate } from "./types";

/**
 * Airbnb's calendar feed (iCal), parsed — pure functions, shared by the
 * server sync and the tests.
 *
 * The feed has two kinds of events: reservations ("Reserved", with a
 * reservation link holding the code, e.g. HM5M3MR8KQ) and "Airbnb (Not
 * available)" blocks. Only reservations are used. "Not available" also covers
 * every date past the booking window, and — once Airbnb imports our direct
 * bookings feed — our own direct bookings, which would then block themselves.
 */

export type AirbnbReservation = { code: string | null; checkIn: ISODate; checkOut: ISODate };

const toISO = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

export function parseAirbnbIcal(text: string): AirbnbReservation[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const out: AirbnbReservation[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const event = block.split("END:VEVENT")[0];
    const summary = event.match(/^SUMMARY[^:\n]*:(.*)$/m)?.[1]?.trim() ?? "";
    const description = (event.match(/^DESCRIPTION[^:\n]*:(.*)$/m)?.[1] ?? "").replace(/\\n/g, "\n");
    const code = description.match(/\bHM[A-Z0-9]{8}\b/)?.[0] ?? null;
    // A reservation carries a code; "Reserved" covers a feed without the link.
    if (!code && !/^reserved$/i.test(summary)) continue;
    const start = event.match(/^DTSTART[^:\n]*:(\d{8})/m)?.[1];
    const end = event.match(/^DTEND[^:\n]*:(\d{8})/m)?.[1];
    if (!start || !end || end <= start) continue;
    out.push({ code, checkIn: toISO(start), checkOut: toISO(end) });
  }
  return out.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}

/**
 * Airbnb reservations that aren't in the app yet — the ones that should
 * block direct bookings and show on the calendar. A reservation counts as
 * already in the app when a booking has its code, or is an Airbnb booking
 * with exactly its dates (bookings entered by hand don't carry the code).
 * Past stays are dropped.
 */
export function unmatchedReservations(
  reservations: AirbnbReservation[],
  bookings: Pick<Booking, "source" | "checkIn" | "checkOut" | "confirmationCode">[],
  today: ISODate,
): AirbnbReservation[] {
  return reservations.filter(
    (r) =>
      r.checkOut > today &&
      !bookings.some(
        (b) =>
          (r.code !== null && b.confirmationCode === r.code) ||
          (b.source === "airbnb" && b.checkIn === r.checkIn && b.checkOut === r.checkOut),
      ),
  );
}

/** Calendar feed (iCal) of direct bookings, for Airbnb's "Import calendar". */
export function directBookingsIcal(
  bookings: Pick<Booking, "id" | "checkIn" | "checkOut">[],
  now: Date = new Date(),
): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = (iso: ISODate) => iso.replace(/-/g, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ACs Homestay Tracker//Direct bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:ACs Homestay direct bookings",
    ...bookings.flatMap((b) => [
      "BEGIN:VEVENT",
      `UID:${b.id}@acs-homestay-tracker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(b.checkIn)}`,
      `DTEND;VALUE=DATE:${day(b.checkOut)}`,
      // Dates only — the feed is reachable by anyone with its link.
      "SUMMARY:Direct booking",
      "TRANSP:OPAQUE",
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

/** Marks the booking-shaped stand-ins below, which aren't real bookings. */
export const AIRBNB_BLOCK_PREFIX = "airbnb-block:";

/**
 * An Airbnb reservation that isn't in the app yet, shaped like a booking so
 * the existing overlap checks and calendar can use it. Never saved; its id
 * starts with AIRBNB_BLOCK_PREFIX so the UI can tell it apart.
 */
export function blockAsBooking(r: AirbnbReservation): Booking {
  return {
    id: `${AIRBNB_BLOCK_PREFIX}${r.code ?? `${r.checkIn}_${r.checkOut}`}`,
    guestName: r.code ? `Airbnb reservation ${r.code} (not imported yet)` : "Airbnb reservation (not imported yet)",
    source: "airbnb",
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    guestsCount: 0,
    totalPayout: 0,
    platformFee: 0,
    paymentStatus: "pending",
    contactInfo: "",
    notes: "",
    createdBy: "",
    confirmationCode: r.code,
  };
}

export const isAirbnbBlock = (b: Pick<Booking, "id">) => b.id.startsWith(AIRBNB_BLOCK_PREFIX);
