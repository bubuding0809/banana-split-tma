import { z } from "zod";
import { adminProcedure } from "../../trpc.js";

export default adminProcedure
  .input(
    z.object({
      message: z.string(),
      testUserId: z.number(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    try {
      await ctx.teleBot.sendMessage(input.testUserId, input.message, {
        parse_mode: "MarkdownV2", // Assuming telegramify-markdown might be used
      });
      return { success: true };
    } catch (error) {
      console.error("Test broadcast failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
