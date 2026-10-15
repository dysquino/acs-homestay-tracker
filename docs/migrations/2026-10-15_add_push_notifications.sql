-- Owner notifications (Web Push): the devices that receive them, and the
-- Airbnb reservations already announced.
-- Generated with: prisma migrate diff --from-schema-datamodel <previous schema> --to-schema-datamodel prisma/schema.prisma --script
-- Additive only: two new tables, no change to existing ones. Apply with this
-- file, not `db:push` — the live database has an unrelated AirbnbCsvImport
-- table that `db:push` would drop.

-- CreateTable
CREATE TABLE "public"."PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "deviceLabel" TEXT NOT NULL DEFAULT '',
    "notifyRequests" BOOLEAN NOT NULL DEFAULT true,
    "notifySummary" BOOLEAN NOT NULL DEFAULT true,
    "notifyAirbnb" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AirbnbNotified" (
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AirbnbNotified_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "public"."PushSubscription"("endpoint");

