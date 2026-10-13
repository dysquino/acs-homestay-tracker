-- Refuse reconciliation writes to a sealed month, at the database.
--
-- §8.10 makes a finalized month read-only, and acceptance criterion 15 asks
-- that finalization lock the month. Until this trigger, that guarantee lived
-- entirely in `resolveWritablePeriod` — application code. A smoke test against
-- production confirmed the hole: inserting a ReconciliationMatch against a
-- FINALIZED period succeeded, because the only thing checking was the code
-- path that happened to be doing the writing.
--
-- Application checks are the right first line — they produce a message an
-- owner can act on — but they are bypassed by any future code path that forgets
-- to call the guard, by a migration script, by an admin tool, or by hand-run
-- SQL. This is the backstop for all of those.
--
-- Fires on UPDATE as well as INSERT because reversing a match is an UPDATE:
-- `reverseMatch` sets reversedAt, and §7.13 forbids unmatching inside a
-- finalized month just as firmly as it forbids matching into one.
--
-- Deliberately NOT on ReconciliationPeriod itself. Finalization and reopening
-- are UPDATEs to that table, and blocking them would make a sealed month
-- unreopenable — the opposite of §8.11.
--
-- Prisma has no representation for triggers, so `migrate diff` will not report
-- this and will not reproduce it. It is maintained by this file; see the note
-- in prisma/schema.prisma.

CREATE OR REPLACE FUNCTION reconciliation_sealed_period_guard()
RETURNS TRIGGER AS $$
DECLARE
  target_status "public"."PeriodStatus";
BEGIN
  SELECT "status" INTO target_status
    FROM "public"."ReconciliationPeriod"
    WHERE "id" = NEW."periodId";

  -- A missing period is left to the foreign key to reject. Raising here too
  -- would mask a constraint violation with a less specific error.
  IF target_status = 'FINALIZED' THEN
    RAISE EXCEPTION
      'Reconciliation period is finalized and read-only; reopen it before changing anything.'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "reconciliation_match_sealed_guard"
  BEFORE INSERT OR UPDATE ON "public"."ReconciliationMatch"
  FOR EACH ROW EXECUTE FUNCTION reconciliation_sealed_period_guard();

CREATE TRIGGER "reconciliation_adjustment_sealed_guard"
  BEFORE INSERT OR UPDATE ON "public"."ReconciliationAdjustment"
  FOR EACH ROW EXECUTE FUNCTION reconciliation_sealed_period_guard();