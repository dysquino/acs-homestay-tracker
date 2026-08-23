"use client";

import { PaymentBadge, SourceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Table, TableWrap, Td, Th } from "@/components/ui/table";
import { nightCount } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { bookingNetIncome } from "@/lib/selectors";
import type { Booking } from "@/lib/types";

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

export function BookingTable({
  bookings,
  sort,
  onSort,
  onEdit,
  onDelete,
  emptyAction,
}: {
  bookings: Booking[];
  sort: Sort;
  onSort: (key: BookingSortKey) => void;
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

  const dirFor = (key: BookingSortKey) => (sort.key === key ? sort.dir : null);

  return (
    <TableWrap>
      <Table>
        <thead>
          <tr className="bg-slate-50">
            <Th onClick={() => onSort("guestName")} sort={dirFor("guestName")}>
              Guest
            </Th>
            <Th onClick={() => onSort("source")} sort={dirFor("source")}>
              Source
            </Th>
            <Th onClick={() => onSort("checkIn")} sort={dirFor("checkIn")}>
              Stay
            </Th>
            <Th align="right" className="hidden sm:table-cell">
              Guests
            </Th>
            <Th
              align="right"
              onClick={() => onSort("totalPayout")}
              sort={dirFor("totalPayout")}
            >
              Payout
            </Th>
            <Th align="right" className="hidden md:table-cell">
              Fee
            </Th>
            <Th align="right" className="hidden md:table-cell">
              Net
            </Th>
            <Th
              onClick={() => onSort("paymentStatus")}
              sort={dirFor("paymentStatus")}
            >
              Payment
            </Th>
            <Th align="right">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {bookings.map((b) => {
            const nights = nightCount(b.checkIn, b.checkOut);
            return (
              <tr key={b.id} className="hover:bg-slate-50/70">
                <Td>
                  <div className="font-medium text-slate-900">
                    {b.guestName}
                  </div>
                  {b.contactInfo ? (
                    <div className="text-xs text-slate-500">
                      {b.contactInfo}
                    </div>
                  ) : null}
                  {b.notes ? (
                    <div className="mt-0.5 max-w-xs truncate text-xs text-slate-400">
                      {b.notes}
                    </div>
                  ) : null}
                </Td>
                <Td>
                  <SourceBadge source={b.source} />
                </Td>
                <Td>
                  <div className="whitespace-nowrap text-slate-900">
                    {formatDate(b.checkIn)}
                  </div>
                  <div className="whitespace-nowrap text-xs text-slate-500">
                    → {formatDate(b.checkOut)} · {nights}n
                  </div>
                </Td>
                <Td align="right" className="hidden sm:table-cell">
                  {b.guestsCount}
                </Td>
                <Td align="right" className="whitespace-nowrap">
                  {formatCurrency(b.totalPayout)}
                </Td>
                <Td
                  align="right"
                  className="hidden whitespace-nowrap text-slate-500 md:table-cell"
                >
                  {b.platformFee ? formatCurrency(b.platformFee) : "—"}
                </Td>
                <Td
                  align="right"
                  className="hidden whitespace-nowrap font-medium text-slate-900 md:table-cell"
                >
                  {formatCurrency(bookingNetIncome(b))}
                </Td>
                <Td>
                  <PaymentBadge status={b.paymentStatus} />
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1 whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(b)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => onDelete(b)}
                    >
                      Delete
                    </Button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}
