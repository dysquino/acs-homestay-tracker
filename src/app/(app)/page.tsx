"use client";

import { useMemo, useState, type ReactNode } from "react";

import { ActionItems } from "@/components/dashboard/action-items";
import { CashFlowChart, type ChartRange } from "@/components/dashboard/cash-flow-chart";
import { MoneyInBankCard } from "@/components/dashboard/money-in-bank-card";
import { OccupancyCard } from "@/components/dashboard/occupancy-card";
import { ProfitHero } from "@/components/dashboard/profit-hero";
import { SettleCard } from "@/components/dashboard/settle-card";
import { WeekStrip } from "@/components/dashboard/week-strip";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { useIdentity } from "@/lib/identity";
import { addMonths, startOfMonth, today } from "@/lib/dates";
import { formatMonth } from "@/lib/format";
import {
  amountOwedByCleaner,
  bookingNetIncome,
  moneyInBank,
  monthSeries,
  occupancyInMonth,
  pendingGuestPayments,
  unpaidCleanings,
  unrefundedExpenses,
  upcomingEvents,
} from "@/lib/selectors";
import { useStore } from "@/lib/store";

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
  const owedExpenses = useMemo(() => unrefundedExpenses(expenses), [expenses]);
  const owedExpensesTotal = owedExpenses.reduce((s, e) => s + e.amount, 0);
  const bank = useMemo(() => moneyInBank(bookings, expenses), [bookings, expenses]);

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

      <ActionItems />

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
          <SettleCard
            toCollect={pendingTotal}
            collectCount={pending.length}
            toPay={owedTotal}
            payCount={unpaid.length}
            toRefund={owedExpensesTotal}
            refundCount={owedExpenses.length}
          />
        </div>
        <div className="lg:col-span-4">
          <MoneyInBankCard result={bank} />
        </div>

        <div className="lg:col-span-12">
          <WeekStrip events={events} today={t} />
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
      className="flex h-8 w-8 items-center justify-center rounded-full pointer-coarse:h-10 pointer-coarse:w-10 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-slate-400"
    >
      {children}
    </button>
  );
}
