"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CurrencyInput, Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import {
  createExpenseSettlement,
  listExpensesAwaitingPayout,
  type ExpenseAwaitingPayout,
} from "@/lib/data/expense-settlements";
import { today } from "@/lib/dates";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { useIdentity } from "@/lib/identity";
import { useSubmit } from "@/lib/use-submit";
import { PAID_BY } from "@/lib/types";

/**
 * Expenses still missing a payout date.
 *
 * This is the answer to the question a balance difference asks and nothing else
 * does: "these amounts left your bank and nothing on screen says so". An expense
 * alone can't reconcile — §4.5 keeps the cost and the bank movement apart — so
 * without a payout date the money is simply invisible to the audit and the month
 * is out by that much with no explanation.
 *
 * Both `refundStatus` values are listed on purpose. REFUNDED means nobody is
 * owed a reimbursement, not that the money is still sitting there; a utility
 * bill paid straight from the homestay account is REFUNDED and definitely left
 * the bank. Filtering this list to OWED would hide exactly the ones most likely
 * to have been paid.
 */
export function PayoutWorklist({ onRecorded }: { onRecorded: () => void }) {
  const { user } = useIdentity();
  const [items, setItems] = useState<ExpenseAwaitingPayout[] | null>(null);
  const [open, setOpen] = useState<ExpenseAwaitingPayout | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await listExpensesAwaitingPayout());
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      const rows = await listExpensesAwaitingPayout().catch(() => []);
      if (live) setItems(rows);
    })();
    return () => {
      live = false;
    };
  }, []);

  if (items === null) return null;

  const owedToSomeone = items.filter((i) => i.refundStatus === "owed").length;
  // Every unsettled expense is listed, because every one of them is a real bank
  // movement with no date. But 80+ rows is a wall rather than a worklist, so
  // the newest are shown and the rest are one click away — the owner works
  // top-down and the tail is mostly history that pre-dates reconciliation.
  const VISIBLE = 20;
  const visible = showAll ? items : items.slice(0, VISIBLE);
  const hidden = items.length - visible.length;

  return (
    <>
      <Card className="overflow-hidden">
        <header className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Expenses waiting for a payout date
            {items.length > 0 ? (
              <span className="ml-2 text-xs font-normal text-slate-500">{items.length}</span>
            ) : null}
          </h2>
          <p className="text-xs text-slate-500">
            Money these expenses represent can&apos;t be reconciled until you record when it
            left the account.
          </p>
        </header>

        {items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 sm:px-5">
            Every expense has a payout date recorded. Nothing outstanding here.
          </p>
        ) : (
          <>
            {owedToSomeone > 0 ? (
              <p className="border-b border-slate-100 bg-amber-50 px-4 py-2 text-xs text-amber-800 sm:px-5">
                {owedToSomeone} marked as owed to whoever fronted the cost — recording the
                reimbursement also tells reconciliation when the money left.
              </p>
            ) : null}
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {visible.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{item.description}</p>
                    <p className="text-xs text-slate-500">
                      {formatShortDate(item.date)}
                      {item.paidBy ? ` · ${item.paidBy}` : ""}
                      {item.fromCleaning ? " · cleaning" : ""}
                      {item.settled > 0 ? ` · ${formatCurrency(item.settled)} already recorded` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-medium tabular-nums text-slate-900">
                      {formatCurrency(item.outstanding)}
                    </span>
                    <Button size="sm" onClick={() => setOpen(item)}>
                      Record
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {hidden > 0 ? (
              <div className="border-t border-slate-100 px-4 py-2 text-xs sm:px-5">
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="font-medium text-brand-700 hover:underline"
                >
                  Show {hidden} older expense{hidden === 1 ? "" : "s"}
                </button>
              </div>
            ) : showAll && items.length > VISIBLE ? (
              <div className="border-t border-slate-100 px-4 py-2 text-xs sm:px-5">
                <button
                  type="button"
                  onClick={() => setShowAll(false)}
                  className="font-medium text-brand-700 hover:underline"
                >
                  Show only the newest {VISIBLE}
                </button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      {open ? (
        <QuickPayoutForm
          item={open}
          actor={user?.name ?? "Unknown"}
          onClose={() => setOpen(null)}
          onSaved={async () => {
            setOpen(null);
            await load();
            onRecorded();
          }}
        />
      ) : null}
    </>
  );
}

const FORM_ID = "payout-worklist-form";

/**
 * A deliberately short form — this is a worklist, not a detail sheet.
 *
 * The date defaults to today because most reimbursements are recorded the day
 * they're made, and the amount defaults to whatever is still outstanding rather
 * than the expense total, so a partly-paid expense doesn't double-count.
 */
function QuickPayoutForm({
  item,
  actor,
  onClose,
  onSaved,
}: {
  item: ExpenseAwaitingPayout;
  actor: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const submit = useSubmit();
  const [amount, setAmount] = useState(String(item.outstanding));
  const [paidDate, setPaidDate] = useState(today());
  const [reimbursedTo, setReimbursedTo] = useState(
    item.refundStatus === "owed" ? item.paidBy : "",
  );
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isReimbursement = item.refundStatus === "owed";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amount === "" || Number(amount) <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!paidDate) {
      setError("Paid date is required.");
      return;
    }
    if (isReimbursement && !reimbursedTo.trim()) {
      setError("Say who was reimbursed.");
      return;
    }
    setError(null);

    await submit.run(async () => {
      try {
        await createExpenseSettlement({
          expenseId: item.id,
          amount: Number(amount),
          paidDate,
          settlementType: isReimbursement ? "owner_reimbursement" : "direct_vendor_payment",
          reimbursedTo: isReimbursement ? reimbursedTo.trim() : "",
          reference: reference.trim(),
          notes: "",
          createdBy: actor,
        });
        await onSaved();
      } catch {
        setError("Couldn't save this payout. Please try again.");
      }
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record a payout"
      description={item.description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={submit.saving}>
            {submit.saving ? "Saving…" : "Save payout"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" required>
          {(id) => (
            <CurrencyInput id={id} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          )}
        </Field>

        <Field label="Paid date" required hint="The day it left the account.">
          {(id) => (
            <Input id={id} type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
          )}
        </Field>

        {isReimbursement ? (
          <Field label="Reimbursed to" required>
            {(id) => (
              <Select
                id={id}
                value={reimbursedTo}
                onChange={(e) => setReimbursedTo(e.target.value)}
              >
                <option value="">Select who was paid</option>
                {reimbursedTo && !PAID_BY.some((p) => p.value === reimbursedTo) ? (
                  <option value={reimbursedTo}>{reimbursedTo}</option>
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
            <Input id={id} value={reference} onChange={(e) => setReference(e.target.value)} />
          )}
        </Field>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 sm:col-span-2">
            {error}
          </p>
        ) : null}

        <p className="text-xs text-slate-500 sm:col-span-2">
          {formatCurrency(item.outstanding)} of {formatCurrency(item.amount)} still has no payout
          recorded. This will appear in your outflows for the month it was paid.
        </p>
      </form>
    </Modal>
  );
}