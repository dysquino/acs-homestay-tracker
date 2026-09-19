import { Card, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { CalendarIcon } from "@/components/ui/icons";
import { addDays } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { formatShortDate, formatWeekday } from "@/lib/format";
import type { UpcomingEvent } from "@/lib/selectors";
import type { ISODate } from "@/lib/types";

/**
 * The next seven days as a timeline: one column per day, check-ins and
 * check-outs as chips. Empty days stay visible so the gaps read as gaps.
 * Chips say "Check-in"/"Check-out" and carry an arrow — the tint is a
 * bonus, never the only cue.
 */

const DAYS = 7;

export function WeekStrip({ events, today }: { events: UpcomingEvent[]; today: ISODate }) {
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i));

  return (
    <Card>
      <CardHeader
        icon={CalendarIcon}
        title="Next 7 days"
        description={summary(events)}
        action={
          <LinkButton size="sm" href="/bookings">
            View bookings
          </LinkButton>
        }
      />
      <ol className="grid grid-cols-1 gap-2 px-4 pt-2 pb-5 sm:grid-cols-7 sm:px-5">
        {days.map((date) => {
          const dayEvents = events.filter((e) => e.date === date);
          const isToday = date === today;
          return (
            <li
              key={date}
              className={cn(
                "flex gap-3 rounded-2xl p-3 sm:min-h-28 sm:flex-col sm:gap-2",
                isToday ? "bg-brand-50" : "bg-slate-50",
              )}
            >
              <div className="w-14 shrink-0 sm:w-auto">
                <p className="text-[11px] font-medium text-slate-500 uppercase">
                  {isToday ? "Today" : formatWeekday(date)}
                </p>
                <p className="text-sm font-semibold text-slate-900">{formatShortDate(date)}</p>
              </div>
              <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
                {dayEvents.length === 0 ? (
                  <li className="text-xs text-slate-300" aria-label="Nothing scheduled">
                    —
                  </li>
                ) : (
                  dayEvents.map((e) => (
                    <li
                      key={`${e.booking.id}-${e.kind}`}
                      className={cn(
                        "min-w-0 rounded-xl bg-white px-2 py-1.5 text-xs shadow-[0_1px_2px_rgba(15,23,42,0.06)] border-l-[3px]",
                        e.kind === "check-in" ? "border-emerald-500" : "border-amber-500",
                      )}
                    >
                      <p className="font-medium text-slate-500">
                        <span aria-hidden="true">{e.kind === "check-in" ? "↓ " : "↑ "}</span>
                        {e.kind === "check-in" ? "Check-in" : "Check-out"}
                      </p>
                      <p className="truncate font-semibold text-slate-900">{e.booking.guestName}</p>
                    </li>
                  ))
                )}
              </ul>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function summary(events: UpcomingEvent[]): string {
  if (events.length === 0) return "No check-ins or check-outs this week.";
  const ins = events.filter((e) => e.kind === "check-in").length;
  const outs = events.length - ins;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${plural(ins, "check-in")} · ${plural(outs, "check-out")}`;
}
