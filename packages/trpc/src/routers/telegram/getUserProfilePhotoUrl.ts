import { z } from "zod";
import { protectedProcedure } from "../../trpc.js";
import { Telegram } from "telegraf";

const inputSchema = z.object({ userId: z.number() });

export const getUserProfilePhotoUrlHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Telegram
) => {
  const { photos } = await teleBot.getUserProfilePhotos(input.userId);
  const targetPhoto = photos.at(0)?.at(0);
  if (!targetPhoto) {
    return null;
  }
  return teleBot.getFileLink(targetPhoto.file_id);
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getUserProfilePhotoUrlHandler(input, ctx.teleBot);
  });
