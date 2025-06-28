/*
  Migration: Add payer field to Expense table
  
  This migration safely adds a payerId field to the Expense table using a three-step approach:
  1. Add nullable payerId column
  2. Populate payerId with creatorId for existing records (backward compatibility)
  3. Make payerId required and add constraints
  
  This approach works even with existing data in production.
*/

-- Step 1: Add nullable payerId column
ALTER TABLE "Expense" ADD COLUMN "payerId" BIGINT;

-- Step 2: Populate payerId with creatorId for existing records
UPDATE "Expense" SET "payerId" = "creatorId" WHERE "payerId" IS NULL;

-- Step 3: Make payerId required and add constraints
ALTER TABLE "Expense" ALTER COLUMN "payerId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Expense_payerId_idx" ON "Expense"("payerId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
