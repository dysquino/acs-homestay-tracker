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
import { useIdentity } from "@/lib/identity";
import { createExpenseSettlement } from "@/lib/data/expense-settlements";
import { today } from "@/lib/dates";
import { useStore } from "@/lib/store";
import { useSubmit, type Submit } from "@/lib/use-submit";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_REFUND_STATUSES,
  PAID_BY,
  type Expense,
  type ExpenseCategory,
  type ExpenseRefundStatus,
} from "@/lib/types";

type FormState = {
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  paidBy: string;
  refundStatus: ExpenseRefundStatus;
  /** YYYY-MM-DD, or "" to leave the expense without a recorded payout. */
  payoutDate: string;
};

const FORM_ID = "expense-form";

export function ExpenseForm({
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
      title={expense ? "Edit expense" : "Add expense"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={submit.saving}>
            {submit.saving ? "Saving…" : expense ? "Save changes" : "Add expense"}
          </Button>
        </>
      }
    >
      <ExpenseFields
        key={expense?.id ?? "new"}
        expense={expense}
        onClose={onClose}
        submit={submit}
      />
    </Modal>
  );
}

function ExpenseFields({
  expense,
  onClose,
  submit,
}: {
  expense: Expense | null;
  onClose: () => void;
  submit: Submit;
}) {
  const { addExpense, updateExpense } = useStore();
  const { user } = useIdentity();
  const [form, setForm] = useState<FormState>(() =>
    expense
      ? {
          date: expense.date,
          category: expense.category,
          description: expense.description,
          amount: String(expense.amount),
          paidBy: expense.paidBy,
          refundStatus: expense.refundStatus,
          // Pre-filled with today because the common case is "I just paid this".
          // For an expense from an earlier month that default is likely wrong,
          // which is what the divergence note under the field is for.
          payoutDate: expense.amount - expense.settledAmount > 0 ? today() : "",
        }
      : {
          date: today(),
          category: "utility",
          description: "",
          amount: "",
          // The 5-person roster, not the browser's identity picker — the two
          // lists are different people, so this is never pre-filled from it.
          paidBy: "",
          // The normal case: paid directly, nobody is owed anything back.
          refundStatus: "refunded",
          // A new expense has no row to attach a payout to yet, so the date is
          // recorded from the worklist once it exists.
          payoutDate: "",
        },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const outstanding =
    expense ? Math.round((expense.amount - expense.settledAmount) * 100) / 100 : 0;
  const showPayout = Boolean(expense) && outstanding > 0;
  /**
   * The dangerous default: an expense from an earlier month stamped with
   * today's date files the money in the wrong period, and reconciliation cannot
   * detect it because a wrong date reconciles perfectly against itself. Same
   * month is the ordinary case and stays silent — friction there is the enemy.
   */
  const payoutDiverges =
    showPayout &&
    form.payoutDate !== "" &&
    form.payoutDate.slice(0, 7) !== (expense?.date ?? "").slice(0, 7);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.date) next.date = "Date is required.";
    if (!form.description.trim()) next.description = "Description is required.";
    if (form.amount === "" || Number(form.amount) <= 0)
      next.amount = "Enter an amount greater than zero.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload = {
      date: form.date,
      category: form.category,
      description: form.description.trim(),
      amount: Number(form.amount),
      paidBy: form.paidBy.trim(),
      receiptUrl: expense?.receiptUrl ?? "",
      createdBy: expense?.createdBy ?? user?.name ?? "Unknown",
      refundStatus: form.refundStatus,
    };

    setSubmitError(null);
    await submit.run(async () => {
      try {
        if (expense) await updateExpense(expense.id, payload);
        else await addExpense(payload);

        // A date on an existing expense means "this much left the bank that
        // day". Recorded after the expense save so a settlement always has a
        // real parent row, and only for the amount still outstanding — a partly
        // paid expense must not record its full value twice.
        if (expense && form.payoutDate) {
          const outstanding = Math.round((expense.amount - expense.settledAmount) * 100) / 100;
          if (outstanding > 0) {
            await createExpenseSettlement({
              expenseId: expense.id,
              amount: outstanding,
              paidDate: form.payoutDate,
              settlementType:
                form.refundStatus === "owed" ? "owner_reimbursement" : "direct_vendor_payment",
              reimbursedTo: form.refundStatus === "owed" ? form.paidBy.trim() : "",
              reference: "",
              notes: "",
              createdBy: user?.name ?? "Unknown",
            });
          }
        }
        onClose();
      } catch {
        setSubmitError("Couldn't save this expense. Please try again.");
      }
    });
  }

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

        <Field
          label="Category"
          required
          hint={
            form.category === "cleaning"
              ? "Paid cleanings are added automatically — mark the cleaning as paid on the Cleaning page instead of entering it twice."
              : undefined
          }
        >
          {(id) => (
            <Select
              id={id}
              value={form.category}
              onChange={(e) =>
                set("category", e.target.value as ExpenseCategory)
              }
            >
              {EXPENSE_CATEGORIES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Description"
          required
          error={errors.description}
          className="sm:col-span-2"
        >
          {(id) => (
            <Textarea
              id={id}
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. Meralco electricity bill"
              autoFocus
            />
          )}
        </Field>

        <Field label="Amount" required error={errors.amount}>
          {(id) => (
            <CurrencyInput
              id={id}
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="0.00"
            />
          )}
        </Field>

        <Field label="Paid by">
          {(id) => (
            <Select
              id={id}
              value={form.paidBy}
              onChange={(e) => set("paidBy", e.target.value)}
            >
              <option value="">Select who paid</option>
              {/* A record from before this fixed roster keeps showing its
                  original name, instead of silently losing it. */}
              {form.paidBy && !PAID_BY.some((p) => p.value === form.paidBy) ? (
                <option value={form.paidBy}>{form.paidBy}</option>
              ) : null}
              {PAID_BY.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {showPayout ? (
          <Field
            label="Payout date"
            hint={
              outstanding < (expense?.amount ?? 0)
                ? `${outstanding.toFixed(2)} of this is still unrecorded.`
                : "When this left the homestay account."
            }
          >
            {(id) => (
              <Input
                id={id}
                type="date"
                value={form.payoutDate}
                onChange={(e) => set("payoutDate", e.target.value)}
              />
            )}
          </Field>
        ) : null}

        <Field
          label="Refund status"
          hint="Has the person above been paid back for fronting this?"
        >
          {(id) => (
            <Select
              id={id}
              value={form.refundStatus}
              onChange={(e) => set("refundStatus", e.target.value as ExpenseRefundStatus)}
            >
              {EXPENSE_REFUND_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      {payoutDiverges ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          This expense is dated {expense?.date}, but the payout date is {form.payoutDate}.
          Saving records the money as leaving the bank in{" "}
          {form.payoutDate.slice(0, 7) === today().slice(0, 7) ? "this" : "that"} month — which
          is what reconciliation will count. If you paid it earlier, change the date.
        </p>
      ) : null}

      {submitError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {submitError}
        </p>
      ) : null}

      <p className="text-xs text-slate-500">
        Receipt uploads are planned for a later version — note the reference in
        the description for now.
      </p>
    </form>
  );
}
