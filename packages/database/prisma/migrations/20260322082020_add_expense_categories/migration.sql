-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "categoryIcon" TEXT,
ADD COLUMN     "categoryName" TEXT;

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "chatId" BIGINT,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_chatId_idx" ON "Category"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_chatId_name_key" ON "Category"("chatId", "name");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
