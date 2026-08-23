"use client";

import { useMemo, useState } from "react";

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
import { useAuth } from "@/lib/auth";
import { addDays, nightCount, today } from "@/lib/dates";
import { formatDateRange } from "@/lib/format";
import { findConflicts } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import {
  BOOKING_SOURCES,
  PAYMENT_STATUSES,
  type Booking,
  type BookingSource,
  type PaymentStatus,
} from "@/lib/types";

type FormState = {
  guestName: string;
  source: BookingSource;
  checkIn: string;
  checkOut: string;
  guestsCount: string;
  totalPayout: string;
  platformFee: string;
  paymentStatus: PaymentStatus;
  contactInfo: string;
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
      platformFee: "",
      paymentStatus: "pending",
      contactInfo: "",
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
    platformFee: booking.platformFee ? String(booking.platformFee) : "",
    paymentStatus: booking.paymentStatus,
    contactInfo: booking.contactInfo,
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
          <Button type="submit" form={FORM_ID} variant="primary">
            {booking ? "Save changes" : "Add booking"}
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
      />
    </Modal>
  );
}

function BookingFields({
  booking,
  onClose,
}: {
  booking: Booking | null;
  onClose: () => void;
}) {
  const { bookings, addBooking, updateBooking } = useStore();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(() => initialState(booking));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const conflicts = useMemo(
    () => findConflicts(bookings, form.checkIn, form.checkOut, booking?.id),
    [bookings, form.checkIn, form.checkOut, booking?.id],
  );

  const nights = nightCount(form.checkIn, form.checkOut);

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.guestName.trim()) next.guestName = "Guest name is required.";
    if (!form.checkIn) next.checkIn = "Check-in date is required.";
    if (!form.checkOut) next.checkOut = "Check-out date is required.";
    if (form.checkIn && form.checkOut && form.checkOut <= form.checkIn)
      next.checkOut = "Check-out must be after check-in.";
    if (Number(form.guestsCount) < 1) next.guestsCount = "At least one guest.";
    if (form.totalPayout !== "" && Number(form.totalPayout) < 0)
      next.totalPayout = "Cannot be negative.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const payload = {
      guestName: form.guestName.trim(),
      source: form.source,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      guestsCount: Number(form.guestsCount) || 1,
      totalPayout: Number(form.totalPayout) || 0,
      platformFee: form.source === "airbnb" ? Number(form.platformFee) || 0 : 0,
      paymentStatus: form.paymentStatus,
      contactInfo: form.contactInfo.trim(),
      notes: form.notes.trim(),
      createdBy: booking?.createdBy ?? user?.name ?? "Unknown",
    };

    if (booking) updateBooking(booking.id, payload);
    else addBooking(payload);
    onClose();
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
          error={errors.checkOut}
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
          hint="What you actually receive"
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

        {form.source === "airbnb" ? (
          <Field label="Platform fee" hint="Optional — for profit tracking">
            {(id) => (
              <CurrencyInput
                id={id}
                value={form.platformFee}
                onChange={(e) => set("platformFee", e.target.value)}
                placeholder="0.00"
              />
            )}
          </Field>
        ) : null}

        <Field label="Payment status">
          {(id) => (
            <Select
              id={id}
              value={form.paymentStatus}
              onChange={(e) =>
                set("paymentStatus", e.target.value as PaymentStatus)
              }
            >
              {PAYMENT_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Contact number or email"
          hint="Optional — useful for direct bookings"
          className="sm:col-span-2"
        >
          {(id) => (
            <Input
              id={id}
              value={form.contactInfo}
              onChange={(e) => set("contactInfo", e.target.value)}
              placeholder="0917 555 0143 or guest@example.com"
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

      {conflicts.length > 0 ? (
        <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-xs text-amber-900">
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
              You can still save — double-check this isn&apos;t a
              double-booking.
            </p>
          </div>
        </div>
      ) : null}
    </form>
  );
}
