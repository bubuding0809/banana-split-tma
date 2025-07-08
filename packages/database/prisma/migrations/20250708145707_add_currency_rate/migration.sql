-- CreateTable
CREATE TABLE "CurrencyRate" (
    "id" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "targetCurrency" TEXT NOT NULL,
    "rate" DECIMAL(15,8) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CurrencyRate_baseCurrency_targetCurrency_idx" ON "CurrencyRate"("baseCurrency", "targetCurrency");

-- CreateIndex
CREATE INDEX "CurrencyRate_updatedAt_idx" ON "CurrencyRate"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyRate_baseCurrency_targetCurrency_key" ON "CurrencyRate"("baseCurrency", "targetCurrency");
