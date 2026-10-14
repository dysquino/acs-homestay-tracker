-- CreateEnum
CREATE TYPE "public"."PeriodStatus" AS ENUM ('DRAFT', 'FINALIZED', 'REOPENED');

-- CreateEnum
CREATE TYPE "public"."AuditEventType" AS ENUM ('DRAFT_CREATED', 'MATCH_CREATED', 'MATCH_REVERSED', 'ADJUSTMENT_CREATED', 'ADJUSTMENT_VOIDED', 'PERIOD_FINALIZED', 'PERIOD_REOPENED', 'PERIOD_REFINALIZED');

-- AlterTable
ALTER TABLE "public"."ReconciliationAdjustment" ADD COLUMN     "periodId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."ReconciliationMatch" ADD COLUMN     "periodId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."ReconciliationPeriod" (
    "id" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "status" "public"."PeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "startingBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "endingBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "calculatedBalance" DECIMAL(10,2),
    "difference" DECIMAL(10,2),
    "statementClosingDate" TIMESTAMP(3),
    "statementReference" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "finalizedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenReason" TEXT,

    CONSTRAINT "ReconciliationPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReconciliationSnapshot" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "summaryJson" JSONB NOT NULL,
    "ledgerJson" JSONB NOT NULL,
    "outstandingJson" JSONB NOT NULL,
    "finalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedBy" TEXT NOT NULL,

    CONSTRAINT "ReconciliationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReconciliationAuditEvent" (
    "id" TEXT NOT NULL,
    "periodId" TEXT,
    "eventType" "public"."AuditEventType" NOT NULL,
    "actor" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "metadataJson" JSONB,

    CONSTRAINT "ReconciliationAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconciliationPeriod_status_idx" ON "public"."ReconciliationPeriod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationPeriod_month_key" ON "public"."ReconciliationPeriod"("month");

-- CreateIndex
CREATE INDEX "ReconciliationSnapshot_periodId_idx" ON "public"."ReconciliationSnapshot"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationSnapshot_periodId_version_key" ON "public"."ReconciliationSnapshot"("periodId", "version");

-- CreateIndex
CREATE INDEX "ReconciliationAuditEvent_periodId_timestamp_idx" ON "public"."ReconciliationAuditEvent"("periodId", "timestamp");

-- CreateIndex
CREATE INDEX "ReconciliationAuditEvent_eventType_idx" ON "public"."ReconciliationAuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "ReconciliationAdjustment_periodId_bankPostedDate_idx" ON "public"."ReconciliationAdjustment"("periodId", "bankPostedDate");

-- CreateIndex
CREATE INDEX "ReconciliationMatch_periodId_bankPostedDate_idx" ON "public"."ReconciliationMatch"("periodId", "bankPostedDate");

-- AddForeignKey
ALTER TABLE "public"."ReconciliationMatch" ADD CONSTRAINT "ReconciliationMatch_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "public"."ReconciliationPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReconciliationAdjustment" ADD CONSTRAINT "ReconciliationAdjustment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "public"."ReconciliationPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReconciliationSnapshot" ADD CONSTRAINT "ReconciliationSnapshot_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "public"."ReconciliationPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReconciliationAuditEvent" ADD CONSTRAINT "ReconciliationAuditEvent_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "public"."ReconciliationPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

