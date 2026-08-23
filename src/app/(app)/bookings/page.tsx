"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/app-shell";
import { BookingCalendar } from "@/components/bookings/booking-calendar";
import { BookingForm } from "@/components/bookings/booking-form";
import {
  BookingTable,
  sortBookings,
  type BookingSortKey,
  type Sort,
} from "@/components/bookings/booking-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { CalendarIcon, ListIcon, PlusIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { today } from "@/lib/dates";
import { formatCurrency, formatDateRange } from "@/lib/format";
import { bookingNetIncome } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import {
  BOOKING_SOURCES,
  PAYMENT_STATUSES,
  type Booking,
  type BookingSource,
  type PaymentStatus,
} from "@/lib/types";

type View = "list" | "calendar";

export default function BookingsPage() {
  const { bookings, deleteBooking } = useStore();

  const [view, setView] = useState<View>("list");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Booking | null>(null);

  const [search, setSearch] = useState("");
  const [source, setSource] = useState<BookingSource | "all">("all");
  const [payment, setPayment] = useState<PaymentStatus | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includePast, setIncludePast] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: "checkIn", dir: "asc" });

  const t = today();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (q && !`${b.guestName} ${b.notes} ${b.contactInfo}`.toLowerCase().includes(q))
        return false;
      if (source !== "all" && b.source !== source) return false;
      if (payment !== "all" && b.paymentStatus !== payment) return false;
      if (from && b.checkOut < from) return false;
      if (to && b.checkIn > to) return false;
      if (!includePast && b.checkOut < t) return false;
      return true;
    });
  }, [bookings, search, source, payment, from, to, includePast, t]);

  const sorted = useMemo(() => sortBookings(filtered, sort), [filtered, sort]);

  const totals = useMemo(
    () => ({
      count: filtered.length,
      payout: filtered.reduce((s, b) => s + b.totalPayout, 0),
      net: filtered.reduce((s, b) => s + bookingNetIncome(b), 0),
    }),
    [filtered],
  );

  const filtersActive =
    search !== "" ||
    source !== "all" ||
    payment !== "all" ||
    from !== "" ||
    to !== "" ||
    includePast;

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(booking: Booking) {
    setEditing(booking);
    setFormOpen(true);
  }

  function toggleSort(key: BookingSortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  }

  function clearFilters() {
    setSearch("");
    setSource("all");
    setPayment("all");
    setFrom("");
    setTo("");
    setIncludePast(false);
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Airbnb and direct reservations in one place."
        action={
          <Button variant="primary" onClick={openAdd}>
            <PlusIcon className="h-4 w-4" />
            Add booking
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md bg-slate-100 p-0.5">
          <ViewTab
            active={view === "list"}
            onClick={() => setView("list")}
            icon={<ListIcon className="h-4 w-4" />}
            label="List"
          />
          <ViewTab
            active={view === "calendar"}
            onClick={() => setView("calendar")}
            icon={<CalendarIcon className="h-4 w-4" />}
            label="Calendar"
          />
        </div>

        {view === "list" ? (
          <p className="ml-auto text-xs text-slate-500">
            {totals.count} booking{totals.count === 1 ? "" : "s"} ·{" "}
            <span className="font-medium text-slate-700">
              {formatCurrency(totals.net)}
            </span>{" "}
            net
          </p>
        ) : null}
      </div>

      {view === "list" ? (
        <Card className="overflow-hidden">
          <div className="grid gap-2 border-b border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search guest, notes, contact…"
              aria-label="Search bookings"
              className="lg:col-span-2"
            />
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as BookingSource | "all")}
              aria-label="Filter by source"
            >
              <option value="all">All sources</option>
              {BOOKING_SOURCES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Select
              value={payment}
              onChange={(e) => setPayment(e.target.value as PaymentStatus | "all")}
              aria-label="Filter by payment status"
            >
              <option value="all">Any payment status</option>
              {PAYMENT_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From date"
              />
              <span className="text-xs text-slate-400">to</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="To date"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-2 lg:col-span-4">
              <input
                type="checkbox"
                checked={includePast}
                onChange={(e) => setIncludePast(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
              />
              Include past bookings
            </label>

            {filtersActive ? (
              <div className="flex items-center justify-start lg:justify-end">
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            ) : null}
          </div>

          <BookingTable
            bookings={sorted}
            sort={sort}
            onSort={toggleSort}
            onEdit={openEdit}
            onDelete={setPendingDelete}
            emptyAction={
              <Button variant="primary" onClick={openAdd}>
                <PlusIcon className="h-4 w-4" />
                Add booking
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <div className="p-3 sm:p-4">
            <BookingCalendar bookings={bookings} onSelect={openEdit} />
          </div>
        </Card>
      )}

      <BookingForm
        open={formOpen}
        booking={editing}
        onClose={() => setFormOpen(false)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete booking?"
        message={
          pendingDelete ? (
            <>
              <strong>{pendingDelete.guestName}</strong> —{" "}
              {formatDateRange(pendingDelete.checkIn, pendingDelete.checkOut)}.
              Its auto-scheduled cleaning will be removed too, unless a cleaner
              was already assigned or paid.
            </>
          ) : null
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteBooking(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-600 hover:text-slate-900",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
