-- CreateTable: ChatCategoryOrdering
CREATE TABLE "ChatCategoryOrdering" (
    "id" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatCategoryOrdering_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatCategoryOrdering_chatId_categoryKey_key" ON "ChatCategoryOrdering"("chatId", "categoryKey");

-- CreateIndex
CREATE INDEX "ChatCategoryOrdering_chatId_idx" ON "ChatCategoryOrdering"("chatId");

-- AddForeignKey
ALTER TABLE "ChatCategoryOrdering" ADD CONSTRAINT "ChatCategoryOrdering_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
