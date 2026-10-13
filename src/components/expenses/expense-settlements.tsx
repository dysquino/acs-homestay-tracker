"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CurrencyInput, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { today } from "@/lib/dates";
import { useIdentity } from "@/lib/identity";
import {
  createExpenseSettlement,
  listExpenseSettlements,
  voidExpenseSettlement,
} from "@/lib/data/expense-settlements";
import { formatCurrency, formatDate } from "@/lib/format";
import { useSubmit } from "@/lib/use-submit";
import {
  PAID_BY,
  SETTLEMENT_TYPES,
  labelFor,
  type Expense,
  type ExpenseSettlement,
  type SettlementType,
} from "@/lib/types";

/**
 * The settlements area on an expense's detail sheet.
 *
 * The distinction this encodes is the one in RECONCILIATION_SPEC §4.5: an
 * expense records what a cost was for, a settlement records when the money
 * actually left the bank. An owner who bought supplies out of pocket creates an
 * expense and nothing here — the reimbursement only becomes a bank outflow when
 * it's recorded below, dated the day they were actually paid back.
 */
export function ExpenseSettlements({
  expense,
  onChanged,
}: {
  expense: Expense;
  onChanged: () => void;
}) {
  const { user } = useIdentity();
  const [settlements, setSettlements] = useState<ExpenseSettlement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setSettlements(await listExpenseSettlements(expense.id));
      setError(null);
    } catch {
      setError("Couldn't load settlements.");
    }
  }, [expense.id]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const rows = await listExpenseSettlements(expense.id);
        if (live) setSettlements(rows);
      } catch {
        if (live) setError("Couldn't load settlements.");
      }
    })();
    return () => {
      live = false;
    };
  }, [expense.id]);

  async function voidSettlement(s: ExpenseSettlement) {
    try {
      await voidExpenseSettlement(s.id, user?.name ?? "Unknown");
      await load();
      onChanged();
    } catch {
      setError("Couldn't void this settlement. Please try again.");
    }
  }

  const active = (settlements ?? []).filter((s) => s.status === "active");
  const settled = active.reduce((sum, s) => sum + s.amount, 0);
  const unpaid = Math.round((expense.amount - settled) * 100) / 100;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Paid out</h3>
        <Button size="sm" variant="primary" onClick={() => setFormOpen(true)}>
          Record payout
        </Button>
      </div>

      <p className="mt-1 text-xs text-slate-600">
        {formatCurrency(settled)} of {formatCurrency(expense.amount)} left the bank
        {unpaid > 0 ? ` · ${formatCurrency(unpaid)} not yet paid out` : null}
      </p>
      {expense.refundStatus === "owed" && settled === 0 ? (
        <p className="mt-1 text-xs text-amber-700">
          Marked as owed to whoever fronted this — record the reimbursement when
          you pay them back.
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {settlements === null ? (
        <p className="mt-2 text-xs text-slate-500">Loading…</p>
      ) : settlements.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          Nothing recorded yet. Only add a payout here when money actually leaves
          the homestay account.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {settlements.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {formatCurrency(s.amount)}
                  {s.status === "voided" ? (
                    <span className="ml-2 text-xs font-normal text-slate-500">voided</span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDate(s.paidDate)} · {labelFor(SETTLEMENT_TYPES, s.settlementType)}
                  {s.reimbursedTo ? ` · to ${s.reimbursedTo}` : ""}
                </p>
                {s.reference ? (
                  <p className="truncate text-xs text-slate-500">Ref {s.reference}</p>
                ) : null}
              </div>
              {s.status === "active" ? (
                <Button size="sm" variant="ghost" onClick={() => void voidSettlement(s)}>
                  Void
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <SettlementForm
        open={formOpen}
        expense={expense}
        onClose={() => setFormOpen(false)}
        onSaved={async () => {
          setFormOpen(false);
          await load();
          onChanged();
        }}
      />
    </div>
  );
}

type FormState = {
  amount: string;
  paidDate: string;
  settlementType: SettlementType;
  reimbursedTo: string;
  reference: string;
  notes: string;
};

const FORM_ID = "expense-settlement-form";

function SettlementForm({
  open,
  expense,
  onClose,
  onSaved,
}: {
  open: boolean;
  expense: Expense;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const submit = useSubmit();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a payout"
      description="When the money actually left the homestay account."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={submit.saving}>
            {submit.saving ? "Saving…" : "Save payout"}
          </Button>
        </>
      }
    >
      <SettlementFields
        key={expense.id}
        expense={expense}
        onSaved={onSaved}
        submit={submit}
      />
    </Modal>
  );
}

function SettlementFields({
  expense,
  onSaved,
  submit,
}: {
  expense: Expense;
  onSaved: () => Promise<void>;
  submit: ReturnType<typeof useSubmit>;
}) {
  const { user } = useIdentity();
  // An expense marked "owed" is by definition waiting to be reimbursed, so
  // that's the sensible default rather than making the owner pick it again.
  const [form, setForm] = useState<FormState>({
    amount: String(expense.amount),
    paidDate: today(),
    settlementType: expense.refundStatus === "owed" ? "owner_reimbursement" : "direct_vendor_payment",
    reimbursedTo: expense.paidBy,
    reference: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isReimbursement = form.settlementType === "owner_reimbursement";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Partial<Record<keyof FormState, string>> = {};
    if (form.amount === "" || Number(form.amount) <= 0)
      next.amount = "Enter an amount greater than zero.";
    if (!form.paidDate) next.paidDate = "Paid date is required.";
    if (isReimbursement && !form.reimbursedTo.trim())
      next.reimbursedTo = "Say who was reimbursed.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitError(null);
    await submit.run(async () => {
      try {
        await createExpenseSettlement({
          expenseId: expense.id,
          amount: Number(form.amount),
          paidDate: form.paidDate,
          settlementType: form.settlementType,
          reimbursedTo: isReimbursement ? form.reimbursedTo.trim() : "",
          reference: form.reference.trim(),
          notes: form.notes.trim(),
          createdBy: user?.name ?? "Unknown",
        });
        await onSaved();
      } catch {
        setSubmitError("Couldn't save this payout. Please try again.");
      }
    });
  }

  return (
    <form id={FORM_ID} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" required error={errors.amount}>
          {(id) => (
            <CurrencyInput
              id={id}
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              autoFocus
            />
          )}
        </Field>

        <Field label="Paid date" required error={errors.paidDate}>
          {(id) => (
            <Input
              id={id}
              type="date"
              value={form.paidDate}
              onChange={(e) => set("paidDate", e.target.value)}
            />
          )}
        </Field>

        <Field
          label="Kind"
          className="sm:col-span-2"
          hint="Reimbursing someone covers money they spent out of pocket."
        >
          {(id) => (
            <Select
              id={id}
              value={form.settlementType}
              onChange={(e) => set("settlementType", e.target.value as SettlementType)}
            >
              {SETTLEMENT_TYPES.filter((o) => o.value !== "guest_refund").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {isReimbursement ? (
          <Field label="Reimbursed to" required error={errors.reimbursedTo}>
            {(id) => (
              <Select
                id={id}
                value={form.reimbursedTo}
                onChange={(e) => set("reimbursedTo", e.target.value)}
              >
                <option value="">Select who was paid</option>
                {form.reimbursedTo && !PAID_BY.some((p) => p.value === form.reimbursedTo) ? (
                  <option value={form.reimbursedTo}>{form.reimbursedTo}</option>
                ) : null}
                {PAID_BY.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        <Field label="Reference" hint="Bank or receipt number">
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
      </div>

      {submitError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {submitError}
        </p>
      ) : null}

      <p className="text-xs text-slate-500">
        For &ldquo;{expense.description}&rdquo; — {formatCurrency(expense.amount)}.
      </p>
    </form>
  );
}