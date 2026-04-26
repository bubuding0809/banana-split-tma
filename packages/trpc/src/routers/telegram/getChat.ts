import { z } from "zod";
import { protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { Telegram } from "telegraf";

const inputSchema = z.object({ chatId: z.number() });

export const getChatHandler = async (
  input: z.infer<typeof inputSchema>,
  teleBot: Telegram
) => {
  const chat = await teleBot.getChat(input.chatId);
  // chat.photo is intentionally not surfaced — clients use
  // /api/chat-photo/:chatId to render group photos. Returning the
  // file_id here would tempt callers to construct token-bearing URLs.
  const { photo: _photo, ...rest } = chat;
  return rest;
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    return getChatHandler(input, ctx.teleBot);
  });
