"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/app-shell";
import { CleaningForm } from "@/components/cleaning/cleaning-form";
import {
  CleaningPaymentBadge,
  CleaningStatusBadge,
} from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { DateRangeFilter, FilterBar } from "@/components/ui/filter-bar";
import { PlusIcon, SparklesIcon } from "@/components/ui/icons";
import { DetailSheet } from "@/components/ui/detail-sheet";
import { ConfirmDialog } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { StatTile } from "@/components/ui/stat";
import {
  CardList,
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
import { formatCurrency, formatDate } from "@/lib/format";
import {
  amountOwedByCleaner,
  knownCleaners,
  unpaidCleanings,
} from "@/lib/selectors";
import { useStore } from "@/lib/store";
import { usePagination } from "@/lib/use-pagination";
import {
  CLEANING_PAYMENT_STATUSES,
  CLEANING_STATUSES,
  type CleaningPaymentStatus,
  type CleaningRecord,
  type CleaningStatus,
} from "@/lib/types";

export default function CleaningPage() {
  const { cleaning, bookings, updateCleaning, deleteCleaning } = useStore();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CleaningRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CleaningRecord | null>(
    null,
  );
  // The record whose details are open; looked up fresh so an edit shows.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = cleaning.find((c) => c.id === selectedId) ?? null;
  const setSelected = (c: CleaningRecord | null) => setSelectedId(c?.id ?? null);

  const [cleaner, setCleaner] = useState("all");
  const [status, setStatus] = useState<CleaningStatus | "all">("all");
  const [payment, setPayment] = useState<CleaningPaymentStatus | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const bookingById = useMemo(
    () => new Map(bookings.map((b) => [b.id, b])),
    [bookings],
  );

  const owed = useMemo(() => amountOwedByCleaner(cleaning), [cleaning]);
  const totalOwed = owed.reduce((s, o) => s + o.total, 0);
  const unpaidCount = unpaidCleanings(cleaning).length;

  const filtered = useMemo(() => {
    return cleaning
      .filter((c) => {
        const name = c.cleanerName.trim() || "Unassigned";
        if (cleaner !== "all" && name.toLowerCase() !== cleaner.toLowerCase()) return false;
        if (status !== "all" && c.status !== status) return false;
        if (payment !== "all" && c.paymentStatus !== payment) return false;
        if (from && c.date < from) return false;
        if (to && c.date > to) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [cleaning, cleaner, status, payment, from, to]);
  const paging = usePagination(filtered, JSON.stringify([cleaner, status, payment, from, to]));

  const cleanerOptions = useMemo(() => {
    const names = knownCleaners(cleaning);
    const hasUnassigned = cleaning.some((c) => !c.cleanerName.trim());
    return hasUnassigned ? [...names, "Unassigned"] : names;
  }, [cleaning]);

  const filtersActive =
    cleaner !== "all" ||
    status !== "all" ||
    payment !== "all" ||
    from !== "" ||
    to !== "";

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  const markPaidButton = (c: CleaningRecord) => (
    <Button
      size="sm"
      variant="ghost"
      className="text-emerald-700 hover:bg-emerald-50"
      onClick={() => markPaid(c)}
    >
      Mark paid
    </Button>
  );

  async function markPaid(record: CleaningRecord) {
    try {
      await updateCleaning(record.id, {
        paymentStatus: "paid",
        status: "completed",
      });
    } catch {
      alert("Couldn't update this record. Please try again.");
    }
  }

  return (
    <>
      <PageHeader
        title="Cleaning"
        description="Turnovers between guests — who cleaned, and who's been paid."
        action={
          <Button variant="primary" onClick={openAdd}>
            <PlusIcon className="h-4 w-4" />
            Add cleaning
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Owed to cleaners"
          value={formatCurrency(totalOwed)}
          hint={`${unpaidCount} completed, unpaid`}
          tone={totalOwed > 0 ? "negative" : "positive"}
        />
        <StatTile
          label="Scheduled"
          value={cleaning.filter((c) => c.status === "scheduled").length}
          hint="Not yet marked complete"
        />
        <StatTile
          label="Unassigned"
          value={
            cleaning.filter((c) => c.status === "scheduled" && !c.cleanerName.trim()).length
          }
          hint="Scheduled, still need a cleaner"
          tone="brand"
        />
      </div>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:items-start">
        <Card className="overflow-hidden">
          <FilterBar
            filtersActive={filtersActive}
            onClear={() => {
              setCleaner("all");
              setStatus("all");
              setPayment("all");
              setFrom("");
              setTo("");
            }}
          >
              <Field label="Cleaner" className="min-w-36 flex-1">
                {(id) => (
                  <Select id={id} value={cleaner} onChange={(e) => setCleaner(e.target.value)}>
                    <option value="all">All cleaners</option>
                    {cleanerOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Status" className="min-w-32 flex-1">
                {(id) => (
                  <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as CleaningStatus | "all")}>
                    <option value="all">Any status</option>
                    {CLEANING_STATUSES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Payment" className="min-w-32 flex-1">
                {(id) => (
                  <Select id={id} value={payment} onChange={(e) => setPayment(e.target.value as CleaningPaymentStatus | "all")}>
                    <option value="all">Any payment</option>
                    {CLEANING_PAYMENT_STATUSES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
            </FilterBar>

          {filtered.length === 0 ? (
            <EmptyState
              title="No cleaning records match"
              message="Records are created automatically when you add a booking — or add one manually."
              action={
                <Button variant="primary" onClick={openAdd}>
                  <PlusIcon className="h-4 w-4" />
                  Add cleaning
                </Button>
              }
            />
          ) : (
            <>
              <CardList>
                {paging.pageItems.map((c) => {
                  const booking = c.bookingId ? bookingById.get(c.bookingId) : undefined;
                  return (
                    <CompactRow
                      key={c.id}
                      onOpen={() => setSelected(c)}
                      title={
                        c.cleanerName || <span className="font-normal text-slate-400">Unassigned</span>
                      }
                      subtitle={`${formatDate(c.date)}${booking ? ` · ${booking.guestName}` : ""}`}
                      amount={formatCurrency(c.paymentAmount)}
                      tags={
                        <>
                          <CleaningStatusBadge status={c.status} />
                          <CleaningPaymentBadge status={c.paymentStatus} />
                        </>
                      }
                      action={c.paymentStatus === "unpaid" ? markPaidButton(c) : null}
                    />
                  );
                })}
              </CardList>

              <TableWrap>
              <Table>
                <Thead>
                  <Th>Date</Th>
                  <Th>Cleaner</Th>
                  <Th className="hidden md:table-cell">Booking</Th>
                  <Th>Status</Th>
                  <Th align="right">Amount</Th>
                  <Th>Payment</Th>
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </Thead>
                <tbody className="divide-y divide-slate-100">
                  {paging.pageItems.map((c) => {
                    const booking = c.bookingId
                      ? bookingById.get(c.bookingId)
                      : undefined;
                    return (
                      <Tr key={c.id}>
                        <Td className="whitespace-nowrap">
                          {formatDate(c.date)}
                        </Td>
                        <Td>
                          <div className="flex max-w-sm items-baseline gap-2">
                            <RowTitle onOpen={() => setSelected(c)}>
                              {c.cleanerName || (
                                <span className="font-normal text-slate-400">Unassigned</span>
                              )}
                            </RowTitle>
                            {c.notes ? (
                              <span className="hidden truncate text-xs text-slate-400 xl:inline" title={c.notes}>
                                {c.notes}
                              </span>
                            ) : null}
                          </div>
                        </Td>
                        <Td className="hidden text-slate-500 md:table-cell">
                          {booking ? booking.guestName : "—"}
                        </Td>
                        <Td>
                          <CleaningStatusBadge status={c.status} />
                        </Td>
                        <Td align="right" className="whitespace-nowrap">
                          {formatCurrency(c.paymentAmount)}
                        </Td>
                        <Td>
                          <CleaningPaymentBadge status={c.paymentStatus} />
                        </Td>
                        <Td align="right">
                          <RowActions
                            onEdit={() => {
                              setEditing(c);
                              setFormOpen(true);
                            }}
                            onDelete={() => setPendingDelete(c)}
                            extra={
                              c.paymentStatus === "unpaid" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="mr-1 text-emerald-700 hover:bg-emerald-50"
                                  onClick={() => markPaid(c)}
                                >
                                  Mark paid
                                </Button>
                              ) : undefined
                            }
                          />
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
              </TableWrap>
              <Pagination paging={paging} noun="records" />
            </>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader
            icon={SparklesIcon}
            title="Unpaid cleaners"
            description="Who's still owed, and how much."
          />
          {owed.length === 0 ? (
            <EmptyState title="Everyone's paid up" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {owed.map((o) => (
                <li
                  key={o.cleaner}
                  className="flex items-baseline justify-between gap-3 px-4 py-2.5 sm:px-5"
                >
                  <div>
                    <p className="text-sm text-slate-900">{o.cleaner}</p>
                    <p className="text-xs text-slate-500">
                      {o.count} turnover{o.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <p className="text-sm font-medium tabular-nums text-slate-900">
                    {formatCurrency(o.total)}
                  </p>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-3 bg-slate-50 px-4 py-2.5 sm:px-5">
                <p className="text-sm font-medium text-slate-700">Total</p>
                <p className="text-sm font-semibold tabular-nums text-slate-900">
                  {formatCurrency(totalOwed)}
                </p>
              </li>
            </ul>
          )}
        </Card>
      </div>

      <CleaningForm
        open={formOpen}
        record={editing}
        onClose={() => setFormOpen(false)}
      />

      <DetailSheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? selected.cleanerName || "Unassigned cleaning" : ""}
        tags={
          selected ? (
            <>
              <CleaningStatusBadge status={selected.status} />
              <CleaningPaymentBadge status={selected.paymentStatus} />
            </>
          ) : null
        }
        fields={
          selected
            ? [
                { label: "Date", value: formatDate(selected.date) },
                { label: "Cleaner", value: selected.cleanerName || <span className="text-slate-400">Unassigned</span> },
                {
                  label: "Booking",
                  value: (selected.bookingId && bookingById.get(selected.bookingId)?.guestName) || (
                    <span className="text-slate-400">Not linked</span>
                  ),
                },
                { label: "Amount", value: <span className="font-semibold">{formatCurrency(selected.paymentAmount)}</span> },
                { label: "Notes", value: selected.notes || <span className="text-slate-400">—</span> },
              ]
            : []
        }
        actions={selected && selected.paymentStatus === "unpaid" ? markPaidButton(selected) : undefined}
        onEdit={() => {
          if (!selected) return;
          setEditing(selected);
          setSelected(null);
          setFormOpen(true);
        }}
        onDelete={() => {
          if (!selected) return;
          setPendingDelete(selected);
          setSelected(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete cleaning record?"
        message={
          pendingDelete ? (
            <>
              {pendingDelete.cleanerName || "Unassigned"} on{" "}
              {formatDate(pendingDelete.date)}. This can&apos;t be undone.
            </>
          ) : null
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          try {
            await deleteCleaning(target.id);
          } catch {
            alert("Couldn't delete this record. Please try again.");
          }
        }}
      />
    </>
  );
}
