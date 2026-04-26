-- Rename column to reflect its semantics. The value is the original
-- transaction date / phase anchor for the cron — not the AWS schedule
-- start (which is recomputed per-push to satisfy AWS's 5-minute rule).
ALTER TABLE "RecurringExpenseTemplate" RENAME COLUMN "startDate" TO "anchorDate";
