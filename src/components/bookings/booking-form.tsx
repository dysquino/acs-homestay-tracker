"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CurrencyInput,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/field";
import { WarningIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { IdPhotoProof } from "@/components/bookings/id-photo";
import { PaymentProof } from "@/components/bookings/payment-proof";
import { useIdentity } from "@/lib/identity";
import { addDays, nightCount, today } from "@/lib/dates";
import { formatDateRange } from "@/lib/format";
import { blockAsBooking, isAirbnbBlock } from "@/lib/airbnb-ical";
import { dateBlockAsBooking } from "@/lib/date-blocks";
import { findConflicts } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import { useSubmit, type Submit } from "@/lib/use-submit";
import {
  BOOKING_SOURCES,
  type Booking,
  type BookingSource,
} from "@/lib/types";

type FormState = {
  guestName: string;
  source: BookingSource;
  checkIn: string;
  checkOut: string;
  guestsCount: string;
  totalPayout: string;
  notes: string;
};

function initialState(booking: Booking | null): FormState {
  if (!booking) {
    return {
      guestName: "",
      source: "airbnb",
      checkIn: today(),
      checkOut: addDays(today(), 2),
      guestsCount: "2",
      totalPayout: "",
      notes: "",
    };
  }
  return {
    guestName: booking.guestName,
    source: booking.source,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    guestsCount: String(booking.guestsCount),
    totalPayout: String(booking.totalPayout),
    notes: booking.notes,
  };
}

const FORM_ID = "booking-form";

export function BookingForm({
  open,
  booking,
  onClose,
}: {
  open: boolean;
  /** Present when editing, null when adding. */
  booking: Booking | null;
  onClose: () => void;
}) {
  const submit = useSubmit();
  // Invalid or overlapping dates block saving (no double bookings); the
  // fields below report it up because the submit button lives in the footer.
  const [blocked, setBlocked] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={booking ? "Edit booking" : "Add booking"}
      description={
        booking
          ? undefined
          : "A cleaning turnover will be scheduled automatically for the check-out date."
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={submit.saving || blocked}>
            {submit.saving ? "Saving…" : booking ? "Save changes" : "Add booking"}
          </Button>
        </>
      }
    >
      {/* Mounted only while open, and re-keyed per booking, so the fields
          always start from a clean copy of the record being edited. */}
      <BookingFields
        key={booking?.id ?? "new"}
        booking={booking}
        onClose={onClose}
        submit={submit}
        onBlockedChange={setBlocked}
      />
    </Modal>
  );
}

function BookingFields({
  booking,
  onClose,
  submit,
  onBlockedChange,
}: {
  booking: Booking | null;
  onClose: () => void;
  submit: Submit;
  onBlockedChange: (blocked: boolean) => void;
}) {
  const { bookings, airbnbBlocks, dateBlocks, addBooking, updateBooking, resync } = useStore();
  const { user } = useIdentity();
  const [form, setForm] = useState<FormState>(() => initialState(booking));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // A direct booking must also stay clear of Airbnb reservations not imported
  // yet and of the owners' blocked dates (the server checks the same). Airbnb bookings aren't held to that:
  // Airbnb already keeps its own reservations apart.
  const conflicts = useMemo(
    () =>
      findConflicts(
        form.source === "direct"
          ? [...bookings, ...airbnbBlocks.map(blockAsBooking), ...dateBlocks.map(dateBlockAsBooking)]
          : bookings,
        form.checkIn,
        form.checkOut,
        booking?.id,
      ),
    [bookings, airbnbBlocks, dateBlocks, form.source, form.checkIn, form.checkOut, booking?.id],
  );

  // Double bookings aren't allowed. When editing, only new dates (or a switch
  // to Direct, which brings in the Airbnb check) are held to that, so a
  // booking that overlapped from before the rule can still be updated (the
  // server applies the same rule).
  const datesChanged =
    !booking ||
    form.checkIn !== booking.checkIn ||
    form.checkOut !== booking.checkOut ||
    (form.source === "direct" && booking.source !== "direct");
  const overlapBlocked = conflicts.length > 0 && datesChanged;
  // Checked live, not just on submit: an inverted range can't be saved, and
  // while it's inverted the overlap check above can't run either.
  const datesInverted = Boolean(form.checkIn && form.checkOut && form.checkOut <= form.checkIn);
  useEffect(
    () => onBlockedChange(overlapBlocked || datesInverted),
    [overlapBlocked, datesInverted, onBlockedChange],
  );

  const nights = nightCount(form.checkIn, form.checkOut);

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.guestName.trim()) next.guestName = "Guest name is required.";
    if (!form.checkIn) next.checkIn = "Check-in date is required.";
    if (!form.checkOut) next.checkOut = "Check-out date is required.";
    if (form.checkIn && form.checkOut && form.checkOut <= form.checkIn)
      next.checkOut = "Check-out must be after check-in.";
    if (!Number.isInteger(Number(form.guestsCount)) || Number(form.guestsCount) < 1)
      next.guestsCount = "Enter a whole number of at least 1.";
    if (form.totalPayout !== "" && Number(form.totalPayout) < 0)
      next.totalPayout = "Cannot be negative.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || overlapBlocked || datesInverted) return;

    const payload = {
      guestName: form.guestName.trim(),
      source: form.source,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      guestsCount: Number(form.guestsCount) || 1,
      totalPayout: Number(form.totalPayout) || 0,
      // No longer on the form; an edit keeps whatever the booking already has
      // (e.g. the service fee an Airbnb import recorded).
      platformFee: booking?.platformFee ?? 0,
      // Payment status is derived from the booking's recorded payments
      // (§12.1), so it is no longer picked here — an edit passes through
      // whatever the cache already holds, and a new booking starts pending
      // until its first payment is recorded.
      paymentStatus: booking?.paymentStatus ?? "pending",
      contactInfo: booking?.contactInfo ?? "",
      notes: form.notes.trim(),
      createdBy: booking?.createdBy ?? user?.name ?? "Unknown",
    };

    setSubmitError(null);
    await submit.run(async () => {
      try {
        if (booking) await updateBooking(booking.id, payload);
        else await addBooking(payload);
        onClose();
      } catch {
        setSubmitError("Couldn't save this booking. Please try again.");
      }
    });
  }

  return (
    <form id={FORM_ID} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Guest name" required error={errors.guestName}>
          {(id) => (
            <Input
              id={id}
              value={form.guestName}
              onChange={(e) => set("guestName", e.target.value)}
              placeholder="e.g. Maria Santos"
              autoFocus
            />
          )}
        </Field>

        <Field label="Source" required>
          {(id) => (
            <Select
              id={id}
              value={form.source}
              onChange={(e) => set("source", e.target.value as BookingSource)}
            >
              {BOOKING_SOURCES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Check-in" required error={errors.checkIn}>
          {(id) => (
            <Input
              id={id}
              type="date"
              value={form.checkIn}
              onChange={(e) => set("checkIn", e.target.value)}
            />
          )}
        </Field>

        <Field
          label="Check-out"
          required
          error={datesInverted ? "Check-out must be after check-in." : errors.checkOut}
          hint={
            nights > 0 ? `${nights} night${nights > 1 ? "s" : ""}` : undefined
          }
        >
          {(id) => (
            <Input
              id={id}
              type="date"
              min={form.checkIn || undefined}
              value={form.checkOut}
              onChange={(e) => set("checkOut", e.target.value)}
            />
          )}
        </Field>

        {/* Right under the dates it's about, so on a phone the reason the
            save button is disabled is in view, not at the bottom of the form. */}
        <div className="empty:hidden sm:col-span-2">
          {conflicts.length > 0 ? (
            <div
              role={overlapBlocked ? "alert" : undefined}
              className={`flex gap-2.5 rounded-lg border p-3 ${
                overlapBlocked ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
              }`}
            >
              <WarningIcon
                className={`mt-0.5 h-4 w-4 shrink-0 ${overlapBlocked ? "text-red-600" : "text-amber-600"}`}
              />
              <div className={`text-xs ${overlapBlocked ? "text-red-800" : "text-amber-900"}`}>
                <p className="font-medium">
                  These dates overlap {conflicts.length} existing booking
                  {conflicts.length > 1 ? "s" : ""}.
                </p>
                <ul className="mt-1 space-y-0.5">
                  {conflicts.map((c) => (
                    <li key={c.id}>
                      {c.guestName} — {formatDateRange(c.checkIn, c.checkOut)} (
                      {c.source === "airbnb" ? "Airbnb" : "Direct"})
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5">
                  {overlapBlocked
                    ? conflicts.some(isAirbnbBlock)
                  ? "Double bookings aren't allowed. Change the dates to save. (If the Airbnb reservation was cancelled, it frees up within about 10 minutes.)"
                  : "Double bookings aren't allowed. Change the dates to save — or delete the other booking first if it was cancelled."
                    : "This booking already overlapped before double bookings were blocked. You can still update it, but its dates can't be moved to another overlap."}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <Field label="Number of guests" error={errors.guestsCount}>
          {(id) => (
            <Input
              id={id}
              type="number"
              min={1}
              inputMode="numeric"
              value={form.guestsCount}
              onChange={(e) => set("guestsCount", e.target.value)}
            />
          )}
        </Field>

        <Field
          label="Total payout"
          hint={
            form.source === "airbnb"
              ? "What Airbnb pays out to you (its \"Paid out\" amount)"
              : "What you actually receive"
          }
          error={errors.totalPayout}
        >
          {(id) => (
            <CurrencyInput
              id={id}
              value={form.totalPayout}
              onChange={(e) => set("totalPayout", e.target.value)}
              placeholder="0.00"
            />
          )}
        </Field>

        <Field label="Notes" className="sm:col-span-2">
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Special requests, arrival time, etc."
            />
          )}
        </Field>
      </div>

      {/* Photos — only meaningful for an existing booking (the add form has
          no booking id to attach them to yet). The same widgets the request
          card uses, just pointed at a Booking instead of a BookingRequest. */}
      {booking ? (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-medium text-slate-700">Photos</h3>
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="shrink-0 text-slate-500">ID photo:</span>
              <IdPhotoProof
                bookingId={booking.id}
                entityKind="booking"
                hasPhoto={booking.hasIdPhoto}
                onChanged={resync}
              />
            </div>
            <div className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="shrink-0 text-slate-500">Payment screenshot:</span>
              <PaymentProof
                bookingId={booking.id}
                entityKind="booking"
                hasScreenshot={booking.hasPaymentScreenshot}
                onChanged={resync}
              />
            </div>
          </div>
        </div>
      ) : null}

      {submitError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {submitError}
        </p>
      ) : null}

    </form>
  );
}
