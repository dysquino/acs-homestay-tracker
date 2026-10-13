-- CreateEnum
CREATE TYPE "public"."AdjustmentCategory" AS ENUM ('BANK_FEE', 'BANK_INTEREST', 'CHARGEBACK', 'OWNER_CONTRIBUTION', 'OWNER_WITHDRAWAL', 'TRANSFER_CORRECTION', 'DUPLICATE_CORRECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."AdjustmentStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateTable
CREATE TABLE "public"."ReconciliationAdjustment" (
    "id" TEXT NOT NULL,
    "direction" "public"."MatchDirection" NOT NULL,
    "category" "public"."AdjustmentCategory" NOT NULL,
    "status" "public"."AdjustmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "amount" DECIMAL(10,2) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "bankPostedDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedBy" TEXT,

    CONSTRAINT "ReconciliationAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconciliationAdjustment_bankPostedDate_idx" ON "public"."ReconciliationAdjustment"("bankPostedDate");

-- CreateIndex
CREATE INDEX "ReconciliationAdjustment_status_bankPostedDate_idx" ON "public"."ReconciliationAdjustment"("status", "bankPostedDate");

