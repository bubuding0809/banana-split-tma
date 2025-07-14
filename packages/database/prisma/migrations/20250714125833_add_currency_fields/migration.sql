-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "baseCurrency" TEXT NOT NULL DEFAULT 'SGD';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SGD';

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SGD';
