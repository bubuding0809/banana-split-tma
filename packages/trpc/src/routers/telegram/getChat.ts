import { z } from "zod";
import { publicProcedure } from "../../trpc.js";
import { Telegram } from "telegraf";

const inputSchema = z.object({ chatId: z.number() });

export const getChatHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Telegram
) => {
  const chat = await teleBot.getChat(input.chatId);

  const { big_file_id } = chat.photo ?? {};

  if (big_file_id) {
    const fileLink = await teleBot.getFileLink(big_file_id);

    return {
      ...chat,
      photoUrl: fileLink,
    };
  }

  return {
    ...chat,
    photoUrl: null,
  };
};

export default publicProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    return getChatHandler(input, ctx.teleBot);
  });
