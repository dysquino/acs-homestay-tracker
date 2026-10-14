"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { CurrencyInput, Field, Input } from "@/components/ui/field";
import { ImageIcon, TrashIcon, UploadIcon } from "@/components/ui/icons";
import { setPaymentConfig } from "@/lib/data/payment-config";
import type { PaymentConfigData } from "@/lib/data/payment-config";
import { formatAccountNumber } from "@/lib/format";
import { useIdentity } from "@/lib/identity";
import { MAX_PAYMENT_SCREENSHOT_BYTES } from "@/lib/payment-screenshot";
import { envReconciliationOverride } from "@/lib/reconciliation-flag";
import { cn } from "@/lib/cn";

const FALLBACK_QR_PATH = "/qr-code.JPG";

/**
 * Three states for the QR:
 * - "fallback" — no QR in the DB; preview shows /public/qr-code.JPG, no
 *   actions other than "Upload a QR".
 * - "current" — has an override; preview shows it; "Replace" / "Remove".
 * - "staged" — user just picked a file that hasn't been saved yet; preview
 *     shows the picked file; "Save" persists; "Cancel" discards.
 *
 * Saving without touching the QR keeps the current one — the form sends
 * `qrCode: undefined` and the server skips the QR patch.
 */
export function PaymentSettingsForm({
  initial,
}: {
  initial: PaymentConfigData | null;
}) {
  const { user } = useIdentity();
  // When RECONCILIATION_ENABLED is set it overrides the toggle below, so say so
  // rather than letting someone change the checkbox and see nothing happen.
  const reconciliationEnvLocked = envReconciliationOverride() !== null;
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [accountName, setAccountName] = useState(initial?.accountName ?? "");
  // Stored as digits only; rendered with spaces (formatAccountNumber) so the
  // input shows "1094 2067 0200" instead of a raw digit blob.
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? "");
  const [nightlyRate, setNightlyRate] = useState<number>(initial?.nightlyRate ?? 0);
  const [cleaningFee, setCleaningFee] = useState<number>(initial?.cleaningFee ?? 0);
  const [cleaningFeeLong, setCleaningFeeLong] = useState<number>(initial?.cleaningFeeLong ?? 0);
  // Owner-tunable long-stay threshold. The server accepts 2..60; default 5
  // preserves the original behavior. We clamp client-side to keep the input
  // from drifting into invalid values as the user types.
  const [longStayThresholdNights, setLongStayThresholdNights] = useState<number>(
    initial?.longStayThresholdNights ?? 5,
  );
  // Default to the schema defaults so the very first save (which `create`s
  // the row) still works without the user touching these.
  const [idPhotoRequired, setIdPhotoRequired] = useState<boolean>(initial?.idPhotoRequired ?? true);
  const [paymentScreenshotRequired, setPaymentScreenshotRequired] = useState<boolean>(
    initial?.paymentScreenshotRequired ?? false,
  );
  const [reconciliationEnabled, setReconciliationEnabled] = useState<boolean>(
    initial?.reconciliationEnabled ?? false,
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // QR state. `staged: "" | "uploaded" | "clear"` indicates what the user
  // touched; `bytes` and `mime` hold the picked file's data.
  const [staged, setStaged] = useState<"" | "uploaded" | "clear">("");
  const [stagedBytes, setStagedBytes] = useState<Uint8Array | null>(null);
  const [stagedMime, setStagedMime] = useState<string | null>(null);
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const stagedUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (stagedUrl.current) URL.revokeObjectURL(stagedUrl.current);
    };
  }, []);

  const hasDbQr = Boolean(initial?.qrCodeBytes && initial.qrCodeMime);

  // The QR preview source — falls through the staged, current, fallback chain.
  const previewSrc =
    staged === "uploaded" && stagedPreview
      ? stagedPreview
      : hasDbQr && initial
        ? bytesToDataUrl(initial.qrCodeBytes!, initial.qrCodeMime!)
        : FALLBACK_QR_PATH;

  function pickFile(file: File | null) {
    if (!file) return;
    if (file.size > MAX_PAYMENT_SCREENSHOT_BYTES) {
      setError(`That file is larger than ${MAX_PAYMENT_SCREENSHOT_BYTES / (1024 * 1024)} MB.`);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please pick an image file (PNG, JPEG, or WebP).");
      return;
    }
    setError(null);
    file.arrayBuffer().then((buf) => {
      if (stagedUrl.current) URL.revokeObjectURL(stagedUrl.current);
      const objUrl = URL.createObjectURL(file);
      stagedUrl.current = objUrl;
      setStagedBytes(new Uint8Array(buf));
      setStagedMime(file.type);
      setStagedPreview(objUrl);
      setStaged("uploaded");
    });
  }

  function discardStaged() {
    if (stagedUrl.current) URL.revokeObjectURL(stagedUrl.current);
    stagedUrl.current = null;
    setStaged("");
    setStagedBytes(null);
    setStagedMime(null);
    setStagedPreview(null);
  }

  function clearQr() {
    setError(null);
    discardStaged();
    setStaged("clear");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    // Map the form's three-way staged state into the server's three-way
    // `qrCode` param.
    let qrCode: { bytes: Uint8Array; mime: string } | null | undefined;
    if (staged === "uploaded" && stagedBytes && stagedMime) {
      qrCode = { bytes: stagedBytes, mime: stagedMime };
    } else if (staged === "clear") {
      qrCode = null;
    } else {
      qrCode = undefined;
    }

    startTransition(async () => {
      try {
        await setPaymentConfig({
          bankName,
          accountName,
          accountNumber,
          updatedBy: user.name,
          qrCode,
          nightlyRate,
          cleaningFee,
          cleaningFeeLong,
          longStayThresholdNights,
          idPhotoRequired,
          paymentScreenshotRequired,
          reconciliationEnabled,
        });
        setSaved(true);
        // The server is now the source of truth; staged changes are baked in.
        discardStaged();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save. Please try again.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5 p-0">
      <div className="p-4 sm:p-5 space-y-4">
        <Field label="Price per night" hint="Shown on the booking page as a price breakdown.">
          {(id) => (
            <CurrencyInput
              id={id}
              min={0}
              step="0.01"
              value={nightlyRate || ""}
              onChange={(e) => setNightlyRate(e.target.value === "" ? 0 : Number(e.target.value))}
              placeholder="0"
            />
          )}
        </Field>
        <Field label="Cleaning fee (short stay)" hint="Flat fee added once per booking. Used for stays shorter than 5 nights.">
          {(id) => (
            <CurrencyInput
              id={id}
              min={0}
              step="0.01"
              value={cleaningFee || ""}
              onChange={(e) => setCleaningFee(e.target.value === "" ? 0 : Number(e.target.value))}
              placeholder="0"
            />
          )}
        </Field>
        <Field label="Cleaning fee (long stay)" hint="Used for stays of the threshold or more. Leave 0 to keep using the short-stay fee.">
          {(id) => (
            <CurrencyInput
              id={id}
              min={0}
              step="0.01"
              value={cleaningFeeLong || ""}
              onChange={(e) => setCleaningFeeLong(e.target.value === "" ? 0 : Number(e.target.value))}
              placeholder="0"
            />
          )}
        </Field>
        <Field
          label="Long-stay threshold (nights)"
          hint="Stays of this length or more use the long-stay cleaning fee. Range 2-60."
        >
          {(id) => (
            <Input
              id={id}
              type="number"
              min={2}
              max={60}
              step={1}
              value={longStayThresholdNights || ""}
              onChange={(e) => {
                const v = e.target.value === "" ? 5 : Number(e.target.value);
                if (Number.isFinite(v)) setLongStayThresholdNights(Math.max(2, Math.min(60, Math.trunc(v))));
              }}
            />
          )}
        </Field>
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
              value={formatAccountNumber(accountNumber)}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
              maxLength={50}
              required
            />
          )}
        </Field>
      </div>

      <div className="border-t border-slate-100 p-4 sm:p-5 space-y-3">
        <div className="text-xs font-medium text-slate-800">Required fields on /book</div>
        <p className="text-xs text-slate-500">
          When a field is required, the form blocks submission until the guest attaches one. The
          server stays permissive either way (old versions of the booking page keep working).
        </p>
        <label className="flex items-start gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={idPhotoRequired}
            onChange={(e) => setIdPhotoRequired(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
          />
          <span>
            <span className="font-medium text-slate-900">ID photo required</span>
            <span className="block text-xs text-slate-500">
              For seamless check-in. Uncheck to let guests submit without an ID.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={paymentScreenshotRequired}
            onChange={(e) => setPaymentScreenshotRequired(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
          />
          <span>
            <span className="font-medium text-slate-900">Payment screenshot required</span>
            <span className="block text-xs text-slate-500">
              Guests must attach an InstaPay receipt before submitting. Uncheck to make it optional.
            </span>
          </span>
        </label>
      </div>

      <div className="border-t border-slate-100 p-4 sm:p-5 space-y-3">
        <div className="text-xs font-medium text-slate-800">Reconciliation</div>
        <label className="flex items-start gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={reconciliationEnabled}
            onChange={(e) => setReconciliationEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
          />
          <span>
            <span className="font-medium text-slate-900">Enable reconciliation</span>
            <span className="block text-xs text-slate-500">
              Adds &ldquo;Payments received&rdquo; to each booking and &ldquo;Paid out&rdquo;
              to each expense, so money received and money spent can be matched
              against the bank later. Safe to switch off at any time — records
              already saved are kept.
            </span>
          </span>
        </label>
        {reconciliationEnvLocked ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            This deployment forces reconciliation{" "}
            {envReconciliationOverride() ? "on" : "off"} with the{" "}
            <code className="font-mono">RECONCILIATION_ENABLED</code> environment
            variable, so this toggle won&apos;t take effect until that&apos;s changed.
          </p>
        ) : null}
      </div>

      <div className="border-t border-slate-100 p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
          <ImageIcon className="h-3.5 w-3.5" />
          QR image
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt={hasDbQr ? "Uploaded QR" : "Default QR"}
            width={180}
            height={180}
            className="h-28 w-28 shrink-0 rounded-lg border border-slate-200 bg-white object-contain"
          />
          <div className="min-w-0 flex-1 text-xs text-slate-600">
            {staged === "uploaded" ? (
              <>
                <p className="font-medium text-slate-800">New QR staged — click Save to upload.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={discardStaged}
                  className="mt-2 px-2 py-1 text-xs"
                >
                  Discard
                </Button>
              </>
            ) : hasDbQr ? (
              <>
                <p className="font-medium text-slate-800">Custom QR uploaded.</p>
                <p className="mt-0.5">
                  The default <code>/public/qr-code.JPG</code> is not used.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <label
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100",
                    )}
                  >
                    <UploadIcon className="h-3.5 w-3.5" />
                    Replace
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                      className="sr-only"
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={clearQr}
                    className="px-2.5 py-1 text-xs text-red-700 hover:text-red-800"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    <span className="ml-1">Remove (use default)</span>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="font-medium text-slate-800">Using the default QR.</p>
                <p className="mt-0.5">
                  The <code>/public/qr-code.JPG</code> file ships with the app as a built-in default.
                  Upload a different QR to override it.
                </p>
                <label
                  className={cn(
                    "mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100",
                  )}
                >
                  <UploadIcon className="h-3.5 w-3.5" />
                  Upload a QR
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                    className="sr-only"
                  />
                </label>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 p-4 sm:p-5 space-y-3">
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
      </div>
    </form>
  );
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}