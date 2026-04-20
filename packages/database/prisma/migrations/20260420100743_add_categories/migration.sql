-- AlterTable: add nullable categoryId to Expense
ALTER TABLE "Expense" ADD COLUMN "categoryId" TEXT;

-- CreateTable: per-chat custom categories
CREATE TABLE "ChatCategory" (
    "id" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "emoji" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdById" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatCategory_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "ChatCategory_chatId_title_key" ON "ChatCategory"("chatId", "title");
CREATE INDEX "ChatCategory_chatId_idx" ON "ChatCategory"("chatId");
CREATE INDEX "Expense_chatId_categoryId_idx" ON "Expense"("chatId", "categoryId");

-- Foreign keys
ALTER TABLE "ChatCategory" ADD CONSTRAINT "ChatCategory_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatCategory" ADD CONSTRAINT "ChatCategory_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
