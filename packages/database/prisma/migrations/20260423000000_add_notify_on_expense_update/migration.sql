-- Adds a dedicated toggle for expense-update notifications.
-- When false, the singular update-expense flow skips its Telegram
-- edit+bump, and the bulk-update summary is suppressed (even when
-- the CLI requests it via --notify).

ALTER TABLE "Chat" ADD COLUMN "notifyOnExpenseUpdate" BOOLEAN NOT NULL DEFAULT true;
