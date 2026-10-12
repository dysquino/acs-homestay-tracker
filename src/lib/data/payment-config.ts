"use server";

import "server-only";

import { prisma } from "@/lib/prisma";

import { requireSiteAccess } from "./access";

/**
 * Bank details shown on /book so guests can pay via InstaPay. The QR image
 * itself lives at /public/qr-code.JPG (a static asset — Settings only edits
 * the text fields). One row by convention (id = "singleton").
 *
 * - `getPublicPaymentConfig()` — no gate, returns the row (or null when not
 *   yet set up). Read by the public booking page; bank details are intentionally
 *   public to guests who reach the booking link.
 * - `getPaymentConfig()` / `setPaymentConfig()` — behind the site access code
 *   (owner-only edits).
 */

export type PaymentConfigData = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  updatedAt: string;
};

function rowToConfig(row: {
  bankName: string;
  accountName: string;
  accountNumber: string;
  updatedAt: Date;
}): PaymentConfigData {
  return {
    bankName: row.bankName,
    accountName: row.accountName,
    accountNumber: row.accountNumber,
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

export async function setPaymentConfig(input: {
  bankName: string;
  accountName: string;
  accountNumber: string;
  updatedBy: string;
}): Promise<PaymentConfigData> {
  await requireSiteAccess();
  const bankName = String(input.bankName ?? "").trim().slice(0, 100);
  const accountName = String(input.accountName ?? "").trim().slice(0, 100);
  const accountNumber = String(input.accountNumber ?? "").trim().slice(0, 50);
  const updatedBy = String(input.updatedBy ?? "").trim().slice(0, 100) || "Unknown";
  if (!bankName) throw new Error("Bank name is required.");
  if (!accountName) throw new Error("Account name is required.");
  if (!accountNumber) throw new Error("Account number is required.");

  const row = await prisma.paymentConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", bankName, accountName, accountNumber, updatedBy },
    update: { bankName, accountName, accountNumber, updatedBy },
  });
  return rowToConfig(row);
}