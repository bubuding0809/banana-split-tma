-- CreateEnum
CREATE TYPE "BroadcastMediaKind" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'RETRACTED', 'EDITED');

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "createdByTelegramId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "text" TEXT NOT NULL,
    "mediaKind" "BroadcastMediaKind",
    "mediaFileId" TEXT,
    "mediaFileName" TEXT,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'SENDING',
    "parentBroadcastId" TEXT,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastDelivery" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT NOT NULL,
    "telegramChatId" BIGINT NOT NULL,
    "telegramMessageId" BIGINT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "lastEditedAt" TIMESTAMP(3),
    "retractedAt" TIMESTAMP(3),
    "editedText" TEXT,
    "editedMediaFileId" TEXT,

    CONSTRAINT "BroadcastDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Broadcast_createdAt_idx" ON "Broadcast"("createdAt");

-- CreateIndex
CREATE INDEX "Broadcast_createdByTelegramId_createdAt_idx" ON "Broadcast"("createdByTelegramId", "createdAt");

-- CreateIndex
CREATE INDEX "BroadcastDelivery_userId_sentAt_idx" ON "BroadcastDelivery"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "BroadcastDelivery_status_idx" ON "BroadcastDelivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastDelivery_broadcastId_userId_key" ON "BroadcastDelivery"("broadcastId", "userId");

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_parentBroadcastId_fkey" FOREIGN KEY ("parentBroadcastId") REFERENCES "Broadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastDelivery" ADD CONSTRAINT "BroadcastDelivery_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;
