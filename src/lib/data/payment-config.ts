"use server";

import "server-only";

import type { Decimal } from "@prisma/client/runtime/library";

import { prisma } from "@/lib/prisma";
import { validatePaymentScreenshot } from "@/lib/payment-screenshot";

import { requireSiteAccess } from "./access";

/**
 * Bank details shown on /book so guests can pay via InstaPay. One row by
 * convention (id = "singleton").
 *
 * The QR is also stored here (override uploaded from Settings). If the
 * QR is null, the public page falls back to /public/qr-code.JPG so the
 * static file works as a built-in default.
 *
 * Also holds the per-night + cleaning-fee rates so /book can show a
 * price breakdown before the guest sends a request.
 *
 * - `getPublicPaymentConfig()` — no gate, returns the row (or null when
 *   not set up). Read by the public booking page; bank details are
 *   intentionally public to guests who reach the booking link.
 * - `getPaymentConfig()` / `setPaymentConfig()` — behind the site access
 *   code (owner-only edits).
 */

export type PaymentConfigData = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrCodeMime: string | null;
  /** Bytes of the QR override, or null when falling back to /qr-code.JPG. */
  qrCodeBytes: Uint8Array | null;
  /// Per-night rate (peso). Informational — owner still sets totalPayout per
  /// booking. 0 means "no rate set yet"; /book hides the breakdown when this
  /// is 0 *and* both cleaning fees are 0.
  nightlyRate: number;
  /// Cleaning fee for short stays (< 5 nights).
  cleaningFee: number;
  /// Cleaning fee for long stays (>= 5 nights). If 0, falls back to
  /// `cleaningFee` when the stay would have used this tier.
  cleaningFeeLong: number;
  /// Nights at which a stay flips from "short" to "long" (and starts using
  /// `cleaningFeeLong` instead of `cleaningFee`). Owner-tunable; defaults
  /// to 5 to preserve the original behavior.
  longStayThresholdNights: number;
  /// Whether the ID photo is required on the public /book form. Defaults
  /// to true (preserves the original required-by-default behavior).
  idPhotoRequired: boolean;
  /// Whether the payment screenshot is required on the public /book form.
  /// Defaults to false (was always optional before this flag existed).
  paymentScreenshotRequired: boolean;
  updatedAt: string;
};

function rowToConfig(row: {
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrCodeMime: string | null;
  qrCode: Uint8Array | null;
  nightlyRate: Decimal;
  cleaningFee: Decimal;
  cleaningFeeLong: Decimal;
  longStayThresholdNights: number;
  idPhotoRequired: boolean;
  paymentScreenshotRequired: boolean;
  updatedAt: Date;
}): PaymentConfigData {
  return {
    bankName: row.bankName,
    accountName: row.accountName,
    accountNumber: row.accountNumber,
    qrCodeMime: row.qrCodeMime,
    qrCodeBytes: row.qrCode ? new Uint8Array(row.qrCode) : null,
    nightlyRate: Number(row.nightlyRate),
    cleaningFee: Number(row.cleaningFee),
    cleaningFeeLong: Number(row.cleaningFeeLong),
    longStayThresholdNights: row.longStayThresholdNights,
    idPhotoRequired: row.idPhotoRequired,
    paymentScreenshotRequired: row.paymentScreenshotRequired,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getPublicPaymentConfig(): Promise<PaymentConfigData | null> {
  const row = await prisma.paymentConfig.findUnique({ where: { id: "singleton" } });
  return row ? rowToConfig(row) : null;
}

export async function getPaymentConfig(): Promise<PaymentConfigData | null> {
  await requireSiteAccess();
  return getPublicPaymentConfig();
}

export type SetPaymentConfigInput = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  updatedBy: string;
  /**
   * QR override:
   * - undefined → leave the current QR untouched (passthrough on edit)
   * - { bytes, mime } → replace the QR with these bytes
   * - null → clear the QR (fall back to /public/qr-code.JPG)
   */
  qrCode?: { bytes: Uint8Array; mime: string } | null;
  /** Per-night rate (peso). */
  nightlyRate?: number;
  /** Cleaning fee for short stays (< 5 nights, peso). */
  cleaningFee?: number;
  /** Cleaning fee for long stays (>= 5 nights, peso). */
  cleaningFeeLong?: number;
  /** Nights at which a stay flips to the long-stay fee. 2..60. */
  longStayThresholdNights?: number;
  /** Whether the ID photo is required on /book. */
  idPhotoRequired?: boolean;
  /** Whether the payment screenshot is required on /book. */
  paymentScreenshotRequired?: boolean;
};

/**
 * The "passthrough" semantics let the Settings page submit unchanged fields
 * without erasing the QR or rates. The form is responsible for deciding
 * what to send based on what the user touched.
 */
export async function setPaymentConfig(input: SetPaymentConfigInput): Promise<PaymentConfigData> {
  await requireSiteAccess();
  const bankName = String(input.bankName ?? "").trim().slice(0, 100);
  const accountName = String(input.accountName ?? "").trim().slice(0, 100);
  // Strip everything but digits so we store a canonical form; the view layer
  // re-inserts spaces for readability. max 50 chars covers up to a 50-digit
  // account number, well above any real bank format.
  const accountNumber = String(input.accountNumber ?? "")
    .replace(/\D/g, "")
    .slice(0, 50);
  const updatedBy = String(input.updatedBy ?? "").trim().slice(0, 100) || "Unknown";
  if (!bankName) throw new Error("Bank name is required.");
  if (!accountName) throw new Error("Account name is required.");
  if (!accountNumber) throw new Error("Account number is required.");

  // Money fields — coerced through Number; reject negatives to keep the
  // Decimal(10, 2) range safe. 0 is fine (means "not set yet").
  const nightlyRate =
    input.nightlyRate !== undefined
      ? (() => {
          const n = Number(input.nightlyRate);
          if (!Number.isFinite(n) || n < 0) throw new Error("Nightly rate must be a non-negative number.");
          return Math.round(n * 100) / 100;
        })()
      : undefined;
  const cleaningFee =
    input.cleaningFee !== undefined
      ? (() => {
          const n = Number(input.cleaningFee);
          if (!Number.isFinite(n) || n < 0) throw new Error("Cleaning fee must be a non-negative number.");
          return Math.round(n * 100) / 100;
        })()
      : undefined;
  const cleaningFeeLong =
    input.cleaningFeeLong !== undefined
      ? (() => {
          const n = Number(input.cleaningFeeLong);
          if (!Number.isFinite(n) || n < 0)
            throw new Error("Long-stay cleaning fee must be a non-negative number.");
          return Math.round(n * 100) / 100;
        })()
      : undefined;
  // Long-stay threshold — coerced to a positive integer; lower bound 2
  // (a 1-night stay can never be "long"), upper bound 60 (already a
  // long-term rental past that point).
  const longStayThresholdNights =
    input.longStayThresholdNights !== undefined
      ? (() => {
          const n = Math.trunc(Number(input.longStayThresholdNights));
          if (!Number.isFinite(n) || n < 2 || n > 60)
            throw new Error("Long-stay threshold must be a whole number of nights between 2 and 60.");
          return n;
        })()
      : undefined;

  // Build the patch; start from text-only fields, then apply QR + rates.
  const data: Record<string, unknown> = { bankName, accountName, accountNumber, updatedBy };

  if (input.qrCode === null) {
    data.qrCode = null;
    data.qrCodeMime = null;
  } else if (input.qrCode !== undefined) {
    const validation = validatePaymentScreenshot(input.qrCode.bytes);
    if (!validation.ok) throw new Error(validation.error);
    data.qrCode = Buffer.from(input.qrCode.bytes);
    data.qrCodeMime = validation.mime;
  }
  if (nightlyRate !== undefined) data.nightlyRate = nightlyRate;
  if (cleaningFee !== undefined) data.cleaningFee = cleaningFee;
  if (cleaningFeeLong !== undefined) data.cleaningFeeLong = cleaningFeeLong;
  if (longStayThresholdNights !== undefined) data.longStayThresholdNights = longStayThresholdNights;
  if (input.idPhotoRequired !== undefined) data.idPhotoRequired = input.idPhotoRequired;
  if (input.paymentScreenshotRequired !== undefined)
    data.paymentScreenshotRequired = input.paymentScreenshotRequired;

  const row = await prisma.paymentConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      bankName,
      accountName,
      accountNumber,
      updatedBy,
      nightlyRate: nightlyRate ?? 0,
      cleaningFee: cleaningFee ?? 0,
      cleaningFeeLong: cleaningFeeLong ?? 0,
      longStayThresholdNights: longStayThresholdNights ?? 5,
      idPhotoRequired: input.idPhotoRequired ?? true,
      paymentScreenshotRequired: input.paymentScreenshotRequired ?? false,
      qrCode: input.qrCode && input.qrCode !== null ? Buffer.from(input.qrCode.bytes) : undefined,
      qrCodeMime:
        input.qrCode && input.qrCode !== null
          ? (() => {
              const v = validatePaymentScreenshot(input.qrCode.bytes);
              return v.ok ? v.mime : null;
            })()
          : null,
    },
    update: data,
  });
  return rowToConfig(row);
}