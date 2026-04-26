-- Adds telegramMessageId to Settlement so deleteSettlement can
-- clean up the corresponding Telegram notification message.
-- Pre-existing settlements have no captured message ID and stay null;
-- their notifications can't be retroactively deleted.

ALTER TABLE "Settlement" ADD COLUMN "telegramMessageId" BIGINT;
