-- CreateEnum
CREATE TYPE "public"."MatchSourceType" AS ENUM ('BOOKING_PAYMENT', 'EXPENSE_SETTLEMENT');

-- CreateEnum
CREATE TYPE "public"."MatchDirection" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateTable
CREATE TABLE "public"."ReconciliationMatch" (
    "id" TEXT NOT NULL,
    "sourceType" "public"."MatchSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "direction" "public"."MatchDirection" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "bankPostedDate" TIMESTAMP(3) NOT NULL,
    "statementGroupKey" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedBy" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedBy" TEXT,
    "reversalReason" TEXT,

    CONSTRAINT "ReconciliationMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconciliationMatch_bankPostedDate_idx" ON "public"."ReconciliationMatch"("bankPostedDate");

-- CreateIndex
CREATE INDEX "ReconciliationMatch_sourceType_sourceId_reversedAt_idx" ON "public"."ReconciliationMatch"("sourceType", "sourceId", "reversedAt");

