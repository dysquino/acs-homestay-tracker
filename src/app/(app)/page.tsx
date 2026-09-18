"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/app-shell";
import {
  Badge,
  CleaningPaymentBadge,
  PaymentBadge,
  SourceBadge,
} from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/table";
import { StatTile } from "@/components/ui/stat";
import { useIdentity } from "@/lib/identity";
import { addMonths, daysBetween, startOfMonth, today } from "@/lib/dates";
import {
  formatCurrency,
  formatDate,
  formatDateRange,
  formatMonth,
} from "@/lib/format";
import {
  amountOwedByCleaner,
  bookingNetIncome,
  monthSummary,
  pendingGuestPayments,
  unpaidCleanings,
  upcomingEvents,
} from "@/lib/selectors";
import { useStore } from "@/lib/store";

export default function DashboardPage() {
  const { bookings, expenses, cleaning, resetToSampleData } = useStore();
  const { user } = useIdentity();
  const t = today();
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(t));
  const isCurrentMonth = monthCursor === startOfMonth(t);

  const summary = useMemo(
    () => monthSummary(bookings, expenses, monthCursor),
    [bookings, expenses, monthCursor],
  );
  const events = useMemo(() => upcomingEvents(bookings, 7, t), [bookings, t]);
  const unpaid = useMemo(() => unpaidCleanings(cleaning), [cleaning]);
  const owedTotal = useMemo(
    () => amountOwedByCleaner(cleaning).reduce((s, o) => s + o.total, 0),
    [cleaning],
  );
  const pending = useMemo(() => pendingGuestPayments(bookings), [bookings]);
  const pendingTotal = pending.reduce((s, b) => s + bookingNetIncome(b), 0);

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.name ?? "there"}`}
        description="Here's where things stand today."
      />

      <div className="mb-3 flex items-center gap-2">
        <Button
          size="sm"
          aria-label="Previous month"
          onClick={() => setMonthCursor((m) => addMonths(m, -1))}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          aria-label="Next month"
          onClick={() => setMonthCursor((m) => addMonths(m, 1))}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
        {!isCurrentMonth ? (
          <Button size="sm" onClick={() => setMonthCursor(startOfMonth(t))}>
            This month
          </Button>
        ) : null}
        <h2 className="ml-1 text-sm font-semibold text-slate-900">
          {formatMonth(monthCursor)}
        </h2>
      </div>

      <div className="mb-5 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={`Income — ${formatMonth(monthCursor)}`}
          value={formatCurrency(summary.income)}
          hint="Net of platform fees, split by nights per month"
          tone="brand"
        />
        <StatTile
          label={`Expenses — ${formatMonth(monthCursor)}`}
          value={formatCurrency(summary.expenses)}
        />
        <StatTile
          label={`Profit — ${formatMonth(monthCursor)}`}
          value={formatCurrency(summary.net)}
          tone={summary.net >= 0 ? "positive" : "negative"}
        />
        <StatTile
          label="Owed to cleaners"
          value={formatCurrency(owedTotal)}
          hint={`${unpaid.length} unpaid`}
          tone={owedTotal > 0 ? "negative" : "positive"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Next 7 days"
            description="Check-ins and check-outs coming up."
            action={
              <LinkButton size="sm" href="/bookings">
                View bookings
              </LinkButton>
            }
          />
          {events.length === 0 ? (
            <EmptyState
              title="Nothing scheduled"
              message="No check-ins or check-outs in the next week."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {events.map((e) => (
                <li
                  key={`${e.booking.id}-${e.kind}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5"
                >
                  <Badge tone={e.kind === "check-in" ? "green" : "amber"}>
                    {e.kind === "check-in" ? "Check-in" : "Check-out"}
                  </Badge>
                  <span className="text-sm font-medium text-slate-900">
                    {e.booking.guestName}
                  </span>
                  <SourceBadge source={e.booking.source} />
                  <span className="ml-auto text-sm whitespace-nowrap text-slate-600">
                    {formatDate(e.date)}
                    <span className="ml-1.5 text-xs text-slate-400">
                      {relativeDay(daysBetween(t, e.date))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Pending guest payments"
            description={
              pending.length > 0
                ? `${formatCurrency(pendingTotal)} across ${pending.length} booking${pending.length === 1 ? "" : "s"}`
                : undefined
            }
            action={
              <LinkButton size="sm" href="/bookings">
                Bookings
              </LinkButton>
            }
          />
          {pending.length === 0 ? (
            <EmptyState title="All guest payments settled" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.slice(0, 6).map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {b.guestName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDateRange(b.checkIn, b.checkOut)}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums whitespace-nowrap text-slate-700">
                    {formatCurrency(bookingNetIncome(b))}
                  </span>
                  <PaymentBadge status={b.paymentStatus} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Unpaid cleanings"
            description={
              unpaid.length > 0 ? `${formatCurrency(owedTotal)} owed` : undefined
            }
            action={
              <LinkButton size="sm" href="/cleaning">
                Cleaning
              </LinkButton>
            }
          />
          {unpaid.length === 0 ? (
            <EmptyState title="Everyone's paid up" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {unpaid.slice(0, 6).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {c.cleanerName || (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(c.date)}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums whitespace-nowrap text-slate-700">
                    {formatCurrency(c.paymentAmount)}
                  </span>
                  <CleaningPaymentBadge status={c.paymentStatus} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>Records are saved in Supabase — shared across everyone signed in.</p>
          <Button size="sm" onClick={() => setConfirmingReset(true)}>
            Reset sample data
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingReset}
        title="Reset all data?"
        message="This wipes every booking, expense, and cleaning record and replaces them with sample data. This can't be undone."
        confirmLabel="Reset"
        onCancel={() => setConfirmingReset(false)}
        onConfirm={async () => {
          setConfirmingReset(false);
          try {
            await resetToSampleData();
          } catch {
            alert("Couldn't reset sample data. Please try again.");
          }
        }}
      />
    </>
  );
}

function relativeDay(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
