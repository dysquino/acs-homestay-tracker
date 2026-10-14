"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { today } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { payoutDateDiverges, payoutMonthLabel } from "@/lib/payout-date";
import { useStore } from "@/lib/store";
import type { Expense } from "@/lib/types";
import { useSubmit, type Submit } from "@/lib/use-submit";

const FORM_ID = "reimbursement-payout-form";

/**
 * "Reimburse" — the payout-date prompt behind the one-tap "Mark refunded"
 * button on an expense someone paid out of pocket.
 *
 * That button used to clear the owed flag on its own, which recorded a real
 * movement of money — you paid the person who fronted the cost — while leaving
 * no settlement anywhere. The expense then looked settled in the list and
 * contributed nothing to the month's outflow, so the month closed short with
 * no visible cause.
 *
 * Only the outstanding amount is settled, and only for the part still
 * outstanding, so an expense reimbursed in two goes stays correct.
 */
export function ReimbursementPayout({
  open,
  expense,
  onClose,
}: {
  open: boolean;
  expense: Expense | null;
  onClose: () => void;
}) {
  const submit = useSubmit();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reimburse"
      description={
        expense
          ? `${expense.description} · ${formatCurrency(expense.amount)} · paid by ${expense.paidBy || "someone"}`
          : undefined
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={submit.saving}>
            {submit.saving ? "Recording…" : "Record reimbursement"}
          </Button>
        </>
      }
    >
      <PayoutFields key={expense?.id ?? "none"} expense={expense} onClose={onClose} submit={submit} />
    </Modal>
  );
}

function PayoutFields({
  expense,
  onClose,
  submit,
}: {
  expense: Expense | null;
  onClose: () => void;
  submit: Submit;
}) {
  const { updateExpense } = useStore();
  // Pre-filled because reimbursing is usually done the moment it's decided. An
  // expense from an earlier month is exactly where that default is wrong, which
  // is what the note under the field is for.
  const [payoutDate, setPayoutDate] = useState(() => today());
  const [error, setError] = useState<string | null>(null);

  /**
   * Reimbursing an expense from an earlier month files the money in the wrong
   * period, and reconciliation can't detect it — a wrong date reconciles
   * perfectly against itself. Same month is the ordinary case and stays silent.
   */
  const diverges = expense !== null && payoutDateDiverges(payoutDate, expense.date);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!expense) return;
    setError(null);
    await submit.run(async () => {
      try {
        await updateExpense(
          expense.id,
          { refundStatus: "refunded" },
          {
            paidDate: payoutDate,
            settlementType: "owner_reimbursement",
            reimbursedTo: expense.paidBy.trim(),
          },
        );
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't record that reimbursement.");
      }
    });
  }

  return (
    <form id={FORM_ID} onSubmit={onSubmit} className="space-y-4">
      <Field
        label="Payout date"
        hint={`When ${formatCurrency(expense?.amount ?? 0)} was paid back to ${
          expense?.paidBy || "the person who paid"
        }.`}
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
          This expense is dated {expense?.date}, but you paid {expense?.paidBy || "them"} back on{" "}
          {payoutDate}. Recording it counts the money as leaving the bank in{" "}
          {payoutMonthLabel(payoutDate, today())} month — which is what reconciliation will
          use. If you reimbursed earlier, change the date.
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