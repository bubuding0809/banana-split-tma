-- CreateTable
CREATE TABLE "ChatApiKey" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "createdById" BIGINT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatApiKey_keyHash_key" ON "ChatApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ChatApiKey_chatId_idx" ON "ChatApiKey"("chatId");

-- AddForeignKey
ALTER TABLE "ChatApiKey" ADD CONSTRAINT "ChatApiKey_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatApiKey" ADD CONSTRAINT "ChatApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
