/*
  Warnings:

  - You are about to drop the column `description` on the `ExpenseSnapshot` table. All the data in the column will be lost.
  - You are about to drop the column `totalAmount` on the `ExpenseSnapshot` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ExpenseSnapshot" DROP COLUMN "description",
DROP COLUMN "totalAmount";
