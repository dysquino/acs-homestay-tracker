"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { TrashIcon, WarningIcon } from "@/components/ui/icons";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { blockAsBooking } from "@/lib/airbnb-ical";
import { cn } from "@/lib/cn";
import { addDays, today } from "@/lib/dates";
import { blockDays, blockFromDays, dateBlockAsBooking, isDateBlock, MAX_BLOCK_DAYS } from "@/lib/date-blocks";
import { formatDate, formatShortDate } from "@/lib/format";
import { useIdentity } from "@/lib/identity";
import { findConflicts } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import type { DateBlock } from "@/lib/types";
import { useSubmit } from "@/lib/use-submit";

const FORM_ID = "block-dates-form";
const REASONS = ["Maintenance", "Owners' stay", "Deep cleaning"];

/** "Oct 20 – Oct 22, 2026 · 3 days" — the days a block covers (its last day is checkOut − 1). */
export function blockSpan(b: Pick<DateBlock, "checkIn" | "checkOut">): string {
  const last = addDays(b.checkOut, -1);
  const days = blockDays(b);
  const range = last === b.checkIn ? formatDate(b.checkIn) : `${formatShortDate(b.checkIn)} – ${formatDate(last)}`;
  return `${range} · ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Close dates with no guest — maintenance, the owners' own stay. Blocked
 * days disappear from the guests' booking link right away and reach Airbnb
 * through the calendar feed (Airbnb refreshes it every few hours). Days, not
 * nights: blocking Oct 20–22 still lets a guest check out on the morning of
 * the 20th and the next one check in on the 23rd.
 */
export function BlockDatesForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const submit = useSubmit();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Block dates"
      description="For maintenance or your own stay. Guests can't book these days on your link, and Airbnb closes them within a few hours."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={submit.saving}>
            {submit.saving ? "Blocking…" : "Block dates"}
          </Button>
        </>
      }
    >
      {open ? <BlockFields onClose={onClose} submit={submit} /> : null}
    </Modal>
  );
}

function BlockFields({ onClose, submit }: { onClose: () => void; submit: ReturnType<typeof useSubmit> }) {
  const { bookings, airbnbBlocks, dateBlocks, addDateBlock } = useStore();
  const { user } = useIdentity();
  const t = today();
  const [firstDay, setFirstDay] = useState(t);
  const [lastDay, setLastDay] = useState(t);
  const [reason, setReason] = useState("Maintenance");
  const [error, setError] = useState<string | null>(null);

  const inverted = Boolean(firstDay && lastDay && lastDay < firstDay);
  const span = firstDay && lastDay && !inverted ? blockFromDays(firstDay, lastDay) : null;
  const tooLong = span ? blockDays(span) > MAX_BLOCK_DAYS : false;
  const clashes = useMemo(
    () =>
      span
        ? findConflicts(
            [...bookings, ...airbnbBlocks.map(blockAsBooking), ...dateBlocks.map(dateBlockAsBooking)],
            span.checkIn,
            span.checkOut,
          )
        : [],
    [span?.checkIn, span?.checkOut, bookings, airbnbBlocks, dateBlocks], // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!span || tooLong || clashes.length > 0) return;
    setError(null);
    await submit.run(async () => {
      try {
        const result = await addDateBlock({ ...span, reason: reason.trim(), createdBy: user?.name ?? "Unknown" });
        if (result.ok) onClose();
        else setError(result.error);
      } catch {
        setError("Couldn't block these dates. Please try again.");
      }
    });
  }

  const problem = !firstDay || !lastDay
    ? "Pick the first and last day."
    : inverted
      ? "The last day can't be before the first day."
      : tooLong
        ? `Block at most ${MAX_BLOCK_DAYS} days at a time.`
        : clashes.length > 0
          ? `Already taken: ${clashes.map((c) => `${c.guestName} (${formatShortDate(c.checkIn)} – ${formatShortDate(isDateBlock(c) ? addDays(c.checkOut, -1) : c.checkOut)})`).join(", ")}.`
          : null;

  return (
    <form id={FORM_ID} onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First day" required>
          {(id) => <Input id={id} type="date" value={firstDay} onChange={(e) => {
            const v = e.target.value;
            setFirstDay(v);
            if (v && (!lastDay || lastDay < v)) setLastDay(v);
          }} />}
        </Field>
        <Field label="Last day" required>
          {(id) => <Input id={id} type="date" min={firstDay || undefined} value={lastDay} onChange={(e) => setLastDay(e.target.value)} />}
        </Field>
      </div>

      <Field label="Reason" hint="Only you see this — guests just see the days as booked.">
        {(id) => (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={reason === r}
                  onClick={() => setReason(r)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium pointer-coarse:py-2",
                    reason === r ? "border-brand-700 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Input id={id} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Aircon cleaning" />
          </div>
        )}
      </Field>

      {span && !problem ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          Blocking <span className="font-medium text-slate-900">{blockSpan(span)}</span>. A guest can still check out on
          the morning of the first day, and the next can check in the day after the last.
        </p>
      ) : null}
      {problem || error ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
          <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          {error ?? problem}
        </p>
      ) : null}
    </form>
  );
}

/** One block's details, opened from its bar on the calendar, with Remove. */
export function BlockSheet({ block, onClose }: { block: DateBlock | null; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Modal
        open={block !== null && !confirming}
        onClose={onClose}
        title={block?.reason || "Blocked dates"}
        description={block ? blockSpan(block) : undefined}
        footer={
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="danger" onClick={() => setConfirming(true)}>
              <TrashIcon className="h-4 w-4" />
              Remove block
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Closed on your booking link{block?.createdBy ? `, added by ${block.createdBy}` : ""}. Removing it reopens these
          days for guests, and on Airbnb within a few hours.
        </p>
      </Modal>
      <RemoveBlockDialog
        block={confirming ? block : null}
        onDone={() => {
          setConfirming(false);
          onClose();
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

function RemoveBlockDialog({
  block,
  onDone,
  onCancel,
}: {
  block: DateBlock | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { deleteDateBlock } = useStore();
  return (
    <ConfirmDialog
      open={block !== null}
      title="Remove this block?"
      confirmLabel="Remove"
      message={block ? <>{blockSpan(block)} will open for bookings again.</> : null}
      onCancel={onCancel}
      onConfirm={async () => {
        const target = block;
        onDone();
        if (!target) return;
        try {
          await deleteDateBlock(target.id);
        } catch {
          alert("Couldn't remove this block. Please try again.");
        }
      }}
    />
  );
}

/** Upcoming blocks, above the bookings — shown only when there are some. */
export function BlockedDatesList() {
  const { dateBlocks } = useStore();
  const [removing, setRemoving] = useState<DateBlock | null>(null);
  const t = today();
  const upcoming = dateBlocks.filter((b) => b.checkOut > t);
  if (upcoming.length === 0) return null;
  return (
    <Card className="mb-5">
      <CardHeader title={`Blocked dates (${upcoming.length})`} description="Closed for guests here and on Airbnb." />
      <ul className="divide-y divide-slate-100">
        {upcoming.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium text-slate-900">{b.reason || "Blocked"}</p>
              <p className="text-xs text-slate-500">{blockSpan(b)}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setRemoving(b)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <RemoveBlockDialog block={removing} onDone={() => setRemoving(null)} onCancel={() => setRemoving(null)} />
    </Card>
  );
}
