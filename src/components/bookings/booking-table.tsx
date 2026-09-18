"use client";

import { PaymentBadge, SourceBadge } from "@/components/ui/badge";
import {
  CardField,
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
    <>
      <CardList>
        {bookings.map((b) => {
          const nights = nightCount(b.checkIn, b.checkOut);
          return (
            <CardRow key={b.id}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-slate-900">
                      {b.guestName}
                    </span>
                    <SourceBadge source={b.source} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDate(b.checkIn)} → {formatDate(b.checkOut)} ·{" "}
                    {nights}n
                  </p>
                </div>
                <PaymentBadge status={b.paymentStatus} />
              </div>

              <div className="space-y-1 rounded-md bg-slate-50 p-2.5">
                <CardField label="Payout">
                  {formatCurrency(b.totalPayout)}
                </CardField>
                <CardField label="Net">
                  <span className="font-medium text-slate-900">
                    {formatCurrency(bookingNetIncome(b))}
                  </span>
                </CardField>
                <CardField label="Guests">{b.guestsCount}</CardField>
              </div>

              {b.notes || b.contactInfo ? (
                <p className="mt-2 truncate text-xs text-slate-400">
                  {b.contactInfo || b.notes}
                </p>
              ) : null}

              <div className="mt-2.5">
                <RowActions onEdit={() => onEdit(b)} onDelete={() => onDelete(b)} />
              </div>
            </CardRow>
          );
        })}
      </CardList>

      <TableWrap>
        <Table>
          <Thead>
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
              Amount
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
          </Thead>
          <tbody className="divide-y divide-slate-100">
            {bookings.map((b) => {
              const nights = nightCount(b.checkIn, b.checkOut);
              return (
                <Tr key={b.id}>
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
                    <div className="font-medium text-slate-900">
                      {formatCurrency(bookingNetIncome(b))}
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatCurrency(b.totalPayout)} payout
                      {b.platformFee ? ` · ${formatCurrency(b.platformFee)} fee` : ""}
                    </div>
                  </Td>
                  <Td>
                    <PaymentBadge status={b.paymentStatus} />
                  </Td>
                  <Td align="right">
                    <RowActions
                      onEdit={() => onEdit(b)}
                      onDelete={() => onDelete(b)}
                    />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}
