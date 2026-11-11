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
import { today } from "@/lib/dates";
import { expenseOutstandingAmount } from "@/lib/expense-payout";
import { formatCurrency } from "@/lib/format";
import { useStore } from "@/lib/store";
import { useSubmit, type Submit } from "@/lib/use-submit";
import { payoutDateDiverges, payoutMonthLabel } from "@/lib/payout-date";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_REFUND_STATUSES,
  PAID_BY_OPTIONS,
  isBankPayer,
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
          // Opt-in: pre-filling this would silently pay the whole remaining
          // balance when someone edits the description of an installment plan.
          payoutDate: "",
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

  const outstanding = expense
    ? expenseOutstandingAmount(expense.amount, expense.settledAmount)
    : 0;
  /**
   * The bank account paid it, so nobody fronted it and nobody is owed back.
   * Derived rather than stored, so switching the payer back to a person
   * restores that person's own refund status instead of leaving it clobbered.
   */
  const paidByIsBank = isBankPayer(form.paidBy);
  /**
   * Whether the payout date is still the one the app put there for the owner,
   * rather than one they typed. The app's guess follows the expense's own date
   * until the owner overrides it — after which it must not be dragged along
   * behind a later date change.
   */
  const payoutFollowsExpense = form.payoutDate === form.date;
  /**
   * When the payout date field is offered.
   *
   * An expense someone fronted shows it only once there is a balance to pay
   * out. An expense the bank paid always shows it: the money left the account,
   * and the date it left on is the one thing reconciliation still needs — so
   * it gets asked for while the expense is being written, rather than chased
   * afterwards from the worklist.
   */
  const showPayout =
    (Boolean(expense) && outstanding > 0) || (!expense && paidByIsBank);
  /**
   * Whether whoever fronted the cost is still waiting to be paid back.
   *
   * Kept apart from the status below because the two answer different things:
   * this one decides what KIND of payout a date records (money going back to
   * whoever fronted it is a reimbursement, anything else paid a vendor), while
   * the status below says whether anyone is still owed.
   */
  const owesSomeone = !paidByIsBank && form.refundStatus === "owed";
  /**
   * A payout date means the money left the account — and for an expense someone
   * fronted, that means they were paid back. So entering one settles the claim
   * and the status follows the money, instead of the form recording a
   * reimbursement and then claiming the money is still owed.
   */
  const payoutSettles = form.payoutDate !== "";
  const refundStatus: ExpenseRefundStatus =
    paidByIsBank || payoutSettles ? "refunded" : form.refundStatus;
  /**
   * A payout date from the wrong month files the money in the wrong period, and
   * reconciliation cannot detect it because that incorrect date still agrees
   * with itself. An empty date is intentionally silent and records no payout.
   */
  const payoutDiverges =
    showPayout && payoutDateDiverges(form.payoutDate, expense?.date ?? form.date);

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
      refundStatus,
    };

    setSubmitError(null);
    await submit.run(async () => {
      try {
        // The payout rides along with the expense save rather than following
        // it, so there's no window where the expense reads as paid out but
        // carries no settlement — a state the month's outflow pool can't see.
        // The server settles only what's still outstanding.
        const payout = form.payoutDate
          ? {
              paidDate: form.payoutDate,
              settlementType: owesSomeone
                ? ("owner_reimbursement" as const)
                : ("direct_vendor_payment" as const),
              reimbursedTo: owesSomeone ? form.paidBy.trim() : "",
            }
          : undefined;

        if (!expense) {
          await addExpense(payload, payout);
        } else {
          await updateExpense(expense.id, payload, payout);
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
              onChange={(e) => {
                const next = e.target.value;
                // While the payout date is still the app's guess, it follows the
                // expense's own date. Once the owner has typed one of their own,
                // it stays theirs.
                set("date", next);
                if (payoutFollowsExpense) set("payoutDate", next);
              }}
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

        <Field
          label="Total expense amount"
          required
          error={errors.amount}
          hint="For installments, enter the full purchase total."
        >
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
              onChange={(e) => {
                const next = e.target.value;
                set("paidBy", next);
                // A bank-paid expense's money has already left the account, so
                // it needs a date; one someone fronted may not have left yet, so
                // it doesn't get one. Switching between the two carries the
                // date across and takes it back again.
                if (isBankPayer(next) !== paidByIsBank) {
                  set("payoutDate", isBankPayer(next) ? form.date : "");
                }
              }}
            >
              <option value="">Select who paid</option>
              {/* A record from before this fixed roster keeps showing its
                  original name, instead of silently losing it. */}
              {form.paidBy && !PAID_BY_OPTIONS.some((p) => p.value === form.paidBy) ? (
                <option value={form.paidBy}>{form.paidBy}</option>
              ) : null}
              {PAID_BY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {showPayout ? (
          <Field
            label={paidByIsBank ? "Payout date" : "Full-balance payout date (optional)"}
            hint={
              paidByIsBank
                ? "When the money left the homestay account. Pre-filled with the date above — change it if the money left in a different month."
                : outstanding < (expense?.amount ?? 0)
                  ? `${formatCurrency(outstanding)} remains. Leave blank to only save the expense changes.`
                  : "Choose a date only if the full amount left the homestay account."
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
          hint={
            paidByIsBank
              ? "Paid straight from the bank account — nobody fronted this, so nobody is owed back."
              : payoutSettles
                ? "A payout date means the money was paid back, so nobody is owed any more."
                : "Has the person above been paid back for fronting this?"
          }
        >
          {(id) => (
            <Select
              id={id}
              value={refundStatus}
              disabled={paidByIsBank || payoutSettles}
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
          {payoutMonthLabel(form.payoutDate, today())} month — which
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
