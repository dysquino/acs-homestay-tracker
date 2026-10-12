"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { getPublicPaymentConfig } from "@/lib/data/payment-config";

import type { PaymentConfigData } from "@/lib/data/payment-config";

const FALLBACK_QR_PATH = "/qr-code.JPG";

/**
 * The bank details + InstaPay QR shown above the booking form on /book.
 *
 * QR source priority:
 * 1. The override bytes set in PaymentConfig (the owner replaced the default).
 * 2. The static asset at /public/qr-code.JPG (the built-in default).
 * 3. Hidden, with an amber note that the QR isn't available.
 *
 * The 1×1 probe is only used for the static fallback case — when an
 * override is uploaded, we already know the QR exists (it's in the row).
 */
export function PaymentInfo() {
  const [config, setConfig] = useState<PaymentConfigData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fallbackQrOk, setFallbackQrOk] = useState(false);

  useEffect(() => {
    let alive = true;
    getPublicPaymentConfig()
      .then((c) => {
        if (alive) setConfig(c);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!loaded) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-sm text-slate-500">Loading payment details…</p>
      </section>
    );
  }

  if (!config) return null;

  const hasOverride = Boolean(config.qrCodeBytes && config.qrCodeMime);
  // Only the fallback path needs a 404 probe — if there's an override, the
  // bytes are guaranteed to render (they came from the server).
  const qrSrc: string | null = hasOverride
    ? bytesToDataUrl(config.qrCodeBytes!, config.qrCodeMime!)
    : fallbackQrOk
      ? FALLBACK_QR_PATH
      : null;

  return (
    <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-semibold text-slate-900">Pay via InstaPay</h2>
      <p className="mt-1 text-xs text-slate-600">
        Scan the QR with your banking app, or copy the details and enter them manually. Then send your
        booking request — you can attach a screenshot of the payment receipt below if you&apos;ve
        already paid.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[180px_auto] sm:items-start">
        {qrSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={qrSrc}
            alt={`${config.bankName} InstaPay QR code`}
            width={180}
            height={180}
            className="h-auto w-44 self-center rounded-xl border border-slate-200 bg-white object-contain sm:self-start"
          />
        ) : null}

        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-slate-500">Bank</dt>
          <dd className="font-medium text-slate-900">{config.bankName}</dd>

          <dt className="text-slate-500">Account name</dt>
          <dd className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{config.accountName}</span>
            <CopyButton value={config.accountName} />
          </dd>

          <dt className="text-slate-500">Account number</dt>
          <dd className="flex items-center gap-2">
            <span className="font-mono font-medium text-slate-900">{config.accountNumber}</span>
            <CopyButton value={config.accountNumber} />
          </dd>
        </dl>
      </div>

      {/* Hidden 1×1 probe for the fallback QR only. Only attached when we
          actually depend on the static asset (no override). */}
      {!hasOverride ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={FALLBACK_QR_PATH}
          alt=""
          width={1}
          height={1}
          aria-hidden
          onLoad={() => setFallbackQrOk(true)}
          onError={() => setFallbackQrOk(false)}
          className="hidden"
        />
      ) : null}

      {!qrSrc ? (
        <p className="mt-3 text-xs text-amber-700">
          The QR image isn&apos;t available right now — please use the account details above.
        </p>
      ) : null}
    </section>
  );
}

/** Small copy-to-clipboard button. Falls back to selecting text on browsers
 * where the async clipboard API is blocked (e.g. plain http on an old phone). */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // No clipboard permission — fallback is to leave the value visible & selectable.
      setCopied(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={copy}
      aria-label={`Copy ${value}`}
      className="px-2 py-1 text-xs"
    >
      {copied ? <CheckIcon className="h-3.5 w-3.5 text-emerald-600" /> : <CopyIcon className="h-3.5 w-3.5" />}
      <span className="ml-1">{copied ? "Copied" : "Copy"}</span>
    </Button>
  );
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}