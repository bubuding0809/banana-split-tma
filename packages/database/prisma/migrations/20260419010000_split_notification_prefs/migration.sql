-- AlterTable: add per-type notification preference columns seeded from the existing toggle
ALTER TABLE "Chat" ADD COLUMN "notifyOnExpense" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Chat" ADD COLUMN "notifyOnSettlement" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Chat"
SET "notifyOnExpense" = "notificationsEnabled",
    "notifyOnSettlement" = "notificationsEnabled";

ALTER TABLE "Chat" DROP COLUMN "notificationsEnabled";
