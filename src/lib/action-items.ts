import type { AirbnbReservation } from "./airbnb-ical";
import { addDays, daysBetween } from "./dates";
import { formatCurrency } from "./format";
import { payablesSummary } from "./selectors";
import type { Booking, BookingRequest, CleaningRecord, Expense, ISODate } from "./types";

/**
 * The dashboard's "Action items": things someone needs to do, built from the
 * data the app already has. A pure function so every rule is unit-tested.
 * Always "right now" — the dashboard's month filter doesn't apply.
 */

export type Urgency = "overdue" | "soon" | "later";

export type ItemAction =
  | { type: "link"; href: string; label: string }
  | { type: "markBookingPaid"; bookingId: string }
  | { type: "editBooking"; bookingId: string }
  | { type: "editCleaning"; cleaningId: string }
  | { type: "markCleaningDone"; cleaningId: string }
  | { type: "markCleaningPaid"; cleaningId: string };

export type ActionItem = {
  /** Stable across refreshes, for React keys and busy states. */
  id: string;
  urgency: Urgency;
  title: string;
  detail: string;
  action: ItemAction;
  /** Orders items of the same urgency: earliest first. */
  sortKey: string;
};

/** How far ahead "soon" looks for payments to collect and cleaners to assign. */
export const SOON_DAYS = 3;
/** A booking request waiting longer than this is overdue. */
export const REQUEST_OVERDUE_HOURS = 24;
/** An unrefunded expense older than this moves up from "later" to "soon". */
export const REFUND_SOON_DAYS = 14;

export type ActionInput = {
  bookings: Booking[];
  cleaning: CleaningRecord[];
  expenses: Expense[];
  bookingRequests: BookingRequest[];
  /** Airbnb stays that ended but were never imported (see finishedUnimported). */
  airbnbFinished: AirbnbReservation[];
  airbnbError: string | null;
  today: ISODate;
  now: Date;
};

const RANK: Record<Urgency, number> = { overdue: 0, soon: 1, later: 2 };
/**
 * Amounts here are the same ones the dashboard's "Money to settle" card and
 * the Expenses page's "Still payable" banner show, so they are formatted the
 * same way: whole pesos when there are no centavos, exact when there are.
 */
const peso = (n: number) => formatCurrency(n);
const shortDate = (iso: ISODate) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function relativeDay(iso: ISODate, today: ISODate): string {
  const d = daysBetween(today, iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

function age(fromIso: string, now: Date): string {
  const hours = Math.max(0, (now.getTime() - new Date(fromIso).getTime()) / 36e5);
  if (hours < 1) return "less than an hour ago";
  if (hours < 24) return `${Math.floor(hours)} h ago`;
  return plural(Math.floor(hours / 24), "day") + " ago";
}

export function buildActionItems(input: ActionInput): ActionItem[] {
  const { bookings, cleaning, expenses, bookingRequests, airbnbFinished, airbnbError, today, now } = input;
  const soon = addDays(today, SOON_DAYS);
  const items: ActionItem[] = [];

  // 9. The Airbnb calendar couldn't be read — the blocking may be stale.
  if (airbnbError) {
    items.push({
      id: "airbnb-sync",
      urgency: "overdue",
      title: "Airbnb calendar sync problem",
      detail: `Last check failed: ${airbnbError}. New Airbnb reservations may not block direct bookings.`,
      action: { type: "link", href: "/bookings", label: "Details" },
      sortKey: "",
    });
  }

  // 1. Guests' booking requests — one row for all of them.
  const pending = bookingRequests.filter((r) => r.status === "pending");
  if (pending.length > 0) {
    const oldest = pending.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
    const hours = (now.getTime() - new Date(oldest.createdAt).getTime()) / 36e5;
    items.push({
      id: "requests",
      urgency: hours > REQUEST_OVERDUE_HOURS ? "overdue" : "soon",
      title: `${plural(pending.length, "booking request")} waiting`,
      detail: pending.length === 1 ? `${oldest.guestName} · sent ${age(oldest.createdAt, now)}` : `Oldest sent ${age(oldest.createdAt, now)}`,
      action: { type: "link", href: "/bookings", label: "Review" },
      sortKey: oldest.createdAt,
    });
  }

  for (const b of bookings) {
    // 3. A booking with no payout yet (e.g. approved from a request).
    if (b.totalPayout === 0) {
      items.push({
        id: `payout-${b.id}`,
        urgency: b.checkIn <= today ? "soon" : "later",
        title: `Add the payout for ${b.guestName}`,
        detail: `${shortDate(b.checkIn)} – ${shortDate(b.checkOut)} · still ₱0`,
        action: { type: "editBooking", bookingId: b.id },
        sortKey: b.checkIn,
      });
      continue; // Collecting a ₱0 payment makes no sense — fill the payout first.
    }
    // 2. A direct guest who hasn't paid, checking in soon (or already in).
    // Airbnb pays out on its own; those come in through the CSV import.
    if (b.source === "direct" && b.paymentStatus !== "paid" && b.checkIn <= soon) {
      const started = b.checkIn < today;
      items.push({
        id: `pay-${b.id}`,
        urgency: started ? "overdue" : "soon",
        title: `Collect payment from ${b.guestName}`,
        detail: `${started ? "Checked in" : "Checks in"} ${shortDate(b.checkIn)}${started ? "" : ` (${relativeDay(b.checkIn, today)})`} · ${b.paymentStatus === "partial" ? "Partial" : "Pending"} · ${peso(b.totalPayout)}`,
        action: { type: "markBookingPaid", bookingId: b.id },
        sortKey: b.checkIn,
      });
    }
  }

  for (const c of cleaning) {
    const who = c.cleanerName.trim();
    if (c.status === "scheduled" && c.date < today) {
      // 5. The date has passed but nobody marked it done.
      items.push({
        id: `done-${c.id}`,
        urgency: "overdue",
        title: "Mark cleaning done",
        detail: `${shortDate(c.date)} (${relativeDay(c.date, today)})${who ? ` · ${who}` : " · no cleaner assigned"}`,
        action: { type: "markCleaningDone", cleaningId: c.id },
        sortKey: c.date,
      });
    } else if (c.status === "scheduled" && !who && c.date <= soon) {
      // 4. Coming up with no cleaner.
      items.push({
        id: `assign-${c.id}`,
        urgency: c.date === today ? "overdue" : "soon",
        title: "Assign a cleaner",
        detail: `${shortDate(c.date)} (${relativeDay(c.date, today)})`,
        action: { type: "editCleaning", cleaningId: c.id },
        sortKey: c.date,
      });
    } else if (c.status === "completed" && c.paymentStatus === "unpaid") {
      // 6. Done but the cleaner isn't paid.
      items.push({
        id: `paycleaner-${c.id}`,
        urgency: "soon",
        title: `Pay ${who || "the cleaner"} ${peso(c.paymentAmount)}`,
        detail: `Cleaning on ${shortDate(c.date)}`,
        action: { type: "markCleaningPaid", cleaningId: c.id },
        sortKey: c.date,
      });
    }
  }

  // 7. Owners waiting to be paid back — one row per person. The same
  // payables figure the Expenses page and the dashboard show, so the amount
  // on this action item is the amount the owner will find there.
  for (const p of payablesSummary(expenses).byPayer) {
    items.push({
      id: `refund-${p.who}`,
      urgency: daysBetween(p.oldest, today) > REFUND_SOON_DAYS ? "soon" : "later",
      title: `Refund ${p.who} ${peso(p.total)}`,
      detail: `${plural(p.count, "expense")} not yet refunded · oldest ${shortDate(p.oldest)}`,
      action: {
        type: "link",
        href: `/expenses?refund=owed${p.who === "Unknown" ? "" : `&paidBy=${encodeURIComponent(p.who)}`}`,
        label: "Review",
      },
      sortKey: p.oldest,
    });
  }

  // 8. Airbnb stays that are over but not imported — their payout is missing.
  const ended = airbnbFinished;
  if (ended.length > 0) {
    items.push({
      id: "airbnb-import",
      urgency: "later",
      title: `Import ${plural(ended.length, "finished Airbnb stay")}`,
      detail: "Their payouts aren't in your numbers until you import the Airbnb CSV",
      action: { type: "link", href: "/bookings?import=1", label: "Import CSV" },
      sortKey: ended[0].checkOut,
    });
  }

  return items.sort((a, b) => RANK[a.urgency] - RANK[b.urgency] || a.sortKey.localeCompare(b.sortKey));
}
