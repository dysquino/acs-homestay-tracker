"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VerifyStage } from "@/components/reconciliation/verify-stage";
import {
  finalizePeriod,
  getAudit,
  reopenPeriod,
  type AuditView,
} from "@/lib/data/reconciliation-audit";
import {
  getPeriod,
  getPreviousFinalizedEndingBalance,
  updateStatementSetup,
} from "@/lib/data/reconciliation-periods";
import { cn } from "@/lib/cn";
import { formatCurrency, formatMonth } from "@/lib/format";
import { useIdentity } from "@/lib/identity";

/**
 * The Monthly Audit wizard (§8.1): statement setup, review, verify, finalize,
 * and the completed report.
 *
 * Five steps rather than one screen because the three things being checked are
 * genuinely different kinds of work: reading figures off a statement, matching
 * them to records, and then deciding whether the result is an audit. Fusing
 * them means the owner is re-reading a bank statement while trying to decide
 * whether a number they haven't verified yet is safe to seal.
 *
 * The review step is deliberately a step rather than a duplicate of the
 * workspace: the workspace is where matches are made, and the wizard points at
 * it rather than owning a second matching surface that could drift.
 */

const STEPS = [
  { id: "statement", label: "Statement" },
  { id: "review", label: "Review" },
  { id: "verify", label: "Verify" },
  { id: "finalize", label: "Finalize" },
  { id: "done", label: "Report" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function AuditWizard({
  month,
  onClose,
  onLeaveReview,
}: {
  month: string;
  onClose: () => void;
  /** Hands the matching surface back to the workspace. */
  onLeaveReview: () => void;
}) {
  const [step, setStep] = useState<StepId>("statement");
  const [audit, setAudit] = useState<AuditView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopening, setReopening] = useState(false);
  const { user } = useIdentity();

  const status = audit?.status ?? "DRAFT";
  const sealed = status === "FINALIZED";

  useEffect(() => {
    // The `live` guard stops a slow load for a previous month landing after a
    // faster one for the month the owner has since stepped into.
    let live = true;
    void (async () => {
      try {
        const rows = await getAudit(month);
        if (live) {
          setAudit(rows);
          setError(null);
        }
      } catch {
        if (live) setError("Couldn't load this month's audit.");
      }
    })();
    return () => {
      live = false;
    };
  }, [month]);

  /**
   * A sealed month shows its report whatever step was last open (§8.10), so this
   * is derived rather than pushed into state by an effect — an effect that
   * overwrites a step the owner chose is how someone lands on a draft that no
   * longer exists.
   */
  const view: StepId = sealed ? "done" : step;

  async function load() {
    const rows = await getAudit(month);
    setAudit(rows);
  }

  async function finalize() {
    setBusy(true);
    setError(null);
    try {
      await finalizePeriod(month, { acknowledgeOutstanding: true }, user?.name ?? "Unknown");
      setConfirmingFinalize(false);
      await load();
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't finalize this month.");
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    setError(null);
    try {
      await reopenPeriod(month, reopenReason, user?.name ?? "Unknown");
      setReopenReason("");
      setReopening(false);
      await load();
      setStep("verify");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reopen this month.");
    } finally {
      setBusy(false);
    }
  }

  const index = STEPS.findIndex((s) => s.id === view);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-50">
      <div className="mx-auto min-h-full w-full max-w-6xl px-4 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="-ml-1 rounded-md px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            ← Back to workspace
          </button>
          <StatusPill status={status} />
        </div>

        <h1 className="text-xl font-semibold text-slate-900">
          Monthly Audit · {formatMonth(`${month}-01`)}
        </h1>

        <ol className="mb-5 mt-3 flex gap-1 overflow-x-auto" aria-label="Audit steps">
          {STEPS.map((s, i) => (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setStep(s.id)}
                aria-current={view === s.id ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors pointer-coarse:py-2.5",
                  view === s.id
                    ? "bg-brand-700 text-white"
                    : i < index
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                      : "bg-white text-slate-500 ring-1 ring-inset ring-slate-200",
                )}
              >
                <span className={cn("tabular-nums", view === s.id ? "text-brand-100" : "text-slate-400")}>
                  {i + 1}
                </span>
                {s.label}
              </button>
            </li>
          ))}
        </ol>

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {audit === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : view === "statement" ? (
          <StatementStep month={month} onSaved={load} />
        ) : view === "review" ? (
          <ReviewStep month={month} onLeave={onLeaveReview} onContinue={() => setStep("verify")} />
        ) : view === "verify" ? (
          <VerifyStage
            totals={audit.totals}
            ledger={audit.ledger}
            outstanding={audit.outstanding}
            blocker={audit.blocker}
            readOnly={sealed}
            status={audit.status}
            busy={busy}
            onFinalize={() => setStep("finalize")}
            onReopen={() => setReopening(true)}
          />
        ) : view === "finalize" ? (
          <FinalizeStep
            audit={audit}
            confirming={confirmingFinalize}
            onConfirm={() => setConfirmingFinalize(true)}
            onFinalize={finalize}
            onBack={() => setStep("verify")}
            busy={busy}
          />
        ) : (
          <ReportStep audit={audit} onReopen={() => setReopening(true)} />
        )}

        {reopening ? (
          <ReopenDialog
            month={month}
            reason={reopenReason}
            onReason={setReopenReason}
            onCancel={() => setReopening(false)}
            onConfirm={reopen}
            busy={busy}
          />
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: "DRAFT" | "FINALIZED" | "REOPENED" }) {
  const label = status === "FINALIZED" ? "Finalized" : status === "REOPENED" ? "Reopened" : "Draft";
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium",
        status === "FINALIZED"
          ? "bg-emerald-100 text-emerald-800"
          : status === "REOPENED"
            ? "bg-amber-100 text-amber-800"
            : "bg-slate-100 text-slate-600",
      )}
    >
      {label}
    </span>
  );
}

/**
 * Statement setup (§8.3).
 *
 * Suggests the previous finalized month's closing balance, because a statement
 * opening figure is almost always the prior closing one — but leaves it
 * editable, since the two legitimately differ when a transfer lands between
 * accounts, and a locked-in suggestion would silently bake in the wrong figure.
 */
function StatementStep({ month, onSaved }: { month: string; onSaved: () => Promise<void> }) {
  const [period, setPeriod] = useState<Awaited<ReturnType<typeof getPeriod>>>(null);
  const [suggestion, setSuggestion] = useState<{ month: string; endingBalance: number } | null>(null);
  const [form, setForm] = useState({
    startingBalance: "",
    endingBalance: "",
    statementClosingDate: "",
    statementReference: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useIdentity();

  useEffect(() => {
    void (async () => {
      const [p, prev] = await Promise.all([getPeriod(month), getPreviousFinalizedEndingBalance(month)]);
      setPeriod(p);
      setSuggestion(prev);
      setForm({
        startingBalance: p ? String(p.startingBalance) : "",
        endingBalance: p ? String(p.endingBalance) : "",
        statementClosingDate: p?.statementClosingDate ?? "",
        statementReference: p?.statementReference ?? "",
        notes: p?.notes ?? "",
      });
    })();
  }, [month]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateStatementSetup(
        {
          month,
          startingBalance: form.startingBalance === "" ? 0 : Number(form.startingBalance),
          endingBalance: form.endingBalance === "" ? 0 : Number(form.endingBalance),
          statementClosingDate: form.statementClosingDate || null,
          statementReference: form.statementReference || null,
          notes: form.notes,
        },
        user?.name ?? "Unknown",
      );
      setSaved(true);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the statement.");
    } finally {
      setBusy(false);
    }
  }

  const drift = Boolean(
    suggestion && form.startingBalance !== "" && Number(form.startingBalance) !== suggestion.endingBalance,
  );

  return (
    <Card className="max-w-2xl p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">What the statement says</h2>
      <p className="mt-1 text-sm text-slate-600">
        Read these off the bank statement for {formatMonth(`${month}-01`)}. They&apos;re what
        everything else is checked against.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Statement opening balance" htmlFor="starting">
          <input
            id="starting"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={form.startingBalance}
            onChange={(e) => setForm({ ...form, startingBalance: e.target.value })}
            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
          />
        </Field>
        <Field label="Statement closing balance" htmlFor="ending">
          <input
            id="ending"
            type="number"
            step="0.01"
            inputMode="decimal"
            value={form.endingBalance}
            onChange={(e) => setForm({ ...form, endingBalance: e.target.value })}
            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
          />
        </Field>
        <Field label="Statement closing date" htmlFor="closing">
          <input
            id="closing"
            type="date"
            value={form.statementClosingDate}
            onChange={(e) => setForm({ ...form, statementClosingDate: e.target.value })}
            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
          />
        </Field>
        <Field label="Reference or filename" htmlFor="reference">
          <input
            id="reference"
            value={form.statementReference}
            onChange={(e) => setForm({ ...form, statementReference: e.target.value })}
            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
          />
        </Field>
      </div>

      {suggestion ? (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          {drift ? (
            <>
              <p className="font-medium text-amber-800">
                {formatMonth(`${suggestion.month}-01`)} closed at{" "}
                {formatCurrency(suggestion.endingBalance)}, but you&apos;ve entered{" "}
                {formatCurrency(Number(form.startingBalance || 0))} as the opening balance.
              </p>
              <p className="mt-1">
                That&apos;s fine if money moved in between — just worth knowing it&apos;s not a
                clean carry-over.
              </p>
            </>
          ) : (
            <p>Opening balance matches {formatMonth(`${suggestion.month}-01`)}&apos;s closing balance.</p>
          )}
          <button
            type="button"
            onClick={() => setForm({ ...form, startingBalance: String(suggestion.endingBalance) })}
            className="mt-1.5 font-medium underline underline-offset-2"
          >
            Use {formatCurrency(suggestion.endingBalance)}
          </button>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          No earlier month has been finalized yet, so there&apos;s nothing to carry forward.
        </p>
      )}

      <div className="mt-4">
        <Field label="Notes" htmlFor="notes">
          <textarea
            id="notes"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
          />
        </Field>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save statement"}
        </Button>
        {saved ? <span className="text-xs text-emerald-700">Saved.</span> : null}
        {period ? (
          <span className="text-xs text-slate-500">Draft v{period.version}</span>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Review — a pointer, not a second matching surface.
 *
 * Building matching controls into the wizard as well as the workspace would give
 * two implementations of the same write that could disagree about validation.
 * The workspace already has it, with the pools, the filters and the keypad, so
 * the step explains what is left and hands over.
 */
function ReviewStep({
  month,
  onLeave,
  onContinue,
}: {
  month: string;
  onLeave: () => void;
  onContinue: () => void;
}) {
  const [audit, setAudit] = useState<AuditView | null>(null);

  useEffect(() => {
    void getAudit(month).then(setAudit);
  }, [month]);

  const outstanding = audit?.outstanding.length ?? 0;

  return (
    <Card className="max-w-2xl p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">Match everything on the statement</h2>
      <p className="mt-1 text-sm text-slate-600">
        Matching happens in the workspace — the pools, the filters and the keypad are all
        there. Come back here once the statement is matched.
      </p>

      {audit ? (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="text-slate-700">
            <span className="font-medium tabular-nums">{audit.totals.matchedCount}</span>{" "}
            movement{audit.totals.matchedCount === 1 ? "" : "s"} matched in{" "}
            {formatMonth(`${month}-01`)}.
          </p>
          <p className="mt-1 text-slate-700">
            {outstanding > 0 ? (
              <>
                <span className="font-medium tabular-nums">{outstanding}</span> still outstanding.
              </>
            ) : (
              "Nothing outstanding."
            )}
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        <Button onClick={onLeave}>Go to the workspace</Button>
        <Button variant="primary" onClick={onContinue}>
          I&apos;ve matched it — continue
        </Button>
      </div>
    </Card>
  );
}

/** The last gate before sealing — states plainly what is about to happen. */
function FinalizeStep({
  audit,
  confirming,
  onConfirm,
  onFinalize,
  onBack,
  busy,
}: {
  audit: AuditView;
  confirming: boolean;
  onConfirm: () => void;
  onFinalize: () => void;
  onBack: () => void;
  busy: boolean;
}) {
  const outstanding = audit.outstanding.length;
  return (
    <Card className="max-w-2xl p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">Finalize {formatMonth(`${audit.month}-01`)}</h2>

      <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
        <li>
          Closing balance recorded as{" "}
          <span className="font-medium tabular-nums">{formatCurrency(audit.endingBalance)}</span>.
        </li>
        <li>
          <span className="font-medium tabular-nums">{audit.totals.matchedCount}</span> movement
          {audit.totals.matchedCount === 1 ? "" : "s"} recorded, including{" "}
          {audit.outstanding.length} still outstanding.
        </li>
      </ul>

      {outstanding > 0 ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          {outstanding} transaction{outstanding === 1 ? "" : "s"} will still be outstanding when
          this month is sealed. They stay in the pool and remain available to a later month, and
          the report records that they were outstanding.
        </p>
      ) : null}

      {!confirming ? (
        <div className="mt-4 flex gap-2">
          <Button onClick={onBack}>Back</Button>
          <Button variant="primary" onClick={onConfirm}>
            Finalize the month
          </Button>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm text-slate-800">
            Finalize <strong>{formatMonth(`${audit.month}-01`)}</strong>?
          </p>
          <p className="mt-1 text-xs text-slate-600">
            The month becomes read-only and a report of these exact figures is written. You can
            reopen it afterwards with a reason, and the report you sealed is kept either way.
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={onConfirm} disabled={busy}>
              Not yet
            </Button>
            <Button variant="primary" onClick={onFinalize} disabled={busy}>
              {busy ? "Finalizing…" : "Yes, finalize"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ReportStep({ audit, onReopen }: { audit: AuditView; onReopen: () => void }) {
  return (
    <div className="grid gap-5">
      <Card className="max-w-2xl p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          {formatMonth(`${audit.month}-01`)} is sealed
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Closed at {formatCurrency(audit.endingBalance)}
          {audit.finalizedBy ? `, finalized by ${audit.finalizedBy}` : ""}
          {audit.finalizedAt ? ` on ${audit.finalizedAt.slice(0, 10)}` : ""}.
        </p>
        <p className="mt-3 text-xs text-slate-600">
          This month is read-only. Reopen it if something needs correcting — you&apos;ll be asked
          for a reason, and the sealed report is kept.
        </p>
        <div className="mt-3">
          <Button onClick={onReopen}>Reopen this month</Button>
        </div>
      </Card>
      <VerifyStage
        totals={audit.totals}
        ledger={audit.ledger}
        outstanding={audit.outstanding}
        blocker={audit.blocker}
        readOnly
        status={audit.status}
        busy={false}
        onFinalize={() => {}}
        onReopen={onReopen}
      />
    </div>
  );
}

function ReopenDialog({
  month,
  reason,
  onReason,
  onCancel,
  onConfirm,
  busy,
}: {
  month: string;
  reason: string;
  onReason: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <Card className="w-full max-w-md p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Reopen {formatMonth(`${month}-01`)}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          The month becomes editable again and needs re-finalizing. The report you sealed is
          kept.
        </p>
        <label htmlFor="reopen-reason" className="mt-3 block text-xs font-medium text-slate-700">
          Why are you reopening it?
        </label>
        <textarea
          id="reopen-reason"
          rows={3}
          value={reason}
          onChange={(e) => onReason(e.target.value)}
          placeholder="e.g. Found a cleaning payment dated in the wrong month"
          className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
        />
        <p className="mt-1 text-xs text-slate-500">Required — this goes into the audit trail.</p>
        <div className="mt-3 flex gap-2">
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy || !reason.trim()}>
            {busy ? "Reopening…" : "Reopen"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}