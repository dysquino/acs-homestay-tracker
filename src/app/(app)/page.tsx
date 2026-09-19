"use client";

import { useMemo, useState, type ReactNode } from "react";

import { CashFlowChart, type ChartRange } from "@/components/dashboard/cash-flow-chart";
import {
  ExpenseCategoryDonut,
  type CategorySlice,
} from "@/components/dashboard/expense-category-donut";
import { OccupancyCard } from "@/components/dashboard/occupancy-card";
import { ProfitHero } from "@/components/dashboard/profit-hero";
import { SettleCard } from "@/components/dashboard/settle-card";
import { WeekStrip } from "@/components/dashboard/week-strip";
import { CleaningPaymentBadge, PaymentBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ReceiptIcon,
  SparklesIcon,
} from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/table";
import { useIdentity } from "@/lib/identity";
import { addMonths, isSameMonth, startOfMonth, today } from "@/lib/dates";
import { formatCurrency, formatDate, formatDateRange, formatMonth } from "@/lib/format";
import {
  amountOwedByCleaner,
  bookingNetIncome,
  monthSeries,
  occupancyInMonth,
  pendingGuestPayments,
  unpaidCleanings,
  upcomingEvents,
} from "@/lib/selectors";
import { useStore } from "@/lib/store";
import { EXPENSE_CATEGORIES } from "@/lib/types";

const WEEK_DAYS = 7;

export default function DashboardPage() {
  const { bookings, expenses, cleaning } = useStore();
  const { user } = useIdentity();
  const t = today();
  const currentMonth = startOfMonth(t);

  // One month cursor scopes every card below it. The chart window is separate
  // state so picking a month inside the chart doesn't slide the bars away
  // from under the pointer; it only re-anchors when the cursor leaves it.
  const [monthCursor, setMonthCursor] = useState(currentMonth);
  const [range, setRange] = useState<ChartRange>(6);
  const [windowEnd, setWindowEnd] = useState(() => addMonths(currentMonth, 1));
  const isCurrentMonth = monthCursor === currentMonth;

  const windowStart = addMonths(windowEnd, -(range - 1));
  const selectMonth = (month: string) => {
    setMonthCursor(month);
    if (month < windowStart || month > windowEnd) setWindowEnd(addMonths(month, 1));
  };
  const changeRange = (next: ChartRange) => {
    setRange(next);
    setWindowEnd(addMonths(monthCursor, 1));
  };

  const months = useMemo(
    () => monthSeries(bookings, expenses, windowEnd, range),
    [bookings, expenses, windowEnd, range],
  );
  const selectedIndex = Math.max(
    0,
    months.findIndex((m) => m.month === monthCursor),
  );
  const summary = months[selectedIndex];

  const occupancy = useMemo(() => occupancyInMonth(bookings, monthCursor), [bookings, monthCursor]);
  const events = useMemo(() => upcomingEvents(bookings, WEEK_DAYS - 1, t), [bookings, t]);
  const unpaid = useMemo(() => unpaidCleanings(cleaning), [cleaning]);
  const owedTotal = useMemo(
    () => amountOwedByCleaner(cleaning).reduce((s, o) => s + o.total, 0),
    [cleaning],
  );
  const pending = useMemo(() => pendingGuestPayments(bookings), [bookings]);
  const pendingTotal = pending.reduce((s, b) => s + bookingNetIncome(b), 0);

  const expensesByCategory = useMemo<CategorySlice[]>(() => {
    const monthExpenses = expenses.filter((e) => isSameMonth(e.date, monthCursor));
    return EXPENSE_CATEGORIES.map(({ value }) => ({
      category: value,
      amount: monthExpenses
        .filter((e) => e.category === value)
        .reduce((s, e) => s + e.amount, 0),
    }));
  }, [expenses, monthCursor]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Hello, <span className="text-slate-400">{user?.name ?? "there"}</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">Here&apos;s where things stand.</p>
        </div>

        {/* The one filter row: scopes every card below. */}
        <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]">
          <MonthStep label="Previous month" onClick={() => selectMonth(addMonths(monthCursor, -1))}>
            <ChevronLeftIcon className="h-4 w-4" />
          </MonthStep>
          <span className="min-w-36 px-2 text-center text-sm font-semibold text-slate-900">
            {formatMonth(monthCursor)}
          </span>
          <MonthStep label="Next month" onClick={() => selectMonth(addMonths(monthCursor, 1))}>
            <ChevronRightIcon className="h-4 w-4" />
          </MonthStep>
          {!isCurrentMonth ? (
            <button
              type="button"
              onClick={() => selectMonth(currentMonth)}
              className="ml-1 rounded-full bg-brand-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-800"
            >
              This month
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 [&>*]:min-w-0">
        <div className="lg:col-span-4">
          <ProfitHero months={months} selectedIndex={selectedIndex} />
        </div>
        <div className="lg:col-span-8">
          <CashFlowChart
            months={months}
            selected={monthCursor}
            onSelect={selectMonth}
            range={range}
            onRangeChange={changeRange}
          />
        </div>

        <div className="lg:col-span-4">
          <OccupancyCard
            month={monthCursor}
            days={occupancy.days}
            bookedNights={occupancy.bookedNights}
            income={summary?.income ?? 0}
            today={t}
          />
        </div>
        <div className="lg:col-span-4">
          <Card className="flex h-full flex-col">
            <CardHeader
              icon={ReceiptIcon}
              title="Expenses by category"
              description={formatMonth(monthCursor)}
            />
            <ExpenseCategoryDonut data={expensesByCategory} />
          </Card>
        </div>
        <div className="lg:col-span-4">
          <SettleCard
            toCollect={pendingTotal}
            collectCount={pending.length}
            toPay={owedTotal}
            payCount={unpaid.length}
          />
        </div>

        <div className="lg:col-span-12">
          <WeekStrip events={events} today={t} />
        </div>

        <div className="lg:col-span-6">
          <Card className="h-full">
            <CardHeader
              icon={CalendarIcon}
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
              <ul className="px-2 pb-3 sm:px-3">
                {pending.slice(0, 6).map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{b.guestName}</p>
                      <p className="text-xs text-slate-500">{formatDateRange(b.checkIn, b.checkOut)}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums whitespace-nowrap text-slate-900">
                      {formatCurrency(bookingNetIncome(b))}
                    </span>
                    <PaymentBadge status={b.paymentStatus} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="lg:col-span-6">
          <Card className="h-full">
            <CardHeader
              icon={SparklesIcon}
              title="Unpaid cleanings"
              description={unpaid.length > 0 ? `${formatCurrency(owedTotal)} owed` : undefined}
              action={
                <LinkButton size="sm" href="/cleaning">
                  Cleaning
                </LinkButton>
              }
            />
            {unpaid.length === 0 ? (
              <EmptyState title="Everyone's paid up" />
            ) : (
              <ul className="px-2 pb-3 sm:px-3">
                {unpaid.slice(0, 6).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {c.cleanerName || <span className="text-slate-400">Unassigned</span>}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(c.date)}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums whitespace-nowrap text-slate-900">
                      {formatCurrency(c.paymentAmount)}
                    </span>
                    <CleaningPaymentBadge status={c.paymentStatus} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function MonthStep({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-slate-400"
    >
      {children}
    </button>
  );
}
