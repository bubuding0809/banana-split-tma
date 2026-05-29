-- CreateTable
CREATE TABLE "DebtTransfer" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creatorId" BIGINT NOT NULL,
    "debtorId" BIGINT NOT NULL,
    "creditorId" BIGINT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SGD',
    "description" TEXT,
    "sourceChatId" BIGINT NOT NULL,
    "targetChatId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DebtTransfer_sourceChatId_idx" ON "DebtTransfer"("sourceChatId");

-- CreateIndex
CREATE INDEX "DebtTransfer_targetChatId_idx" ON "DebtTransfer"("targetChatId");

-- CreateIndex
CREATE INDEX "DebtTransfer_debtorId_idx" ON "DebtTransfer"("debtorId");

-- CreateIndex
CREATE INDEX "DebtTransfer_creditorId_idx" ON "DebtTransfer"("creditorId");

-- AddForeignKey
ALTER TABLE "DebtTransfer" ADD CONSTRAINT "DebtTransfer_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtTransfer" ADD CONSTRAINT "DebtTransfer_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtTransfer" ADD CONSTRAINT "DebtTransfer_creditorId_fkey" FOREIGN KEY ("creditorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtTransfer" ADD CONSTRAINT "DebtTransfer_sourceChatId_fkey" FOREIGN KEY ("sourceChatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtTransfer" ADD CONSTRAINT "DebtTransfer_targetChatId_fkey" FOREIGN KEY ("targetChatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
