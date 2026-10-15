"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CurrencyInput, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { PaymentProof } from "@/components/bookings/payment-proof";
import { today } from "@/lib/dates";
import { useIdentity } from "@/lib/identity";
import {
  createBookingPayment,
  listBookingPayments,
  updateBookingPayment,
  voidBookingPayment,
} from "@/lib/data/booking-payments";
import { formatCurrency, formatDate } from "@/lib/format";
import { useSubmit } from "@/lib/use-submit";
import {
  BOOKING_PAYMENT_METHODS,
  labelFor,
  type BookingPayment,
  type BookingPaymentMethod,
} from "@/lib/types";

/**
 * The payments area on a booking's detail sheet — the last piece of Phase 1's
 * data entry. Records what actually arrived, so the reconciliation workspace
 * has real receipts to match against later.
 *
 * Fetched on demand rather than through the store: payments are per-booking
 * detail, and loading every receipt for every booking on every page load would
 * cost a query the rest of the app has no use for. After a write it calls
 * `resync`, which refreshes the store so the booking's derived payment status
 * badge updates — the write itself already updated that row server-side.
 */
export function BookingPayments({
  bookingId,
  totalPayout,
  source,
  onChanged,
}: {
  bookingId: string;
  /** The booking's expected amount, for the "received X of Y" line. */
  totalPayout: number;
  /** Tailors the date hint — the two channels behave very differently. */
  source: "AIRBNB" | "DIRECT";
  /** Re-fetch the store after a write so the status badge updates. */
  onChanged: () => void;
}) {
  const { user } = useIdentity();
  const [payments, setPayments] = useState<BookingPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<BookingPayment | null>(null);

  const load = useCallback(async () => {
    try {
      setPayments(await listBookingPayments(bookingId));
      setError(null);
    } catch {
      // Distinguish "reconciliation is switched off" from a real failure, so
      // the owner isn't told to retry against a feature that's disabled.
      setError("Couldn't load payments.");
    }
  }, [bookingId]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const rows = await listBookingPayments(bookingId);
        if (live) setPayments(rows);
      } catch {
        if (live) setError("Couldn't load payments.");
      }
    })();
    return () => {
      live = false;
    };
  }, [bookingId]);

  async function voidPayment(p: BookingPayment) {
    try {
      await voidBookingPayment(p.id, user?.name ?? "Unknown");
      await load();
      onChanged();
    } catch {
      setError("Couldn't void this payment. Please try again.");
    }
  }

  const active = (payments ?? []).filter((p) => p.status === "active");
  const received = active.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.round((totalPayout - received) * 100) / 100;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Payments received</h3>
        <Button size="sm" variant="primary" onClick={() => setFormOpen(true)}>
          Record payment
        </Button>
      </div>

      <p className="mt-1 text-xs text-slate-600">
        {formatCurrency(received)} received of {formatCurrency(totalPayout)}
        {remaining > 0 ? ` · ${formatCurrency(remaining)} still expected` : null}
        {remaining < 0 ? " · overpaid" : null}
      </p>

      {error ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {payments === null ? (
        <p className="mt-2 text-xs text-slate-500">Loading…</p>
      ) : payments.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          Nothing recorded yet. Add each receipt separately — a deposit, an
          installment, and the final balance are three separate payments.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {payments.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {formatCurrency(p.amount)}
                  {p.status === "voided" ? (
                    <span className="ml-2 text-xs font-normal text-slate-500">voided</span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDate(p.receivedDate)} · {labelFor(BOOKING_PAYMENT_METHODS, p.method)}
                </p>
                {p.reference ? (
                  <p className="truncate text-xs text-slate-500">Ref {p.reference}</p>
                ) : null}
                {p.notes ? <p className="text-xs text-slate-500">{p.notes}</p> : null}
                <PaymentProof
                  paymentId={p.id}
                  entityKind="payment"
                  hasScreenshot={p.hasPaymentScreenshot}
                  allowRemove={false}
                  onChanged={() => void load()}
                />
              </div>
              {p.status === "active" ? (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditingPayment(p); setFormOpen(true); }}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void voidPayment(p)}>
                    Void
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <BookingPaymentForm
        open={formOpen}
        bookingId={bookingId}
        totalPayout={totalPayout}
        source={source}
        existing={active}
        editingPayment={editingPayment}
        onClose={() => { setFormOpen(false); setEditingPayment(null); }}
        onSaved={async () => {
          setFormOpen(false);
          setEditingPayment(null);
          await load();
          onChanged();
        }}
      />
    </div>
  );
}

type FormState = {
  amount: string;
  receivedDate: string;
  method: BookingPaymentMethod;
  reference: string;
  notes: string;
};

const FORM_ID = "booking-payment-form";

/**
 * What "received" means, per channel.
 *
 * Airbnb *releases* a payout about 24 hours after check-in, but the money then
 * takes a further 3–7 business days to arrive depending on the payout method,
 * and banking skips weekends and holidays. Reconciliation needs the day it was
 * in the account, so this is spelled out rather than guessed: a pre-filled date
 * wrong by a fortnight would land in the wrong month and reconcile perfectly
 * against itself, which is the worst kind of wrong.
 */
const DATE_HINTS: Record<"AIRBNB" | "DIRECT", string> = {
  AIRBNB:
    "When it landed in your account. Airbnb releases it ~24h after check-in, then the bank takes 3–7 business days more.",
  DIRECT: "When the money actually reached you — a deposit and the balance are two separate dates.",
};

function BookingPaymentForm({
  open,
  bookingId,
  totalPayout,
  source,
  existing,
  editingPayment,
  onClose,
  onSaved,
}: {
  open: boolean;
  bookingId: string;
  totalPayout: number;
  source: "AIRBNB" | "DIRECT";
  existing: BookingPayment[];
  editingPayment: BookingPayment | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const submit = useSubmit();
  const isEditing = editingPayment !== null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit payment" : "Record a payment"}
      description="When the money actually arrived, not when the stay is."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={submit.saving}>
            {submit.saving ? "Saving…" : isEditing ? "Save changes" : "Save payment"}
          </Button>
        </>
      }
    >
      <BookingPaymentFields
        key={`${bookingId}-${editingPayment?.id ?? "new"}`}
        bookingId={bookingId}
        totalPayout={totalPayout}
        source={source}
        existing={existing}
        editingPayment={editingPayment}
        onSaved={onSaved}
        submit={submit}
      />
    </Modal>
  );
}

function BookingPaymentFields({
  bookingId,
  totalPayout,
  source,
  existing,
  editingPayment,
  onSaved,
  submit,
}: {
  bookingId: string;
  totalPayout: number;
  source: "AIRBNB" | "DIRECT";
  existing: BookingPayment[];
  editingPayment: BookingPayment | null;
  onSaved: () => Promise<void>;
  submit: ReturnType<typeof useSubmit>;
}) {
  const { user } = useIdentity();
  const isEditing = editingPayment !== null;
  const received = existing.reduce((s, p) => s + p.amount, 0);
  // What's still expected of this booking. The common case by far is one final
  // payment for the remainder — a direct booking's balance, or an Airbnb payout
  // that cleared in full — so it makes a sensible pre-fill and saves retyping a
  // figure the app already knows. Still editable, and the overpaid warning below
  // catches a pre-fill that's wrong for a split payment.
  const remaining = Math.round((totalPayout - received) * 100) / 100;
  const [form, setForm] = useState<FormState>(() =>
    isEditing
      ? {
          amount: String(editingPayment.amount),
          receivedDate: editingPayment.receivedDate,
          method: editingPayment.method,
          reference: editingPayment.reference ?? "",
          notes: editingPayment.notes ?? "",
        }
      : {
          amount: remaining > 0 ? String(remaining) : "",
          receivedDate: today(),
          method: "bank_transfer",
          reference: "",
          notes: "",
        },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [paymentScreenshot, setPaymentScreenshot] = useState<Uint8Array | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Partial<Record<keyof FormState, string>> = {};
    if (form.amount === "" || Number(form.amount) <= 0)
      next.amount = "Enter an amount greater than zero.";
    if (!form.receivedDate) next.receivedDate = "Received date is required.";
    const nextScreenshotError = paymentScreenshot ? null : "A payment screenshot is required.";
    setErrors(next);
    setScreenshotError(nextScreenshotError);
    if (Object.keys(next).length > 0 || nextScreenshotError) return;

    setSubmitError(null);
    await submit.run(async () => {
      try {
        if (isEditing) {
          await updateBookingPayment(editingPayment.id, {
            amount: Number(form.amount),
            receivedDate: form.receivedDate,
            method: form.method,
            reference: form.reference.trim(),
            notes: form.notes.trim(),
          });
        } else {
          if (!paymentScreenshot) {
            setScreenshotError("A payment screenshot is required.");
            return;
          }
          await createBookingPayment(
            {
              bookingId,
              amount: Number(form.amount),
              receivedDate: form.receivedDate,
              method: form.method,
              reference: form.reference.trim(),
              notes: form.notes.trim(),
              createdBy: user?.name ?? "Unknown",
            },
            paymentScreenshot,
          );
        }
        await onSaved();
      } catch {
        setSubmitError("Couldn't save this payment. Please try again.");
      }
    });
  }

  const overpaying =
    form.amount !== "" &&
    received - (isEditing ? editingPayment.amount : 0) + Number(form.amount) > totalPayout;

  return (
    <form id={FORM_ID} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" required error={errors.amount}>
          {(id) => (
            <CurrencyInput
              id={id}
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          )}
        </Field>

        <Field label="Received date" required error={errors.receivedDate} hint={DATE_HINTS[source]}>
          {(id) => (
            <Input
              id={id}
              type="date"
              value={form.receivedDate}
              onChange={(e) => set("receivedDate", e.target.value)}
            />
          )}
        </Field>

        <Field label="Method">
          {(id) => (
            <Select
              id={id}
              value={form.method}
              onChange={(e) => set("method", e.target.value as BookingPaymentMethod)}
            >
              {BOOKING_PAYMENT_METHODS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Reference" hint="Bank ref or Airbnb confirmation code">
          {(id) => (
            <Input
              id={id}
              value={form.reference}
              onChange={(e) => set("reference", e.target.value)}
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
            />
          )}
        </Field>

        <div className="sm:col-span-2">
          {isEditing ? (
            <p className="text-xs text-slate-500">
              Screenshot is managed from the payment details below this form. Use{" "}
              <strong>Replace</strong> there to attach a new one.
            </p>
          ) : (
            <>
              <ImageUploadField
                label="Payment screenshot"
                required
                hint="Upload the receipt for this specific payment. It will be compressed automatically."
                onChange={(bytes) => {
                  setPaymentScreenshot(bytes);
                  if (bytes) setScreenshotError(null);
                }}
              />
              {screenshotError ? (
                <p role="alert" className="mt-1 text-xs text-red-600">
                  {screenshotError}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {overpaying ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          That&apos;s more than the {formatCurrency(totalPayout)} payout. It&apos;ll be
          recorded as overpaid — refund the guest or note why, later.
        </p>
      ) : null}

      {submitError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {submitError}
        </p>
      ) : null}

      <p className="text-xs text-slate-500">
        {isEditing
          ? `After this change payments will total ${formatCurrency(received - editingPayment.amount + Number(form.amount))} of ${formatCurrency(totalPayout)}.`
          : `Recorded payments add up to ${formatCurrency(received)} of ${formatCurrency(totalPayout)}.`}
      </p>
    </form>
  );
}
