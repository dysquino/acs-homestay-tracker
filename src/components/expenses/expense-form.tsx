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
import { knownPayers } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
} from "@/lib/types";

type FormState = {
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  paidBy: string;
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? "Edit expense" : "Add expense"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary">
            {expense ? "Save changes" : "Add expense"}
          </Button>
        </>
      }
    >
      <ExpenseFields
        key={expense?.id ?? "new"}
        expense={expense}
        onClose={onClose}
      />
    </Modal>
  );
}

function ExpenseFields({
  expense,
  onClose,
}: {
  expense: Expense | null;
  onClose: () => void;
}) {
  const { expenses, addExpense, updateExpense } = useStore();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(() =>
    expense
      ? {
          date: expense.date,
          category: expense.category,
          description: expense.description,
          amount: String(expense.amount),
          paidBy: expense.paidBy,
        }
      : {
          date: today(),
          category: "utility",
          description: "",
          amount: "",
          paidBy: user?.name ?? "",
        },
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>(
    {},
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function onSubmit(e: React.FormEvent) {
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
    };

    if (expense) updateExpense(expense.id, payload);
    else addExpense(payload);
    onClose();
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

        <Field label="Category" required>
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

        <Field label="Paid by" hint="Which owner or manager paid">
          {(id) => (
            <>
              <Input
                id={id}
                list="expense-payers"
                value={form.paidBy}
                onChange={(e) => set("paidBy", e.target.value)}
                placeholder="e.g. Owner"
              />
              <datalist id="expense-payers">
                {knownPayers(expenses).map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </>
          )}
        </Field>
      </div>

      <p className="text-xs text-slate-500">
        Receipt uploads are planned for a later version — note the reference in
        the description for now.
      </p>
    </form>
  );
}
