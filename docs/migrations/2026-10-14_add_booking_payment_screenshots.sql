-- Store proof on the individual receipt it documents. Both columns are
-- nullable so existing payments remain valid and can be backfilled in the UI.

ALTER TABLE "public"."BookingPayment"
ADD COLUMN "paymentScreenshot" BYTEA,
ADD COLUMN "paymentScreenshotMime" TEXT;
