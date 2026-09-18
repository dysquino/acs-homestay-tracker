"use client";

import { PaymentBadge, SourceBadge } from "@/components/ui/badge";
import { EmptyState, RowActions } from "@/components/ui/table";
import { nightCount } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { bookingNetIncome } from "@/lib/selectors";
import type { Booking } from "@/lib/types";

/**
 * Reservations read better as cards than spreadsheet rows — a guest name,
 * a stay, an amount, and a status are exactly the shape hospitality/host
 * dashboards (Airbnb's own host tools included) use cards for, reserving
 * dense tables for ledger-style data (see expenses/cleaning, which stay
 * tabular). This replaced what used to be BookingTable.
 */

export type BookingSortKey =
  | "checkIn"
  | "guestName"
  | "source"
  | "totalPayout"
  | "paymentStatus";

export type Sort = { key: BookingSortKey; dir: "asc" | "desc" };

export function sortBookings(bookings: Booking[], sort: Sort): Booking[] {
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...bookings].sort((a, b) => {
    switch (sort.key) {
      case "totalPayout":
        return (a.totalPayout - b.totalPayout) * factor;
      case "guestName":
        return a.guestName.localeCompare(b.guestName) * factor;
      case "source":
        return a.source.localeCompare(b.source) * factor;
      case "paymentStatus":
        return a.paymentStatus.localeCompare(b.paymentStatus) * factor;
      default:
        return a.checkIn.localeCompare(b.checkIn) * factor;
    }
  });
}

export function BookingCards({
  bookings,
  onEdit,
  onDelete,
  emptyAction,
}: {
  bookings: Booking[];
  onEdit: (booking: Booking) => void;
  onDelete: (booking: Booking) => void;
  emptyAction?: React.ReactNode;
}) {
  if (bookings.length === 0) {
    return (
      <EmptyState
        title="No bookings match"
        message="Try clearing the filters, or add the first booking."
        action={emptyAction}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {bookings.map((b) => {
        const nights = nightCount(b.checkIn, b.checkOut);
        return (
          <div
            key={b.id}
            className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {b.guestName}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatDate(b.checkIn)} → {formatDate(b.checkOut)} ·{" "}
                  {nights}n
                </p>
              </div>
              <SourceBadge source={b.source} />
            </div>

            <div className="mt-3 flex items-baseline justify-between rounded-md bg-slate-50 px-3 py-2">
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {formatCurrency(bookingNetIncome(b))}
                </p>
                <p className="text-[11px] text-slate-400">
                  {formatCurrency(b.totalPayout)} payout
                  {b.platformFee ? ` · ${formatCurrency(b.platformFee)} fee` : ""}
                </p>
              </div>
              <PaymentBadge status={b.paymentStatus} />
            </div>

            {b.contactInfo || b.notes ? (
              <p className="mt-2 truncate text-xs text-slate-400">
                {b.contactInfo || b.notes}
              </p>
            ) : null}

            <div className="mt-auto flex items-center justify-between pt-3">
              <span className="text-xs text-slate-400">
                {b.guestsCount} guest{b.guestsCount === 1 ? "" : "s"}
              </span>
              <RowActions onEdit={() => onEdit(b)} onDelete={() => onDelete(b)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
