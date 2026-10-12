"use server";

import "server-only";

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
  updatedAt: string;
};

function rowToConfig(row: {
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrCodeMime: string | null;
  qrCode: Uint8Array | null;
  updatedAt: Date;
}): PaymentConfigData {
  return {
    bankName: row.bankName,
    accountName: row.accountName,
    accountNumber: row.accountNumber,
    qrCodeMime: row.qrCodeMime,
    qrCodeBytes: row.qrCode ? new Uint8Array(row.qrCode) : null,
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
};

/**
 * The "passthrough" semantics let the Settings page submit unchanged fields
 * without erasing the QR. The form is responsible for deciding what `qrCode`
 * to send based on what the user touched.
 */
export async function setPaymentConfig(input: SetPaymentConfigInput): Promise<PaymentConfigData> {
  await requireSiteAccess();
  const bankName = String(input.bankName ?? "").trim().slice(0, 100);
  const accountName = String(input.accountName ?? "").trim().slice(0, 100);
  const accountNumber = String(input.accountNumber ?? "").trim().slice(0, 50);
  const updatedBy = String(input.updatedBy ?? "").trim().slice(0, 100) || "Unknown";
  if (!bankName) throw new Error("Bank name is required.");
  if (!accountName) throw new Error("Account name is required.");
  if (!accountNumber) throw new Error("Account number is required.");

  // Build the patch; start from text-only fields, then apply the QR rule.
  const data: Record<string, unknown> = { bankName, accountName, accountNumber, updatedBy };

  if (input.qrCode === null) {
    // Explicit remove.
    data.qrCode = null;
    data.qrCodeMime = null;
  } else if (input.qrCode !== undefined) {
    // Replace — validate before touching the row.
    const validation = validatePaymentScreenshot(input.qrCode.bytes);
    if (!validation.ok) throw new Error(validation.error);
    data.qrCode = Buffer.from(input.qrCode.bytes);
    data.qrCodeMime = validation.mime; // sniffed MIME, ignore whatever client sent
  }

  const row = await prisma.paymentConfig.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      bankName,
      accountName,
      accountNumber,
      updatedBy,
      // First-time create: if a QR was provided, include it; otherwise null
      // (the static fallback covers that case).
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