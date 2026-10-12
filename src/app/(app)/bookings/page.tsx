"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/layout/app-shell";
import { AirbnbImportModal } from "@/components/bookings/airbnb-import";
import { BookingCalendar } from "@/components/bookings/booking-calendar";
import {
  BookingTable,
  sortBookings,
  type Sort,
} from "@/components/bookings/booking-table";
import { BookingForm } from "@/components/bookings/booking-form";
import { AirbnbSyncStatus } from "@/components/bookings/airbnb-sync";
import { BookingRequests, ShareBookingLink } from "@/components/bookings/booking-requests";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";
import { DateRangeFilter, FilterBar } from "@/components/ui/filter-bar";
import { CalendarIcon, ListIcon, PlusIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { today } from "@/lib/dates";
import { formatCurrency, formatDate, formatDateRange } from "@/lib/format";
import { cleaningsKeptOnDelete } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import {
  BOOKING_SOURCES,
  PAYMENT_STATUSES,
  type Booking,
  type BookingSource,
  type PaymentStatus,
} from "@/lib/types";

type View = "list" | "calendar";

/**
 * Accepts ?import=1 (the dashboard's "Import finished Airbnb stays" action)
 * to open the Airbnb CSV import straight away. Reading the URL needs a
 * Suspense boundary here.
 */
export default function BookingsPage() {
  return (
    <Suspense fallback={null}>
      <BookingsPageContent />
    </Suspense>
  );
}

function BookingsPageContent() {
  const params = useSearchParams();
  const { bookings, cleaning, airbnbBlocks, deleteBooking } = useStore();

  const [view, setView] = useState<View>("calendar");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(() => params.get("import") === "1");
  const [editing, setEditing] = useState<Booking | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Booking | null>(null);
  const [alsoDeleteCleanings, setAlsoDeleteCleanings] = useState(false);
  // Cleanings a plain delete would keep — offered for deletion as well, e.g.
  // the pre-paid cleaning of an imported booking that was then cancelled.
  const keptCleanings = useMemo(
    () => (pendingDelete ? cleaningsKeptOnDelete(cleaning, pendingDelete.id) : []),
    [cleaning, pendingDelete],
  );
  const keptPaidTotal = keptCleanings
    .filter((c) => c.paymentStatus === "paid")
    .reduce((s, c) => s + c.paymentAmount, 0);

  function askDelete(booking: Booking) {
    setAlsoDeleteCleanings(false);
    setPendingDelete(booking);
  }

  const [source, setSource] = useState<BookingSource | "all">("all");
  const [payment, setPayment] = useState<PaymentStatus | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includePast, setIncludePast] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: "checkIn", dir: "asc" });

  const t = today();

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (source !== "all" && b.source !== source) return false;
      if (payment !== "all" && b.paymentStatus !== payment) return false;
      if (from && b.checkOut < from) return false;
      if (to && b.checkIn > to) return false;
      if (!includePast && b.checkOut < t) return false;
      return true;
    });
  }, [bookings, source, payment, from, to, includePast, t]);

  const sorted = useMemo(() => sortBookings(filtered, sort), [filtered, sort]);

  const filtersActive =
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

  function clearFilters() {
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
          <div className="flex flex-wrap items-center gap-2">
            <ShareBookingLink />
            <Button onClick={() => setImportOpen(true)}>Import Airbnb CSV</Button>
            <Button variant="primary" onClick={openAdd}>
              <PlusIcon className="h-4 w-4" />
              Add booking
            </Button>
          </div>
        }
      />

      <AirbnbSyncStatus />

      <BookingRequests onApproved={openEdit} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md bg-slate-100 p-0.5">
          <ViewTab
            active={view === "calendar"}
            onClick={() => setView("calendar")}
            icon={<CalendarIcon className="h-4 w-4" />}
            label="Calendar"
          />
          <ViewTab
            active={view === "list"}
            onClick={() => setView("list")}
            icon={<ListIcon className="h-4 w-4" />}
            label="List"
          />
        </div>

      </div>

      {view === "list" ? (
        <Card className="overflow-hidden">
          <FilterBar filtersActive={filtersActive} onClear={clearFilters}>
              <Field label="Source" className="min-w-36 flex-1">
                {(id) => (
                  <Select id={id} value={source} onChange={(e) => setSource(e.target.value as BookingSource | "all")}>
                    <option value="all">All sources</option>
                    {BOOKING_SOURCES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Payment status" className="min-w-40 flex-1">
                {(id) => (
                  <Select id={id} value={payment} onChange={(e) => setPayment(e.target.value as PaymentStatus | "all")}>
                    <option value="all">Any payment status</option>
                    {PAYMENT_STATUSES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
              <label className="mb-2.5 flex shrink-0 items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={includePast}
                  onChange={(e) => setIncludePast(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                />
                Include past bookings
              </label>
            </FilterBar>

          <BookingTable
            bookings={sorted}
            resetKey={JSON.stringify([source, payment, from, to, includePast, sort])}
            sort={sort}
            onSortChange={setSort}
            onEdit={openEdit}
            onDelete={askDelete}
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
            <BookingCalendar bookings={bookings} airbnbBlocks={airbnbBlocks} onSelect={openEdit} />
          </div>
        </Card>
      )}

      <AirbnbImportModal open={importOpen} onClose={() => setImportOpen(false)} />

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
              {keptCleanings.length === 0 ? (
                <> Its auto-scheduled cleaning will be removed too.</>
              ) : (
                <>
                  {" "}
                  Its cleaning has work or payment recorded, so it&apos;s kept on
                  the Cleaning page unless you also delete it:
                  <span className="mt-3 block space-y-1 rounded-lg bg-slate-50 p-3 text-xs">
                    {keptCleanings.map((c) => (
                      <span key={c.id} className="block">
                        {formatDate(c.date)} · {formatCurrency(c.paymentAmount)} ·{" "}
                        {c.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                        {c.cleanerName ? ` · ${c.cleanerName}` : ""}
                      </span>
                    ))}
                  </span>
                  <label className="mt-3 flex items-start gap-2.5 py-1 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={alsoDeleteCleanings}
                      onChange={(e) => setAlsoDeleteCleanings(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-600 pointer-coarse:h-5 pointer-coarse:w-5"
                    />
                    <span>
                      Also delete {keptCleanings.length === 1 ? "this cleaning" : "these cleanings"}
                      {keptPaidTotal > 0
                        ? ` and ${keptCleanings.length === 1 ? "its" : "their"} ${formatCurrency(keptPaidTotal)} expense`
                        : ""}
                      <span className="block text-xs text-slate-500">
                        For a cancelled stay where the cleaning never happened.
                      </span>
                    </span>
                  </label>
                </>
              )}
            </>
          ) : null
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const target = pendingDelete;
          const withCleanings = alsoDeleteCleanings;
          setPendingDelete(null);
          if (!target) return;
          try {
            await deleteBooking(target.id, { withCleanings });
          } catch {
            alert("Couldn't delete this booking. Please try again.");
          }
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
        "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors pointer-coarse:py-2.5",
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
