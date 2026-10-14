"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CurrencyInput, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { today } from "@/lib/dates";
import { useIdentity } from "@/lib/identity";
import { createAdjustment } from "@/lib/data/reconciliation-matches";
import { useSubmit } from "@/lib/use-submit";
import {
  NATURAL_DIRECTION,
  type AdjustmentCategoryValue,
} from "@/lib/reconciliation-match-rules";

const CATEGORIES: { value: AdjustmentCategoryValue; label: string }[] = [
  { value: "BANK_FEE", label: "Bank fee" },
  { value: "BANK_INTEREST", label: "Bank interest" },
  { value: "CHARGEBACK", label: "Chargeback" },
  { value: "OWNER_CONTRIBUTION", label: "Owner contribution" },
  { value: "OWNER_WITHDRAWAL", label: "Owner withdrawal" },
  { value: "TRANSFER_CORRECTION", label: "Transfer correction" },
  { value: "DUPLICATE_CORRECTION", label: "Duplicate correction" },
  { value: "OTHER", label: "Other" },
];

type FormState = {
  category: AdjustmentCategoryValue;
  amount: string;
  effectiveDate: string;
  bankPostedDate: string;
  description: string;
  notes: string;
};

const FORM_ID = "adjustment-form";

/**
 * "Nothing on the bank matches anything I recorded" (§7.12).
 *
 * Opens a form rather than acting on the typed amount — creating a financial
 * record the instant someone finishes typing is how phantom entries appear.
 * The copy says plainly that this lands in the month's ledger, so nobody
 * reaches for it lightly.
 */
export function AdjustmentForm({
  open,
  onClose,
  onSaved,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  /** Pre-fills the posting date from the panel's date field. */
  defaultDate: string;
}) {
  const submit = useSubmit();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record an adjustment"
      description="For a bank movement that isn't a booking receipt or an expense payout."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={submit.saving}>
            {submit.saving ? "Saving…" : "Save adjustment"}
          </Button>
        </>
      }
    >
      <AdjustmentFields
        key={defaultDate}
        defaultDate={defaultDate}
        onSaved={onSaved}
        submit={submit}
      />
    </Modal>
  );
}

function AdjustmentFields({
  defaultDate,
  onSaved,
  submit,
}: {
  defaultDate: string;
  onSaved: () => Promise<void>;
  submit: ReturnType<typeof useSubmit>;
}) {
  const { user } = useIdentity();
  const [form, setForm] = useState<FormState>({
    category: "BANK_FEE",
    amount: "",
    effectiveDate: defaultDate,
    bankPostedDate: defaultDate,
    description: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Partial<Record<keyof FormState, string>> = {};
    if (form.amount === "" || Number(form.amount) <= 0)
      next.amount = "Enter an amount greater than zero.";
    if (!form.description.trim()) next.description = "Give this a short description.";
    if (!form.bankPostedDate) next.bankPostedDate = "Posting date is required.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitError(null);
    await submit.run(async () => {
      try {
        await createAdjustment({
          direction: NATURAL_DIRECTION[form.category],
          category: form.category,
          amount: Number(form.amount),
          effectiveDate: form.effectiveDate || form.bankPostedDate,
          bankPostedDate: form.bankPostedDate,
          description: form.description.trim(),
          notes: form.notes.trim(),
          createdBy: user?.name ?? "Unknown",
        });
        await onSaved();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Couldn't save this adjustment.");
      }
    });
  }

  const inflow = NATURAL_DIRECTION[form.category] === "INFLOW";

  return (
    <form id={FORM_ID} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What is it?" required>
          {(id) => (
            <Select
              id={id}
              value={form.category}
              onChange={(e) => set("category", e.target.value as AdjustmentCategoryValue)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

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

        <Field
          label="Bank posting date"
          required
          error={errors.bankPostedDate}
          hint="Decides which month this lands in."
        >
          {(id) => (
            <Input
              id={id}
              type="date"
              value={form.bankPostedDate}
              onChange={(e) => set("bankPostedDate", e.target.value)}
            />
          )}
        </Field>

        <Field label="Relates to" hint="Usually the same day. Leave it if unsure.">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={form.effectiveDate}
              onChange={(e) => set("effectiveDate", e.target.value)}
            />
          )}
        </Field>

        <Field
          label="Description"
          required
          error={errors.description}
          className="sm:col-span-2"
        >
          {(id) => (
            <Input
              id={id}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. Monthly account fee"
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

      <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        This will be counted as{" "}
        <span className="font-medium">{inflow ? "money in" : "money out"}</span> for{" "}
        {form.bankPostedDate || "this month"} and will appear in the month&apos;s report.
        It explains the bank movement — it won&apos;t create a booking or an
        expense.
      </p>

      {submitError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {submitError}
        </p>
      ) : null}

      <p className="text-xs text-slate-500">Today is {today()}.</p>
    </form>
  );
}