-- Add name column nullable so existing rows survive
ALTER TABLE "ChatApiKey" ADD COLUMN "name" TEXT;
ALTER TABLE "UserApiKey" ADD COLUMN "name" TEXT;

-- Back-fill from createdAt: "Token · Mar 14"
UPDATE "ChatApiKey"
SET "name" = 'Token · ' || TO_CHAR("createdAt", 'Mon DD');
UPDATE "UserApiKey"
SET "name" = 'Token · ' || TO_CHAR("createdAt", 'Mon DD');

-- Tighten to NOT NULL now that every row is populated
ALTER TABLE "ChatApiKey" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "UserApiKey" ALTER COLUMN "name" SET NOT NULL;
