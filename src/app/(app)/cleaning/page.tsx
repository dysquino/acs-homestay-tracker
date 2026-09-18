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
import { Input, Select } from "@/components/ui/field";
import { PlusIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/modal";
import { StatTile } from "@/components/ui/stat";
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
import { formatCurrency, formatDate } from "@/lib/format";
import {
  amountOwedByCleaner,
  knownCleaners,
  unpaidCleanings,
} from "@/lib/selectors";
import { useStore } from "@/lib/store";
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
        if (cleaner !== "all" && name !== cleaner) return false;
        if (status !== "all" && c.status !== status) return false;
        if (payment !== "all" && c.paymentStatus !== payment) return false;
        if (from && c.date < from) return false;
        if (to && c.date > to) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [cleaning, cleaner, status, payment, from, to]);

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
          hint={`${unpaidCount} unpaid record${unpaidCount === 1 ? "" : "s"}`}
          tone={totalOwed > 0 ? "negative" : "positive"}
        />
        <StatTile
          label="Scheduled"
          value={cleaning.filter((c) => c.status === "scheduled").length}
          hint="Not yet marked complete"
        />
        <StatTile
          label="Unassigned"
          value={cleaning.filter((c) => !c.cleanerName.trim()).length}
          hint="Still need a cleaner"
          tone="brand"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="space-y-2 border-b border-slate-200 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-40">
                <Select
                  value={cleaner}
                  onChange={(e) => setCleaner(e.target.value)}
                  aria-label="Filter by cleaner"
                >
                  <option value="all">All cleaners</option>
                  {cleanerOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-36">
                <Select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as CleaningStatus | "all")
                  }
                  aria-label="Filter by status"
                >
                  <option value="all">Any status</option>
                  {CLEANING_STATUSES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-40">
                <Select
                  value={payment}
                  onChange={(e) =>
                    setPayment(e.target.value as CleaningPaymentStatus | "all")
                  }
                  aria-label="Filter by payment status"
                >
                  <option value="all">Any payment</option>
                  {CLEANING_PAYMENT_STATUSES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-40">
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    aria-label="From date"
                  />
                </div>
                <span className="text-xs text-slate-400">to</span>
                <div className="w-40">
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    aria-label="To date"
                  />
                </div>
              </div>
              {filtersActive ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => {
                    setCleaner("all");
                    setStatus("all");
                    setPayment("all");
                    setFrom("");
                    setTo("");
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          </div>

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
                {filtered.map((c) => {
                  const booking = c.bookingId
                    ? bookingById.get(c.bookingId)
                    : undefined;
                  return (
                    <CardRow key={c.id}>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">
                            {c.cleanerName || (
                              <span className="font-normal text-slate-400">
                                Unassigned
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatDate(c.date)}
                            {booking ? ` · ${booking.guestName}` : ""}
                          </p>
                        </div>
                        <CleaningStatusBadge status={c.status} />
                      </div>

                      <div className="space-y-1 rounded-md bg-slate-50 p-2.5">
                        <CardField label="Amount">
                          {formatCurrency(c.paymentAmount)}
                        </CardField>
                        <CardField label="Payment">
                          <CleaningPaymentBadge status={c.paymentStatus} />
                        </CardField>
                      </div>

                      {c.notes ? (
                        <p className="mt-2 truncate text-xs text-slate-400">
                          {c.notes}
                        </p>
                      ) : null}

                      <div className="mt-2.5">
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
                      </div>
                    </CardRow>
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
                  {filtered.map((c) => {
                    const booking = c.bookingId
                      ? bookingById.get(c.bookingId)
                      : undefined;
                    return (
                      <Tr key={c.id}>
                        <Td className="whitespace-nowrap">
                          {formatDate(c.date)}
                        </Td>
                        <Td>
                          {c.cleanerName ? (
                            <span className="font-medium text-slate-900">
                              {c.cleanerName}
                            </span>
                          ) : (
                            <span className="text-slate-400">Unassigned</span>
                          )}
                          {c.notes ? (
                            <div className="max-w-xs truncate text-xs text-slate-400">
                              {c.notes}
                            </div>
                          ) : null}
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
            </>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader
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
