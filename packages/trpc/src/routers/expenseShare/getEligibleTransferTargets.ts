import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { assertNotChatScoped } from "../../middleware/chatScope.js";
import { TRPCError } from "@trpc/server";

const inputSchema = z.object({
  counterpartyUserId: z.number(),
  sourceChatId: z.number(),
});

const outputSchema = z.array(
  z.object({ chatId: z.number(), chatTitle: z.string() })
);

export async function getEligibleTransferTargetsHandler(
  input: { callerId: number; counterpartyUserId: number; sourceChatId: number },
  db: Db
): Promise<z.infer<typeof outputSchema>> {
  // Groups where BOTH the caller and the counterparty are members, excluding
  // the source chat. Membership-only — the solvency check stays in
  // debtTransfer.createTransfer, which remains the source of truth.
  const chats = await db.chat.findMany({
    where: {
      AND: [
        { members: { some: { id: BigInt(input.callerId) } } },
        { members: { some: { id: BigInt(input.counterpartyUserId) } } },
      ],
      id: { not: BigInt(input.sourceChatId) },
    },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });

  return chats.map((c) => ({ chatId: Number(c.id), chatTitle: c.title }));
}

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    assertNotChatScoped(ctx.session);
    if (!ctx.session.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "User not authenticated",
      });
    }
    return getEligibleTransferTargetsHandler(
      {
        callerId: Number(ctx.session.user.id),
        counterpartyUserId: input.counterpartyUserId,
        sourceChatId: input.sourceChatId,
      },
      ctx.db
    );
  });
