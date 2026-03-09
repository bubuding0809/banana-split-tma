import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { getNetShareHandler } from "../expenseShare/getNetShare.js";
import { getMembersHandler } from "./getMembers.js";
import { isDebtor } from "../../utils/financial.js";
import { assertChatScope } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  userId: z.number(),
  chatId: z.number(),
  currency: z.string().min(3).max(3, "Currency code must be 3 characters long"),
});

export const getDebtorsHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  //* Get chat members
  const members = await getMembersHandler({ chatId: input.chatId }, db);

  //* Get net share for each member (except the main user)
  const balanceQueries =
    members
      ?.filter((member) => Number(member.id) !== input.userId)
      .map(async (member) => {
        const balance = await getNetShareHandler(
          {
            mainUserId: input.userId,
            targetUserId: Number(member.id),
            chatId: input.chatId,
            currency: input.currency,
          },
          db
        );
        return {
          ...member,
          balance,
        };
      }) ?? [];
  const balances = await Promise.all(balanceQueries);

  //* Get debtors (users with significant positive balance, using financial threshold)
  const debtors = balances.filter(({ balance }) => isDebtor(balance));

  return debtors.map((debtor) => ({
    ...debtor,
    id: Number(debtor.id),
  }));
};

export default protectedProcedure
  .input(inputSchema)
  .query(async ({ input, ctx }) => {
    assertChatScope(ctx.session, input.chatId);
    return getDebtorsHandler(input, ctx.db);
  });
