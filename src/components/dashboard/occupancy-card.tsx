import { Card, CardHeader } from "@/components/ui/card";
import { CalendarIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatDate, formatMonth, formatWhole } from "@/lib/format";
import type { OccupancyDay } from "@/lib/selectors";
import type { ISODate } from "@/lib/types";

/**
 * Occupancy for the selected month: one big percentage, then a strip with a
 * cell per night so gaps in the calendar are visible at a glance. One hue
 * (the income amber) in three states — stayed (deep), upcoming (light),
 * vacant (neutral) — with a legend, so it never relies on colour alone.
 */

const STAYED = "#d97706";
const UPCOMING = "#f2b872";

type Props = {
  month: ISODate;
  days: OccupancyDay[];
  bookedNights: number;
  /** Net income for the month, for the average nightly rate. */
  income: number;
  today: ISODate;
};

export function OccupancyCard({ month, days, bookedNights, income, today }: Props) {
  const pct = days.length > 0 ? Math.round((bookedNights / days.length) * 100) : 0;
  const nightlyRate = bookedNights > 0 ? income / bookedNights : null;
  const mid = Math.ceil(days.length / 2);

  return (
    <Card className="h-full">
      <CardHeader icon={CalendarIcon} title="Occupancy" description={formatMonth(month)} />
      <div className="px-4 pt-2 pb-5 sm:px-5">
        <div className="flex items-end justify-between gap-3">
          <p className="text-5xl leading-none font-semibold tracking-tight text-slate-900">
            {pct}
            <span className="text-2xl text-slate-400">%</span>
          </p>
          <p className="pb-1 text-right text-xs text-slate-500">
            {bookedNights} of {days.length} nights booked
          </p>
        </div>

        <div
          role="img"
          aria-label={`${bookedNights} of ${days.length} nights booked in ${formatMonth(month)}`}
          className="mt-5 flex h-12 gap-0.5"
        >
          {days.map((d) => {
            const isToday = d.date === today;
            return (
              <span
                key={d.date}
                title={`${formatDate(d.date)} · ${d.booked ? (d.date < today ? "Stayed" : "Booked") : "Vacant"}`}
                className={cn(
                  "min-w-0 flex-1 rounded-[3px] transition-opacity hover:opacity-70",
                  !d.booked && "bg-slate-200",
                  isToday && "ring-2 ring-slate-900 ring-offset-1",
                )}
                style={d.booked ? { backgroundColor: d.date < today ? STAYED : UPCOMING } : undefined}
              />
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
          <span>1</span>
          <span>{mid}</span>
          <span>{days.length}</span>
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <Key color={STAYED} label="Stayed" />
          <Key color={UPCOMING} label="Upcoming" />
          <Key color="#e2e8f0" label="Vacant" />
        </ul>

        <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Avg. nightly rate{" "}
          <span className="ml-1 text-sm font-semibold text-slate-900">
            {nightlyRate === null ? "—" : formatWhole(nightlyRate)}
          </span>
        </div>
      </div>
    </Card>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
      {label}
    </li>
  );
}
