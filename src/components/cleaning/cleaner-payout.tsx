"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { today } from "@/lib/dates";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { payoutDateDiverges, payoutMonthLabel } from "@/lib/payout-date";
import { useStore } from "@/lib/store";
import type { CleaningRecord } from "@/lib/types";
import { useSubmit, type Submit } from "@/lib/use-submit";

const FORM_ID = "cleaner-payout-form";

/**
 * "Pay the cleaner" — the payout-date prompt behind both one-tap "Mark paid"
 * buttons (the Cleaning page and the dashboard action item).
 *
 * It exists because "Mark paid" used to be a single write with no date, which
 * marked the cleaner paid and created the expense while recording no
 * settlement at all. That leaves the month's outflow pool empty and the month
 * unreconcilable, from the one place the owner was most likely to be acting in
 * good faith. Asking for the date here is the same ask the full Cleaning form
 * makes; this is just the small version of it, for when the amount isn't in
 * question.
 *
 * The amount is deliberately NOT editable here. Changing it is what the full
 * form is for — a payout prompt that quietly let the fee drift would be a worse
 * trap than one that shows what it will record.
 */
export function CleanerPayout({
  open,
  record,
  onClose,
  onSaved,
}: {
  open: boolean;
  record: CleaningRecord | null;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
}) {
  const submit = useSubmit();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pay the cleaner"
      description={
        record
          ? `${record.cleanerName || "Cleaner"} · ${formatCurrency(record.paymentAmount)} · cleaning on ${formatShortDate(record.date)}`
          : undefined
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={submit.saving}>
            {submit.saving ? "Recording…" : "Record payout"}
          </Button>
        </>
      }
    >
      <PayoutFields
        key={record?.id ?? "none"}
        record={record}
        onClose={onClose}
        onSaved={onSaved}
        submit={submit}
      />
    </Modal>
  );
}

function PayoutFields({
  record,
  onClose,
  onSaved,
  submit,
}: {
  record: CleaningRecord | null;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
  submit: Submit;
}) {
  const { updateCleaning } = useStore();
  // Pre-filled because the common case is "I just handed the money over". An
  // unpaid cleaning from an earlier month is exactly where that default is
  // wrong, which is what the divergence note below the field is for.
  const [payoutDate, setPayoutDate] = useState(() => today());
  const [error, setError] = useState<string | null>(null);

  /**
   * A cleaning from an earlier month stamped with today's date files the
   * cleaner's payout in the wrong period, and reconciliation can't detect it
   * because a wrong date reconciles perfectly against itself. Same month is the
   * ordinary case and stays silent — friction there is the enemy.
   */
  const diverges =
    record !== null && payoutDateDiverges(payoutDate, record.date);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!record) return;
    setError(null);
    await submit.run(async () => {
      try {
        await updateCleaning(
          record.id,
          { paymentStatus: "paid", status: "completed" },
          payoutDate,
        );
        await onSaved?.();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't record that payout.");
      }
    });
  }

  return (
    <form id={FORM_ID} onSubmit={onSubmit} className="space-y-4">
      <Field
        label="Payout date"
        hint={`When ₱${(record?.paymentAmount ?? 0).toFixed(2)} was handed over.`}
      >
        {(id) => (
          <Input
            id={id}
            type="date"
            value={payoutDate}
            onChange={(e) => setPayoutDate(e.target.value)}
          />
        )}
      </Field>

      {diverges ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          This cleaning is dated {record?.date}, but the payout date is {payoutDate}.
          Recording it counts the money as leaving the bank in{" "}
          {payoutMonthLabel(payoutDate, today())} month —
          which is what reconciliation will use. If you paid them earlier, change
          the date.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}