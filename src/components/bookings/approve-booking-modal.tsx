"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { CurrencyInput, Field, Input, Select } from "@/components/ui/field";
import { ImageUploadField } from "@/components/ui/image-upload-field";
import { Modal } from "@/components/ui/modal";
import { RateCardBreakdown } from "@/components/bookings/rate-card";
import { nightCount, today } from "@/lib/dates";
import { formatCurrency, formatDateRange } from "@/lib/format";
import { wouldOverpay } from "@/lib/payment-status";
import { calculateBookingPrice, calculateStayPrice } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import { useSubmit } from "@/lib/use-submit";
import {
  BOOKING_PAYMENT_METHODS,
  type Booking,
  type BookingPaymentMethod,
  type BookingRequest,
} from "@/lib/types";

const FORM_ID = "approve-booking-form";

/** A field's text as a number. An empty field reads as zero. */
function amount(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Approving a guest's request in one step: what the stay is worth, and
 * whether the money has landed.
 *
 * The rates start from the owner's own settings (per-night rate and the
 * cleaning fee for this length of stay) and every one of them is editable —
 * the per-night rate, the cleaning fee, and the total. Changing a rate
 * re-prices the stay; changing the total overrides the rates. The owner's
 * number always wins, so the total stays the authoritative amount and the
 * rate card is the breakdown behind it.
 *
 * The deposit is recorded as a real receipt against the booking, because
 * `paymentStatus` is derived from the receipt rows (§12.1). It is recorded
 * whether or not the reconciliation feature is switched on: "did the guest
 * pay?" is core booking data, and the toggle only hides the matching
 * workspace.
 *
 * The guest's own payment screenshot is reused as the deposit's proof when
 * they sent one; the owner can attach a different one here.
 */
export function ApproveBookingModal({
  request,
  onClose,
  onApproved,
}: {
  /** The request being approved. The parent mounts this per request. */
  request: BookingRequest;
  onClose: () => void;
  onApproved: (booking: Booking) => void;
}) {
  const { pricing, approveRequestWithPayment } = useStore();
  const submit = useSubmit();

  const nights = nightCount(request.checkIn, request.checkOut);
  // The owner's standard rates for a stay this long — where the fields start.
  const standard = useMemo(() => calculateStayPrice(pricing, nights), [pricing, nights]);

  // The owner's numbers, kept as overrides over the standard. `null` means
  // "whatever the rates say" — so a rate change is picked up on its own, and
  // typing over a value takes it over for good.
  const [nightlyOverride, setNightlyOverride] = useState<string | null>(null);
  const [cleaningOverride, setCleaningOverride] = useState<string | null>(null);
  const [totalOverride, setTotalOverride] = useState<string | null>(null);
  const [depositOverride, setDepositOverride] = useState<string | null>(null);

  const [paymentReceived, setPaymentReceived] = useState(false);
  const [receivedDate, setReceivedDate] = useState(today());
  const [method, setMethod] = useState<BookingPaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<Uint8Array | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const nightlyRate = nightlyOverride ?? String(standard.nightlyRate);
  const cleaningFee = cleaningOverride ?? String(standard.cleaningFee);

  // The rate card as it stands with the owner's numbers in the fields.
  const card = useMemo(
    () =>
      calculateBookingPrice(
        pricing,
        { nightlyRate: amount(nightlyRate), cleaningFee: amount(cleaningFee) },
        nights,
      ),
    [pricing, nightlyRate, cleaningFee, nights],
  );

  const totalPayout = totalOverride ?? String(card.total);
  // The deposit follows the amount due — a deposit of less than the total is
  // the normal case, and the owner overrides it if they paid something else.
  const amountReceived = depositOverride ?? totalPayout;

  const total = amount(totalPayout);
  const deposit = amount(amountReceived);
  const overpaying = paymentReceived && wouldOverpay(total, [], deposit);
  const short = paymentReceived && !overpaying && deposit < total;
  // The total was set by hand and no longer matches the rates behind it.
  const totalOverridden = totalOverride !== null && amount(totalOverride) !== card.total;

  /** Changing a rate re-prices the stay, so the total follows it again. */
  function setRate(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setTotalOverride(null);
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!Number.isFinite(total) || total < 0) next.totalPayout = "Enter an amount of zero or more.";
    if (amount(nightlyRate) < 0) next.nightlyRate = "Enter a rate of zero or more.";
    if (amount(cleaningFee) < 0) next.cleaningFee = "Enter a fee of zero or more.";
    if (paymentReceived && (!Number.isFinite(deposit) || deposit <= 0)) {
      next.amountReceived = "Enter the amount that reached the bank.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitError(null);
    await submit.run(async () => {
      try {
        const result = await approveRequestWithPayment(request.id, {
          totalPayout: total,
          // Stored as this stay's own rates, so the breakdown stays true even
          // after the owner's standard rates change.
          nightlyRate: amount(nightlyRate),
          cleaningFee: amount(cleaningFee),
          paymentReceived,
          amountReceived: paymentReceived ? deposit : undefined,
          receivedDate: paymentReceived ? receivedDate : undefined,
          method: paymentReceived ? method : undefined,
          reference: paymentReceived ? reference.trim() : undefined,
          paymentScreenshot: proof,
        });
        if (!result.ok) {
          setSubmitError(result.error);
          return;
        }
        if (result.booking) onApproved(result.booking);
        onClose();
      } catch {
        setSubmitError("Couldn't approve this request. Please try again.");
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Approve this booking"
      description={`${request.guestName} · ${formatDateRange(request.checkIn, request.checkOut)} · ${nights} night${nights === 1 ? "" : "s"}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={submit.saving} disabled={submit.saving}>
            {submit.saving ? "Approving…" : "Approve booking"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-slate-700">What this stay is worth</p>
            {nightlyOverride !== null || cleaningOverride !== null ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="px-2 py-1 text-xs"
                onClick={() => {
                  setNightlyOverride(null);
                  setCleaningOverride(null);
                  setTotalOverride(null);
                }}
              >
                Reset to your standard rate
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nightly rate" error={errors.nightlyRate} hint="Per night for this stay">
              {(id) => (
                <CurrencyInput
                  id={id}
                  value={nightlyRate}
                  onChange={(e) => setRate(setNightlyOverride)(e.target.value)}
                  placeholder="0.00"
                />
              )}
            </Field>
            <Field label="Cleaning fee" error={errors.cleaningFee} hint="One-off fee for this stay">
              {(id) => (
                <CurrencyInput
                  id={id}
                  value={cleaningFee}
                  onChange={(e) => setRate(setCleaningOverride)(e.target.value)}
                  placeholder="0.00"
                />
              )}
            </Field>
          </div>

          <RateCardBreakdown
            nightlyRate={card.nightlyRate}
            nights={card.nights}
            subtotal={card.subtotal}
            cleaningFee={card.cleaningFee}
            tierLabel={card.tierLabel}
            total={card.total}
          />
        </div>

        <Field
          label="Total amount due"
          required
          error={errors.totalPayout}
          hint="What the guest pays. Change it to override the rates above."
        >
          {(id) => (
            <CurrencyInput
              id={id}
              value={totalPayout}
              onChange={(e) => setTotalOverride(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          )}
        </Field>

        {totalOverridden ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            These rates come to {formatCurrency(card.total)}, but this stay is charged {formatCurrency(total)}.
          </p>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-slate-700">Have you received the payment?</legend>
          <div className="flex flex-wrap gap-2">
            <label
              className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                !paymentReceived
                  ? "border-brand-600 bg-brand-50 text-brand-900"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="payment-received"
                checked={!paymentReceived}
                onChange={() => setPaymentReceived(false)}
                className="h-4 w-4 border-slate-300 text-brand-700 focus:ring-brand-600"
              />
              <span>Not yet</span>
            </label>
            <label
              className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                paymentReceived
                  ? "border-brand-600 bg-brand-50 text-brand-900"
                  : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="payment-received"
                checked={paymentReceived}
                onChange={() => setPaymentReceived(true)}
                className="h-4 w-4 border-slate-300 text-brand-700 focus:ring-brand-600"
              />
              <span>Yes, it&apos;s in the bank</span>
            </label>
          </div>
          <p className="text-xs text-slate-500">
            {paymentReceived
              ? "Confirm how much actually arrived — a deposit is usually less than the total."
              : "The booking is created as unpaid. You can record the payment later."}
          </p>
        </fieldset>

        {paymentReceived ? (
          <div className="space-y-4 rounded-lg border border-slate-200 p-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount deposited" required error={errors.amountReceived}>
                {(id) => (
                  <CurrencyInput
                    id={id}
                    value={amountReceived}
                    onChange={(e) => setDepositOverride(e.target.value)}
                    placeholder="0.00"
                  />
                )}
              </Field>

              <Field label="Date received" required>
                {(id) => (
                  <Input
                    id={id}
                    type="date"
                    value={receivedDate}
                    onChange={(e) => setReceivedDate(e.target.value)}
                  />
                )}
              </Field>

              <Field label="Method">
                {(id) => (
                  <Select
                    id={id}
                    value={method}
                    onChange={(e) => setMethod(e.target.value as BookingPaymentMethod)}
                  >
                    {BOOKING_PAYMENT_METHODS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Reference" hint="Bank reference, if you have it">
                {(id) => (
                  <Input
                    id={id}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Optional"
                  />
                )}
              </Field>
            </div>

            {short ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {formatCurrency(total - deposit)} still expected on this stay.
              </p>
            ) : null}

            {overpaying ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                That&apos;s more than the {formatCurrency(total)} due — it&apos;ll be recorded as overpaid. Refund the
                excess or note why, later.
              </p>
            ) : null}

            <ImageUploadField
              label="Payment proof"
              hint={
                request.hasPaymentScreenshot
                  ? "The guest's own screenshot is attached to this deposit automatically. Upload here to replace it."
                  : "Optional — the guest didn't send a screenshot. You can attach one later."
              }
              onChange={setProof}
            />
          </div>
        ) : null}

        {submitError ? (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {submitError}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
