import { z } from "zod";
import { Db, protectedProcedure } from "../../trpc.js";
import { getNetShareHandler } from "../expenseShare/getNetShare.js";
import { getMembersHandler } from "./getMembers.js";
import { isCreditor } from "../../utils/financial.js";
import { assertChatScope } from "../../middleware/chatScope.js";

const inputSchema = z.object({
  userId: z.number(),
  chatId: z.number(),
});

const outputSchema = z.array(
  z.object({
    id: z.number(),
    firstName: z.string(),
    lastName: z.string().nullable(),
    username: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
    phoneNumber: z.string().nullable(),
    phoneNumberRequested: z.boolean(),
    balances: z.array(
      z.object({
        currency: z.string(),
        amount: z.number(),
      })
    ),
  })
);

export const getCreditorsMultiCurrencyHandler = async (
  input: z.infer<typeof inputSchema>,
  db: Db
) => {
  // Get chat members
  const members = await getMembersHandler({ chatId: input.chatId }, db);

  // Get all unique currencies used in this chat
  const [expenseCurrencies, settlementCurrencies] = await Promise.all([
    db.expense.findMany({
      where: { chatId: input.chatId },
      select: { currency: true },
      distinct: ["currency"],
    }),
    db.settlement.findMany({
      where: { chatId: input.chatId },
      select: { currency: true },
      distinct: ["currency"],
    }),
  ]);

  const allUsedCurrencies = [
    ...new Set([
      ...expenseCurrencies.map((e) => e.currency),
      ...settlementCurrencies.map((s) => s.currency),
    ]),
  ];

  if (allUsedCurrencies.length === 0) {
    return [];
  }

  // Get net share for each member across all currencies
  const memberBalanceQueries =
    members
      ?.filter((member) => Number(member.id) !== input.userId)
      .map(async (member) => {
        // Get balances for all currencies for this member
        const currencyBalanceQueries = allUsedCurrencies.map(
          async (currency) => {
            const balance = await getNetShareHandler(
              {
                mainUserId: input.userId,
                targetUserId: Number(member.id),
                chatId: input.chatId,
                currency,
              },
              db
            );
            return { currency, amount: balance };
          }
        );

        const balances = await Promise.all(currencyBalanceQueries);

        // Filter out zero balances and keep only creditor balances
        const nonZeroBalances = balances.filter((balance) =>
          isCreditor(balance.amount)
        );

        return {
          ...member,
          balances: nonZeroBalances,
        };
      }) ?? [];

  const membersWithBalances = await Promise.all(memberBalanceQueries);

  // Filter out members with no creditor balances
  const creditors = membersWithBalances.filter(
    ({ balances }) => balances.length > 0
  );

  return creditors.map((creditor) => ({
    ...creditor,
    id: Number(creditor.id),
  }));
};

export default protectedProcedure
  .input(inputSchema)
  .output(outputSchema)
  .query(async ({ input, ctx }) => {
    assertChatScope(ctx.session, input.chatId);
    return getCreditorsMultiCurrencyHandler(input, ctx.db);
  });
