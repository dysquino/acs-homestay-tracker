import { buildActionItems, type ActionInput } from "./action-items";
import type { AirbnbReservation } from "./airbnb-ical";
import { nightCount } from "./dates";
import type { ISODate } from "./types";

/**
 * What the owners' phone notifications say. Pure, so every message is
 * unit-tested; sending lives in push-server.ts.
 */

export type NotificationKind = "requests" | "summary" | "airbnb";

export type PushPayload = {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** A newer notification with the same tag replaces the older one. */
  tag: string;
};

const shortDate = (iso: ISODate) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const stay = (checkIn: ISODate, checkOut: ISODate) =>
  `${shortDate(checkIn)} – ${shortDate(checkOut)} · ${plural(nightCount(checkIn, checkOut), "night")}`;

/** Sent the moment a guest sends a request through the booking link. */
export function requestNotification(r: {
  guestName: string;
  checkIn: ISODate;
  checkOut: ISODate;
  guestsCount: number;
}): PushPayload {
  return {
    title: "New booking request",
    body: `${r.guestName} · ${stay(r.checkIn, r.checkOut)} · ${plural(r.guestsCount, "guest")}`,
    url: "/bookings",
    tag: "booking-request",
  };
}

/** How many to-dos the summary names before "+ n more". */
const SUMMARY_ITEMS = 3;

/**
 * The 8 AM summary: today's check-ins and check-outs, then what needs doing
 * (the dashboard's overdue and soon action items). Null on a day with
 * nothing to say — no notification beats an empty one.
 */
export function morningSummary(input: ActionInput): PushPayload | null {
  const { bookings, today } = input;
  const lines: string[] = [];
  const ins = bookings.filter((b) => b.checkIn === today);
  const outs = bookings.filter((b) => b.checkOut === today);
  if (ins.length) {
    lines.push(`Check-in: ${ins.map((b) => `${b.guestName} (${plural(nightCount(b.checkIn, b.checkOut), "night")})`).join(", ")}`);
  }
  if (outs.length) lines.push(`Check-out: ${outs.map((b) => b.guestName).join(", ")}`);

  const todo = buildActionItems(input).filter((i) => i.urgency !== "later");
  if (todo.length) {
    const named = todo.slice(0, SUMMARY_ITEMS).map((i) => i.title);
    const more = todo.length - named.length;
    lines.push(`To do: ${named.join("; ")}${more > 0 ? ` + ${more} more` : ""}`);
  }
  if (lines.length === 0) return null;

  const overdue = todo.filter((i) => i.urgency === "overdue").length;
  return {
    title: overdue > 0 ? `Today at ACs Homestay · ${overdue} overdue` : "Today at ACs Homestay",
    body: lines.join("\n"),
    url: "/",
    tag: "morning-summary",
  };
}

/** Same identity the calendar matching uses: the code, else the dates. */
export const reservationKey = (r: AirbnbReservation) => r.code ?? `${r.checkIn}_${r.checkOut}`;

/** Upcoming Airbnb reservations not announced yet. */
export function unannouncedReservations(upcoming: AirbnbReservation[], announced: Set<string>): AirbnbReservation[] {
  return upcoming.filter((r) => !announced.has(reservationKey(r)));
}

/** One notification for however many new Airbnb reservations turned up. */
export function airbnbNotification(fresh: AirbnbReservation[]): PushPayload | null {
  if (fresh.length === 0) return null;
  const sorted = [...fresh].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  return {
    title: fresh.length === 1 ? "New Airbnb reservation" : `${fresh.length} new Airbnb reservations`,
    body: sorted
      .slice(0, 3)
      .map((r) => stay(r.checkIn, r.checkOut))
      .concat(sorted.length > 3 ? [`+ ${sorted.length - 3} more`] : [])
      .join("\n"),
    url: "/bookings",
    tag: "airbnb-reservation",
  };
}
