"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CurrencyInput,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/lib/auth";
import { today } from "@/lib/dates";
import { formatDateRange } from "@/lib/format";
import { knownCleaners } from "@/lib/selectors";
import { DEFAULT_CLEANING_FEE, useStore } from "@/lib/store";
import {
  CLEANING_PAYMENT_STATUSES,
  CLEANING_STATUSES,
  type CleaningPaymentStatus,
  type CleaningRecord,
  type CleaningStatus,
} from "@/lib/types";

type FormState = {
  date: string;
  bookingId: string;
  cleanerName: string;
  status: CleaningStatus;
  paymentAmount: string;
  paymentStatus: CleaningPaymentStatus;
  notes: string;
};

function initialState(record: CleaningRecord | null): FormState {
  if (!record) {
    return {
      date: today(),
      bookingId: "",
      cleanerName: "",
      status: "scheduled",
      paymentAmount: String(DEFAULT_CLEANING_FEE),
      paymentStatus: "unpaid",
      notes: "",
    };
  }
  return {
    date: record.date,
    bookingId: record.bookingId ?? "",
    cleanerName: record.cleanerName,
    status: record.status,
    paymentAmount: String(record.paymentAmount),
    paymentStatus: record.paymentStatus,
    notes: record.notes,
  };
}

const FORM_ID = "cleaning-form";

export function CleaningForm({
  open,
  record,
  onClose,
}: {
  open: boolean;
  record: CleaningRecord | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={record ? "Edit cleaning" : "Add cleaning"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary">
            {record ? "Save changes" : "Add cleaning"}
          </Button>
        </>
      }
    >
      <CleaningFields
        key={record?.id ?? "new"}
        record={record}
        onClose={onClose}
      />
    </Modal>
  );
}

function CleaningFields({
  record,
  onClose,
}: {
  record: CleaningRecord | null;
  onClose: () => void;
}) {
  const { bookings, cleaning, addCleaning, updateCleaning } = useStore();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(() => initialState(record));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** Picking a booking pre-fills the date with its check-out. */
  function onPickBooking(bookingId: string) {
    const booking = bookings.find((b) => b.id === bookingId);
    setForm((f) => ({
      ...f,
      bookingId,
      date: booking ? booking.checkOut : f.date,
    }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.date) next.date = "Date is required.";
    if (form.paymentAmount !== "" && Number(form.paymentAmount) < 0)
      next.paymentAmount = "Cannot be negative.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = {
      date: form.date,
      bookingId: form.bookingId || null,
      cleanerName: form.cleanerName.trim(),
      status: form.status,
      paymentAmount: Number(form.paymentAmount) || 0,
      paymentStatus: form.paymentStatus,
      notes: form.notes.trim(),
      createdBy: record?.createdBy ?? user?.name ?? "Unknown",
    };

    if (record) updateCleaning(record.id, payload);
    else addCleaning(payload);
    onClose();
  }

  const sortedBookings = [...bookings].sort((a, b) =>
    b.checkOut.localeCompare(a.checkOut),
  );

  return (
    <form id={FORM_ID} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" required error={errors.date}>
          {(id) => (
            <Input
              id={id}
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
            />
          )}
        </Field>

        <Field label="Cleaner">
          {(id) => (
            <>
              <Input
                id={id}
                list="cleaner-names"
                value={form.cleanerName}
                onChange={(e) => set("cleanerName", e.target.value)}
                placeholder="Unassigned"
                autoFocus
              />
              <datalist id="cleaner-names">
                {knownCleaners(cleaning).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        <Field
          label="Linked booking"
          hint="Optional — the stay this turnover follows"
          className="sm:col-span-2"
        >
          {(id) => (
            <Select
              id={id}
              value={form.bookingId}
              onChange={(e) => onPickBooking(e.target.value)}
            >
              <option value="">Not linked</option>
              {sortedBookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.guestName} — {formatDateRange(b.checkIn, b.checkOut)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Status">
          {(id) => (
            <Select
              id={id}
              value={form.status}
              onChange={(e) => set("status", e.target.value as CleaningStatus)}
            >
              {CLEANING_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Payment amount" error={errors.paymentAmount}>
          {(id) => (
            <CurrencyInput
              id={id}
              value={form.paymentAmount}
              onChange={(e) => set("paymentAmount", e.target.value)}
              placeholder="0.00"
            />
          )}
        </Field>

        <Field label="Payment status">
          {(id) => (
            <Select
              id={id}
              value={form.paymentStatus}
              onChange={(e) =>
                set("paymentStatus", e.target.value as CleaningPaymentStatus)
              }
            >
              {CLEANING_PAYMENT_STATUSES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Notes" className="sm:col-span-2">
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="e.g. laundry, restocking needed"
            />
          )}
        </Field>
      </div>
    </form>
  );
}
