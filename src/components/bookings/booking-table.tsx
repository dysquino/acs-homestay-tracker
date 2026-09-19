"use client";

import type { ReactNode } from "react";

import { PaymentBadge, SourceBadge } from "@/components/ui/badge";
import {
  CardList,
  CardRow,
  EmptyState,
  RowActions,
  Table,
  TableWrap,
  Td,
  Th,
  Thead,
  Tr,
} from "@/components/ui/table";
import { nightCount } from "@/lib/dates";
import { formatCurrency, formatDate, formatShortDate } from "@/lib/format";
import { bookingNetIncome } from "@/lib/selectors";
import type { Booking } from "@/lib/types";

/**
 * One row per booking. Cards cost ~260px of height each, which stops working
 * once there are dozens of reservations; a row costs ~44px, the columns line
 * up so amounts and dates can be scanned and sorted, and the footer totals
 * whatever the filters left. Phones get a compact stacked list instead
 * (see <CardList> in ui/table).
 */

export type BookingSortKey =
  | "checkIn"
  | "guestName"
  | "source"
  | "netIncome"
  | "paymentStatus";

export type Sort = { key: BookingSortKey; dir: "asc" | "desc" };

/** Pending → partial → paid: the order a payment actually progresses. */
const PAYMENT_RANK: Record<Booking["paymentStatus"], number> = {
  pending: 0,
  partial: 1,
  paid: 2,
};

export function sortBookings(bookings: Booking[], sort: Sort): Booking[] {
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...bookings].sort((a, b) => {
    switch (sort.key) {
      case "netIncome":
        return (bookingNetIncome(a) - bookingNetIncome(b)) * factor;
      case "guestName":
        return a.guestName.localeCompare(b.guestName) * factor;
      case "source":
        return a.source.localeCompare(b.source) * factor;
      case "paymentStatus":
        return (PAYMENT_RANK[a.paymentStatus] - PAYMENT_RANK[b.paymentStatus]) * factor;
      default:
        return a.checkIn.localeCompare(b.checkIn) * factor;
    }
  });
}

export function BookingTable({
  bookings,
  sort,
  onSortChange,
  onEdit,
  onDelete,
  emptyAction,
}: {
  bookings: Booking[];
  sort: Sort;
  onSortChange: (sort: Sort) => void;
  onEdit: (booking: Booking) => void;
  onDelete: (booking: Booking) => void;
  emptyAction?: ReactNode;
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
  const toggleSort = (key: BookingSortKey) =>
    onSortChange(
      sort.key === key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );

  const netTotal = bookings.reduce((s, b) => s + bookingNetIncome(b), 0);
  const nightsTotal = bookings.reduce((s, b) => s + nightCount(b.checkIn, b.checkOut), 0);
  const count = `${bookings.length} booking${bookings.length === 1 ? "" : "s"}`;

  return (
    <>
      <CardList>
        {bookings.map((b) => (
          <CardRow key={b.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{b.guestName}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatShortDate(b.checkIn)} → {formatShortDate(b.checkOut)} ·{" "}
                  {nightCount(b.checkIn, b.checkOut)}n
                </p>
              </div>
              <p className="shrink-0 font-semibold text-slate-900">
                {formatCurrency(bookingNetIncome(b))}
              </p>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <SourceBadge source={b.source} />
                <PaymentBadge status={b.paymentStatus} />
              </div>
              <RowActions onEdit={() => onEdit(b)} onDelete={() => onDelete(b)} />
            </div>
          </CardRow>
        ))}
        <li className="flex items-baseline justify-between gap-3 bg-slate-50 px-4 py-2.5 text-sm">
          <span className="font-medium text-slate-700">{count}</span>
          <span className="font-semibold text-slate-900">{formatCurrency(netTotal)}</span>
        </li>
      </CardList>

      <TableWrap>
        <Table>
          <Thead>
            <Th onClick={() => toggleSort("guestName")} sort={dirFor("guestName")}>
              Guest
            </Th>
            <Th onClick={() => toggleSort("source")} sort={dirFor("source")}>
              Source
            </Th>
            <Th onClick={() => toggleSort("checkIn")} sort={dirFor("checkIn")}>
              Check-in
            </Th>
            <Th>Check-out</Th>
            <Th align="right">Nights</Th>
            <Th align="right">Guests</Th>
            <Th align="right" onClick={() => toggleSort("netIncome")} sort={dirFor("netIncome")}>
              Payout
            </Th>
            <Th onClick={() => toggleSort("paymentStatus")} sort={dirFor("paymentStatus")}>
              Payment
            </Th>
            <Th align="right">
              <span className="sr-only">Actions</span>
            </Th>
          </Thead>
          <tbody className="divide-y divide-slate-100">
            {bookings.map((b) => (
              <Tr key={b.id}>
                <Td>
                  <div className="flex max-w-sm items-baseline gap-2">
                    <span className="shrink-0 font-medium text-slate-900">{b.guestName}</span>
                    {b.contactInfo || b.notes ? (
                      <span className="hidden truncate text-xs text-slate-400 xl:inline" title={b.contactInfo || b.notes}>
                        {b.contactInfo || b.notes}
                      </span>
                    ) : null}
                  </div>
                </Td>
                <Td>
                  <SourceBadge source={b.source} />
                </Td>
                <Td className="whitespace-nowrap">{formatDate(b.checkIn)}</Td>
                <Td className="whitespace-nowrap">{formatDate(b.checkOut)}</Td>
                <Td align="right" className="tabular-nums">
                  {nightCount(b.checkIn, b.checkOut)}
                </Td>
                <Td align="right" className="tabular-nums">
                  {b.guestsCount}
                </Td>
                <Td align="right" className="whitespace-nowrap">
                  <span
                    className="font-medium text-slate-900 tabular-nums"
                    title={b.platformFee ? `Airbnb service fee ${formatCurrency(b.platformFee)} (already deducted)` : undefined}
                  >
                    {formatCurrency(bookingNetIncome(b))}
                  </span>
                </Td>
                <Td>
                  <PaymentBadge status={b.paymentStatus} />
                </Td>
                <Td align="right">
                  <RowActions onEdit={() => onEdit(b)} onDelete={() => onDelete(b)} />
                </Td>
              </Tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50">
            <tr>
              <Td className="font-medium text-slate-700">{count}</Td>
              <Td>{null}</Td>
              <Td>{null}</Td>
              <Td>{null}</Td>
              <Td align="right" className="font-medium tabular-nums text-slate-700">
                {nightsTotal}
              </Td>
              <Td>{null}</Td>
              <Td align="right" className="font-semibold whitespace-nowrap tabular-nums text-slate-900">
                {formatCurrency(netTotal)}
              </Td>
              <Td>{null}</Td>
              <Td>{null}</Td>
            </tr>
          </tfoot>
        </Table>
      </TableWrap>
    </>
  );
}
