/*
  Warnings:

  - A unique constraint covering the columns `[recurringTemplateId,date]` on the table `Expense` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT');

-- CreateEnum
CREATE TYPE "RecurringStatus" AS ENUM ('ACTIVE', 'CANCELED', 'ENDED');

-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "recurringTemplateId" TEXT;

-- CreateTable
CREATE TABLE "RecurringExpenseTemplate" (
    "id" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "creatorId" BIGINT NOT NULL,
    "payerId" BIGINT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "splitMode" "SplitMode" NOT NULL,
    "participantIds" BIGINT[],
    "customSplits" JSONB,
    "categoryId" TEXT,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "weekdays" "Weekday"[],
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "timezone" TEXT NOT NULL,
    "awsScheduleName" TEXT NOT NULL,
    "status" "RecurringStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringExpenseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringExpenseTemplate_awsScheduleName_key" ON "RecurringExpenseTemplate"("awsScheduleName");

-- CreateIndex
CREATE INDEX "RecurringExpenseTemplate_chatId_status_idx" ON "RecurringExpenseTemplate"("chatId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_recurringTemplateId_date_key" ON "Expense"("recurringTemplateId", "date");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringTemplateId_fkey" FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringExpenseTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpenseTemplate" ADD CONSTRAINT "RecurringExpenseTemplate_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
