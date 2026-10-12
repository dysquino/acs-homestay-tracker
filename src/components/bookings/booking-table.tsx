"use client";

import { useState, type ReactNode } from "react";

import { PaymentBadge, SourceBadge } from "@/components/ui/badge";
import {
  CardList,
  GroupHeading,
  CompactRow,
  EmptyState,
  RowActions,
  RowTitle,
  Table,
  TableWrap,
  Td,
  Th,
  Thead,
  Tr,
} from "@/components/ui/table";
import { DetailSheet } from "@/components/ui/detail-sheet";
import { Pagination } from "@/components/ui/pagination";
import { IdPhotoProof } from "@/components/bookings/id-photo";
import { PaymentProof } from "@/components/bookings/payment-proof";
import { nightCount } from "@/lib/dates";
import { formatCurrency, formatDate, formatMonth, formatShortDate } from "@/lib/format";
import { bookingNetIncome, groupRuns } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import type { Booking } from "@/lib/types";
import { usePagination } from "@/lib/use-pagination";

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
  resetKey,
}: {
  bookings: Booking[];
  /** Changes with the page's filters/sort — sends the table back to page 1. */
  resetKey: string;
  sort: Sort;
  onSortChange: (sort: Sort) => void;
  onEdit: (booking: Booking) => void;
  onDelete: (booking: Booking) => void;
  emptyAction?: ReactNode;
}) {
  // Totals below cover every filtered booking; only the rows are paged.
  const paging = usePagination(bookings, resetKey);
  // For re-fetching after the photo viewers attach/remove.
  const { resync } = useStore();
  // The booking whose details are open; looked up fresh so an edit shows.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = bookings.find((b) => b.id === selectedId) ?? null;
  const setSelected = (b: Booking | null) => setSelectedId(b?.id ?? null);

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
  // Month headings for the phone/tablet list, when it's in check-in order.
  const monthGroups =
    sort.key === "checkIn"
      ? groupRuns(paging.pageItems, bookings, (b) => b.checkIn.slice(0, 7), bookingNetIncome)
      : null;

  return (
    <>
      <CardList>
        {(monthGroups ?? [{ key: "", items: paging.pageItems, count: 0, total: 0 }]).map((g) => [
          monthGroups ? (
            <GroupHeading
              key={`month-${g.key}`}
              title={formatMonth(`${g.key}-01`)}
              detail={`${g.count} booking${g.count === 1 ? "" : "s"}`}
              amount={formatCurrency(g.total)}
            />
          ) : null,
          ...g.items.map((b) => (
          <CompactRow
            key={b.id}
            onOpen={() => setSelected(b)}
            title={b.guestName}
            subtitle={`${formatShortDate(b.checkIn)} → ${formatShortDate(b.checkOut)} · ${nightCount(b.checkIn, b.checkOut)}n`}
            amount={formatCurrency(bookingNetIncome(b))}
            tags={<PaymentBadge status={b.paymentStatus} />}
          />
          )),
        ])}
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
            {paging.pageItems.map((b) => (
              <Tr key={b.id}>
                <Td>
                  <div className="flex max-w-sm items-baseline gap-2">
                    <span className="shrink-0">
                      <RowTitle onOpen={() => setSelected(b)}>{b.guestName}</RowTitle>
                    </span>
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
      <Pagination paging={paging} noun="bookings" />

      <DetailSheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.guestName ?? ""}
        tags={
          selected ? (
            <>
              <SourceBadge source={selected.source} />
              <PaymentBadge status={selected.paymentStatus} />
            </>
          ) : null
        }
        fields={
          selected
            ? [
                { label: "Check-in", value: formatDate(selected.checkIn) },
                { label: "Check-out", value: formatDate(selected.checkOut) },
                { label: "Nights", value: nightCount(selected.checkIn, selected.checkOut) },
                { label: "Guests", value: selected.guestsCount },
                { label: "Payout", value: <span className="font-semibold">{formatCurrency(bookingNetIncome(selected))}</span> },
                ...(selected.platformFee
                  ? [{ label: "Airbnb service fee", value: `${formatCurrency(selected.platformFee)} (already deducted)` }]
                  : []),
                ...(selected.contactInfo ? [{ label: "Contact", value: selected.contactInfo }] : []),
                { label: "Notes", value: selected.notes || <span className="text-slate-400">—</span> },
              ]
            : []
        }
        body={
          selected ? (
            <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <div className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="shrink-0 text-slate-500">ID photo:</span>
                <IdPhotoProof
                  bookingId={selected.id}
                  entityKind="booking"
                  hasPhoto={selected.hasIdPhoto}
                  onChanged={resync}
                />
              </div>
              <div className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="shrink-0 text-slate-500">Payment screenshot:</span>
                <PaymentProof
                  bookingId={selected.id}
                  entityKind="booking"
                  hasScreenshot={selected.hasPaymentScreenshot}
                  onChanged={resync}
                />
              </div>
            </div>
          ) : null
        }
        onEdit={() => {
          if (!selected) return;
          setSelected(null);
          onEdit(selected);
        }}
        onDelete={() => {
          if (!selected) return;
          setSelected(null);
          onDelete(selected);
        }}
      />
    </>
  );
}
