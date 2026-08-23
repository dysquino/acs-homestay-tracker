"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import {
  addDays,
  addMonths,
  daysBetween,
  isSameMonth,
  monthGrid,
  startOfMonth,
  today,
} from "@/lib/dates";
import { formatCurrency, formatMonth } from "@/lib/format";
import type { Booking, ISODate } from "@/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const BAR_HEIGHT = 22; // px, must match the row height below
const HEADER_SPACE = 26; // px reserved for the date number

type Bar = {
  booking: Booking;
  /** 0-6 column index within the week. */
  start: number;
  span: number;
  lane: number;
  /** Whether the stay actually begins / ends inside this week. */
  opensLeft: boolean;
  closesRight: boolean;
};

/**
 * Lay out one week's bookings as spanning bars, packing them into as few
 * lanes as possible. Bookings occupy nights, so the check-out day is free.
 */
function layoutWeek(weekStart: ISODate, bookings: Booking[]): Bar[] {
  const weekEnd = addDays(weekStart, 6);

  const overlapping = bookings
    .filter((b) => b.checkIn <= weekEnd && b.checkOut > weekStart)
    .sort(
      (a, b) =>
        a.checkIn.localeCompare(b.checkIn) ||
        b.checkOut.localeCompare(a.checkOut),
    );

  const laneEnds: number[] = []; // last occupied column index per lane
  const bars: Bar[] = [];

  for (const booking of overlapping) {
    const firstNight = booking.checkIn > weekStart ? booking.checkIn : weekStart;
    const lastNight = addDays(booking.checkOut, -1);
    const clampedLast = lastNight < weekEnd ? lastNight : weekEnd;

    const start = daysBetween(weekStart, firstNight);
    const span = daysBetween(firstNight, clampedLast) + 1;
    if (span <= 0) continue;

    let lane = laneEnds.findIndex((end) => end < start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = start + span - 1;

    bars.push({
      booking,
      start,
      span,
      lane,
      opensLeft: booking.checkIn >= weekStart,
      closesRight: lastNight <= weekEnd,
    });
  }

  return bars;
}

export function BookingCalendar({
  bookings,
  onSelect,
}: {
  bookings: Booking[];
  onSelect: (booking: Booking) => void;
}) {
  const [cursor, setCursor] = useState<ISODate>(() => startOfMonth(today()));
  const t = today();

  const weeks = useMemo(() => {
    const days = monthGrid(cursor);
    return Array.from({ length: 6 }, (_, w) => {
      const weekDays = days.slice(w * 7, w * 7 + 7);
      return { days: weekDays, bars: layoutWeek(weekDays[0], bookings) };
    });
  }, [cursor, bookings]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            aria-label="Previous month"
            onClick={() => setCursor(addMonths(cursor, -1))}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            aria-label="Next month"
            onClick={() => setCursor(addMonths(cursor, 1))}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            onClick={() => setCursor(startOfMonth(t))}
            className="ml-1"
          >
            Today
          </Button>
        </div>

        <h3 className="text-sm font-semibold text-slate-900">
          {formatMonth(cursor)}
        </h3>

        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-airbnb-600" />
            Airbnb
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-direct-600" />
            Direct
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px] overflow-hidden rounded-lg border border-slate-200">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="px-2 py-1.5 text-center text-[11px] font-semibold text-slate-500"
              >
                {d}
              </div>
            ))}
          </div>

          {weeks.map((week, wi) => {
            const lanes = week.bars.reduce((m, b) => Math.max(m, b.lane + 1), 0);
            const minHeight = HEADER_SPACE + lanes * BAR_HEIGHT + 6;

            return (
              <div
                key={wi}
                className="relative border-b border-slate-200 last:border-b-0"
                style={{ minHeight }}
              >
                <div className="absolute inset-0 grid grid-cols-7">
                  {week.days.map((day) => (
                    <div
                      key={day}
                      className={`border-r border-slate-100 last:border-r-0 ${
                        isSameMonth(day, cursor) ? "bg-white" : "bg-slate-50/60"
                      }`}
                    >
                      <div className="px-1.5 pt-1">
                        <span
                          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] ${
                            day === t
                              ? "bg-brand-700 font-semibold text-white"
                              : isSameMonth(day, cursor)
                                ? "text-slate-700"
                                : "text-slate-400"
                          }`}
                        >
                          {Number(day.slice(8, 10))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  className="pointer-events-none relative grid grid-cols-7 gap-y-0.5 px-0.5"
                  style={{ paddingTop: HEADER_SPACE }}
                >
                  {week.bars.map((bar) => (
                    <button
                      key={bar.booking.id}
                      type="button"
                      onClick={() => onSelect(bar.booking)}
                      title={`${bar.booking.guestName} · ${bar.booking.checkIn} → ${bar.booking.checkOut} · ${formatCurrency(bar.booking.totalPayout)}`}
                      style={{
                        gridColumn: `${bar.start + 1} / span ${bar.span}`,
                        gridRow: bar.lane + 1,
                        height: BAR_HEIGHT - 4,
                      }}
                      className={`pointer-events-auto mx-0.5 flex items-center overflow-hidden px-1.5 text-left text-[11px] font-medium text-white transition-opacity hover:opacity-85 ${
                        bar.booking.source === "airbnb"
                          ? "bg-airbnb-600"
                          : "bg-direct-600"
                      } ${bar.opensLeft ? "rounded-l-md" : "rounded-l-none"} ${
                        bar.closesRight ? "rounded-r-md" : "rounded-r-none"
                      }`}
                    >
                      <span className="truncate">{bar.booking.guestName}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Bars cover the nights booked — a check-out day is free for the next
        guest. Tap a bar to edit that booking.
      </p>
    </div>
  );
}
