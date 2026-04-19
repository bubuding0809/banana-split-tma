import { z } from "zod";
import telegramifyMarkdown from "telegramify-markdown";
import { adminProcedure } from "../../trpc.js";

export default adminProcedure
  .input(
    z.object({
      message: z.string(),
      targetUserIds: z.array(z.number()).max(200).optional(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    let usersToMessage: { id: bigint }[] = [];

    if (input.targetUserIds !== undefined) {
      if (input.targetUserIds.length === 0) {
        usersToMessage = [];
      } else {
        usersToMessage = await ctx.db.user.findMany({
          where: {
            id: {
              in: input.targetUserIds.map((id) => BigInt(id)),
            },
          },
          select: { id: true },
        });
      }
    } else {
      usersToMessage = await ctx.db.user.findMany({
        select: { id: true },
      });
    }

    const telegramMessage = telegramifyMarkdown(input.message, "escape");

    let successCount = 0;
    let failCount = 0;
    const failures: { userId: number; error: string }[] = [];

    for (const user of usersToMessage) {
      const userId = Number(user.id);
      try {
        await ctx.teleBot.sendMessage(userId, telegramMessage, {
          parse_mode: "MarkdownV2",
        });
        successCount++;
      } catch (error) {
        console.error(`Broadcast to ${userId} failed:`, error);
        failCount++;
        failures.push({
          userId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      // Delay to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      successCount,
      failCount,
      failures,
    };
  });
