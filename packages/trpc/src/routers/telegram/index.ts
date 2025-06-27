import { z } from "zod";
import { publicProcedure } from "../../trpc.js";

export const telegramRouter = {
  getChat: publicProcedure
    .input(z.object({ chatId: z.number() }))
    .query(async ({ input, ctx }) => {
      const chat = await ctx.teleBot.getChat(input.chatId);

      const { big_file_id } = chat.photo ?? {};

      if (big_file_id) {
        const fileLink = await ctx.teleBot.getFileLink(big_file_id);

        return {
          ...chat,
          photoUrl: fileLink,
        };
      }

      return {
        ...chat,
        photoUrl: null,
      };
    }),

  getUserProfilePhotoUrl: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { photos } = await ctx.teleBot.getUserProfilePhotos(input.userId);
      const targetPhoto = photos.at(0)?.at(0);
      if (!targetPhoto) {
        return null;
      }
      return ctx.teleBot.getFileLink(targetPhoto.file_id);
    }),

  getChatMember: publicProcedure
    .input(
      z.object({
        chatId: z.number(),
        userId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      return ctx.teleBot.getChatMember(input.chatId, input.userId);
    }),

  sendMessage: publicProcedure
    .input(
      z.object({
        chatId: z.number(),
        message: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const message = await ctx.teleBot.sendMessage(
        input.chatId,
        input.message
      );
      return message.message_id;
    }),
};
