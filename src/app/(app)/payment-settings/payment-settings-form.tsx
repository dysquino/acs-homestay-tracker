"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ImageIcon } from "@/components/ui/icons";
import { setPaymentConfig } from "@/lib/data/payment-config";
import type { PaymentConfigData } from "@/lib/data/payment-config";
import { useIdentity } from "@/lib/identity";

const QR_PATH = "/qr-code.JPG";

/**
 * Edits the PaymentConfig singleton — bank name + account name + account
 * number. The QR image is NOT editable here; it's a static asset at
 * /public/qr-code.JPG. Replacing that file updates the QR on /book.
 */
export function PaymentSettingsForm({
  initial,
}: {
  initial: PaymentConfigData | null;
}) {
  const { user } = useIdentity();
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [accountName, setAccountName] = useState(initial?.accountName ?? "");
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await setPaymentConfig({
          bankName,
          accountName,
          accountNumber,
          updatedBy: user.name,
        });
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5 p-4 sm:p-5">
      <Field label="Bank name" required>
        {(id) => (
          <Input id={id} value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={100} required />
        )}
      </Field>
      <Field label="Account name" required>
        {(id) => (
          <Input
            id={id}
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            maxLength={100}
            required
          />
        )}
      </Field>
      <Field label="Account number" required>
        {(id) => (
          <Input
            id={id}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            maxLength={50}
            required
            inputMode="numeric"
          />
        )}
      </Field>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={QR_PATH}
            alt="Current InstaPay QR"
            width={180}
            height={180}
            className="h-28 w-28 shrink-0 rounded-lg border border-slate-200 bg-white object-contain"
          />
          <div className="min-w-0 text-xs text-slate-600">
            <p className="flex items-center gap-1.5 font-medium text-slate-800">
              <ImageIcon className="h-3.5 w-3.5" />
              QR image
            </p>
            <p className="mt-1">
              The QR is a static asset at <code>/public/qr-code.JPG</code> — replace it on disk and redeploy
              to update. A 404 here means the file isn&apos;t uploaded yet; the bank details above will still
              show on /book without a QR.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {saved ? (
        <p role="status" className="text-sm text-emerald-700">
          Saved — guests will see the new details on /book the next time they reload.
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}