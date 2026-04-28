import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertChatAccess } from "../../middleware/chatScope.js";
import { getMemberBalanceSummaryHandler } from "./getMemberBalanceSummary.js";

export const inputSchema = z.object({
  chatId: z
    .union([z.string(), z.number()])
    .transform((val) => Number(val))
    .pipe(z.number()),
  userId: z
    .union([z.string(), z.number()])
    .transform((val) => Number(val))
    .pipe(z.number()),
});

export const removeMemberHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  const summary = await getMemberBalanceSummaryHandler(
    { chatId: input.chatId, userId: input.userId },
    db
  );
  if (summary.balances.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Member has outstanding balance",
    });
  }

  return db.chat.update({
    where: { id: input.chatId },
    data: { members: { disconnect: { id: input.userId } } },
  });
};

export default protectedProcedure
  .input(inputSchema)
  .mutation(async ({ input, ctx }) => {
    await assertChatAccess(ctx.session, ctx.db, input.chatId);
    return removeMemberHandler(input, ctx.db);
  });
