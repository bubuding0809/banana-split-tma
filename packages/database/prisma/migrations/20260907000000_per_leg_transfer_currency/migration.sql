-- Add both legs, nullable so the backfill can run
ALTER TABLE "DebtTransfer"
  ADD COLUMN "sourceAmount" DECIMAL(12,2),
  ADD COLUMN "sourceCurrency" TEXT,
  ADD COLUMN "targetAmount" DECIMAL(12,2),
  ADD COLUMN "targetCurrency" TEXT;

-- Backfill: both legs start identical to the single-currency row
UPDATE "DebtTransfer" SET
  "sourceAmount" = "amount",
  "targetAmount" = "amount",
  "sourceCurrency" = "currency",
  "targetCurrency" = "currency";

-- Lock them down
ALTER TABLE "DebtTransfer"
  ALTER COLUMN "sourceAmount" SET NOT NULL,
  ALTER COLUMN "sourceCurrency" SET NOT NULL,
  ALTER COLUMN "sourceCurrency" SET DEFAULT 'SGD',
  ALTER COLUMN "targetAmount" SET NOT NULL,
  ALTER COLUMN "targetCurrency" SET NOT NULL,
  ALTER COLUMN "targetCurrency" SET DEFAULT 'SGD';

-- Drop the shared columns
ALTER TABLE "DebtTransfer"
  DROP COLUMN "amount",
  DROP COLUMN "currency";
