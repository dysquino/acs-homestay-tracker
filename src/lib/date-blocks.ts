import { addDays, daysBetween } from "./dates";
import type { Booking, DateBlock, DateBlockInput, ISODate } from "./types";
import { ValidationError } from "./validation";

/** Marks the booking-shaped stand-ins below, which aren't real bookings. */
export const DATE_BLOCK_PREFIX = "date-block:";

/** The longest span one block may cover. */
export const MAX_BLOCK_DAYS = 366;

/**
 * A blocked span shaped like a booking, so the overlap checks and the
 * calendar can treat it like one. Never saved as a booking.
 */
export function dateBlockAsBooking(b: DateBlock): Booking {
  return {
    id: `${DATE_BLOCK_PREFIX}${b.id}`,
    guestName: b.reason ? `Blocked — ${b.reason}` : "Blocked",
    source: "direct",
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    guestsCount: 0,
    totalPayout: 0,
    platformFee: 0,
    paymentStatus: "paid",
    contactInfo: "",
    notes: "",
    createdBy: b.createdBy,
    confirmationCode: null,
    hasPaymentScreenshot: false,
    paymentScreenshotMime: null,
    hasIdPhoto: false,
    idPhotoMime: null,
  };
}

export const isDateBlock = (b: Pick<Booking, "id">) => b.id.startsWith(DATE_BLOCK_PREFIX);
export const dateBlockId = (b: Pick<Booking, "id">) => b.id.slice(DATE_BLOCK_PREFIX.length);

/** The owners pick days (first and last, inclusive); a block stores nights. */
export function blockFromDays(firstDay: ISODate, lastDay: ISODate): { checkIn: ISODate; checkOut: ISODate } {
  return { checkIn: firstDay, checkOut: addDays(lastDay, 1) };
}

/** How many days a block covers (its last day is the day before checkOut). */
export const blockDays = (b: Pick<DateBlock, "checkIn" | "checkOut">) => daysBetween(b.checkIn, b.checkOut);

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function validateDateBlock(input: DateBlockInput): void {
  if (!ISO.test(input.checkIn) || !ISO.test(input.checkOut)) throw new ValidationError("Pick the first and last day.");
  if (input.checkOut <= input.checkIn) throw new ValidationError("The last day can't be before the first day.");
  if (blockDays(input) > MAX_BLOCK_DAYS) throw new ValidationError(`Block at most ${MAX_BLOCK_DAYS} days at a time.`);
  if (input.reason.length > 200) throw new ValidationError("Keep the reason under 200 characters.");
}
