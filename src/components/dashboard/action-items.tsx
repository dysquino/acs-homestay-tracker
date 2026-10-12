"use client";

import Link from "next/link";
import { useState } from "react";

import { BookingForm } from "@/components/bookings/booking-form";
import { CleaningForm } from "@/components/cleaning/cleaning-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { CheckIcon, WarningIcon } from "@/components/ui/icons";
import type { ActionItem, Urgency } from "@/lib/action-items";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import type { Booking, CleaningRecord } from "@/lib/types";
import { useActionItems } from "@/lib/use-action-items";

/** How many rows before "Show all". */
const COLLAPSED = 6;

const DOT: Record<Urgency, string> = {
  overdue: "bg-red-600",
  soon: "bg-amber-500",
  later: "bg-slate-300",
};
const LABEL: Record<Urgency, string> = { overdue: "Overdue", soon: "Soon", later: "When you can" };

/**
 * "Action items" — what needs doing right now, most urgent first, with a
 * quick action on each: one tap for small, easily reversed changes (mark
 * paid, mark done), the existing form for anything needing details (payout,
 * cleaner), and a link where a decision deserves the full page (booking
 * requests, with their ID photo and payment screenshot). Not affected by the
 * month filter. Rules live in lib/action-items.ts.
 */
export function ActionItems() {
  const items = useActionItems();
  const { bookings, cleaning, updateBooking, updateCleaning } = useStore();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editCleaning, setEditCleaning] = useState<CleaningRecord | null>(null);

  async function run(item: ActionItem, task: () => Promise<void>) {
    setBusy(item.id);
    setError(null);
    try {
      await task();
    } catch {
      setError({ id: item.id, message: "Couldn't save that. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  function act(item: ActionItem) {
    const a = item.action;
    switch (a.type) {
      case "markBookingPaid":
        return run(item, () => updateBooking(a.bookingId, { paymentStatus: "paid" }));
      case "markCleaningDone":
        return run(item, () => updateCleaning(a.cleaningId, { status: "completed" }));
      case "markCleaningPaid":
        // Same as "Mark paid" on the Cleaning page: also records its expense.
        return run(item, () => updateCleaning(a.cleaningId, { paymentStatus: "paid", status: "completed" }));
      case "editBooking":
        return setEditBooking(bookings.find((b) => b.id === a.bookingId) ?? null);
      case "editCleaning":
        return setEditCleaning(cleaning.find((c) => c.id === a.cleaningId) ?? null);
    }
  }

  const overdue = items.filter((i) => i.urgency === "overdue").length;
  const shown = expanded ? items : items.slice(0, COLLAPSED);

  if (items.length === 0) {
    return (
      <div className="mb-5 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]">
        <CheckIcon className="h-4 w-4 text-emerald-600" />
        <span>
          <span className="font-medium text-slate-900">All caught up</span> — nothing needs doing right now.
        </span>
      </div>
    );
  }

  return (
    <Card className={cn("mb-5", overdue > 0 && "ring-2 ring-red-200")}>
      <CardHeader
        icon={WarningIcon}
        title={`Action items (${items.length})`}
        description={
          overdue > 0 ? `${overdue} overdue · most urgent first` : "Most urgent first · not affected by the month filter"
        }
      />
      <ul className="divide-y divide-slate-100">
        {shown.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-5">
            <span className="flex min-w-0 flex-1 items-start gap-2.5">
              <span aria-hidden="true" className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", DOT[item.urgency])} />
              <span className="min-w-0">
                <span className="sr-only">{LABEL[item.urgency]}: </span>
                <span className="block text-sm font-medium text-slate-900">{item.title}</span>
                <span className="block text-xs text-slate-500">{item.detail}</span>
                {error?.id === item.id ? (
                  <span role="alert" className="mt-0.5 block text-xs text-red-700">
                    {error.message}
                  </span>
                ) : null}
              </span>
            </span>
            <span className="ml-5 shrink-0 sm:ml-0">
              {item.action.type === "link" ? (
                <Link
                  href={item.action.href}
                  className="inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-50 pointer-coarse:min-h-9"
                >
                  {item.action.label} →
                </Link>
              ) : (
                <Button
                  size="sm"
                  variant={item.urgency === "overdue" ? "primary" : "secondary"}
                  disabled={busy === item.id}
                  onClick={() => act(item)}
                >
                  {busy === item.id ? "Saving…" : BUTTON[item.action.type]}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {items.length > COLLAPSED ? (
        <div className="border-t border-slate-100 px-4 py-2 sm:px-5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-brand-700 hover:underline pointer-coarse:py-2"
          >
            {expanded ? "Show fewer" : `Show all (${items.length})`}
          </button>
        </div>
      ) : null}

      <BookingForm open={editBooking !== null} booking={editBooking} onClose={() => setEditBooking(null)} />
      <CleaningForm open={editCleaning !== null} record={editCleaning} onClose={() => setEditCleaning(null)} />
    </Card>
  );
}

const BUTTON: Record<Exclude<ActionItem["action"]["type"], "link">, string> = {
  markBookingPaid: "Mark paid",
  editBooking: "Add payout",
  editCleaning: "Assign",
  markCleaningDone: "Mark done",
  markCleaningPaid: "Mark paid",
};
