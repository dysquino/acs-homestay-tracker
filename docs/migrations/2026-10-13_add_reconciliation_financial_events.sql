-- Reconciliation Phase 1: financial-event foundation.
-- Generated with: prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script
-- Reviewed and confirmed non-destructive: no DROP/TRUNCATE/DELETE, no change to Booking, Expense, CleaningSchedule or DateBlock.
-- Backup before applying: ~/Documents/acs-homestay-backups/2026-10-13_074452 (32 bookings / 84 expenses / 30 cleaning).

-- CreateEnum
CREATE TYPE "public"."BookingPaymentStatus" AS ENUM ('ACTIVE', 'VOIDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."BookingPaymentMethod" AS ENUM ('AIRBNB_PAYOUT', 'BANK_TRANSFER', 'INSTAPAY', 'CASH_DEPOSIT', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ExpenseSettlementStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "public"."SettlementType" AS ENUM ('DIRECT_VENDOR_PAYMENT', 'OWNER_REIMBURSEMENT', 'CLEANER_PAYMENT', 'GUEST_REFUND', 'OTHER');

-- AlterEnum
ALTER TYPE "public"."PaymentStatus" ADD VALUE 'OVERPAID';

-- CreateTable
CREATE TABLE "public"."BookingPayment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "method" "public"."BookingPaymentMethod" NOT NULL DEFAULT 'OTHER',
    "reference" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "public"."BookingPaymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,

    CONSTRAINT "BookingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExpenseSettlement" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT,
    "refundForBookingId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "paidDate" TIMESTAMP(3) NOT NULL,
    "settlementType" "public"."SettlementType" NOT NULL,
    "reimbursedTo" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "public"."ExpenseSettlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,

    CONSTRAINT "ExpenseSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingPayment_bookingId_idx" ON "public"."BookingPayment"("bookingId");

-- CreateIndex
CREATE INDEX "BookingPayment_status_receivedDate_idx" ON "public"."BookingPayment"("status", "receivedDate");

-- CreateIndex
CREATE INDEX "ExpenseSettlement_expenseId_idx" ON "public"."ExpenseSettlement"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseSettlement_status_paidDate_idx" ON "public"."ExpenseSettlement"("status", "paidDate");

-- CreateIndex
CREATE INDEX "ExpenseSettlement_refundForBookingId_idx" ON "public"."ExpenseSettlement"("refundForBookingId");

-- AddForeignKey
ALTER TABLE "public"."BookingPayment" ADD CONSTRAINT "BookingPayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExpenseSettlement" ADD CONSTRAINT "ExpenseSettlement_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "public"."Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExpenseSettlement" ADD CONSTRAINT "ExpenseSettlement_refundForBookingId_fkey" FOREIGN KEY ("refundForBookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

