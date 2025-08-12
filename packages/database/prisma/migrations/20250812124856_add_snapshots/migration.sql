-- CreateTable
CREATE TABLE "ExpenseSnapshot" (
    "id" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "creatorId" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SGD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SnapshotExpenses" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SnapshotExpenses_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "ExpenseSnapshot_chatId_idx" ON "ExpenseSnapshot"("chatId");

-- CreateIndex
CREATE INDEX "ExpenseSnapshot_creatorId_idx" ON "ExpenseSnapshot"("creatorId");

-- CreateIndex
CREATE INDEX "_SnapshotExpenses_B_index" ON "_SnapshotExpenses"("B");

-- AddForeignKey
ALTER TABLE "ExpenseSnapshot" ADD CONSTRAINT "ExpenseSnapshot_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseSnapshot" ADD CONSTRAINT "ExpenseSnapshot_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SnapshotExpenses" ADD CONSTRAINT "_SnapshotExpenses_A_fkey" FOREIGN KEY ("A") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SnapshotExpenses" ADD CONSTRAINT "_SnapshotExpenses_B_fkey" FOREIGN KEY ("B") REFERENCES "ExpenseSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
