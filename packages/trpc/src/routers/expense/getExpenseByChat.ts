import { z } from 'zod'
import { Db, publicProcedure } from '../../trpc.js'

const inputSchema = z.object({
  chatId: z.number(),
})

export const getExpenseByChatHandler = async (input: z.infer<typeof inputSchema>, db: Db) => {
  const expenses = await db.expense.findMany({
    where: {
      chatId: input.chatId,
    },
  })
  return expenses.map(expense => ({
    ...expense,
    creatorId: Number(expense.creatorId),
    chatId: Number(expense.chatId),
    amount: Number(expense.amount),
  }))
}

export default publicProcedure.input(inputSchema).query(async ({ input, ctx }) => {
  return getExpenseByChatHandler(input, ctx.db)
})
