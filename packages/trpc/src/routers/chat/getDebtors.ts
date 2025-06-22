import { z } from 'zod'
import { Db, publicProcedure } from '../../trpc.js'
import { getNetShareHandler } from '../expenseShare/getNetShare.js'
import { getMembersHandler } from './getMembers.js'

const inputSchema = z.object({
  userId: z.number(),
  chatId: z.number(),
})

const getDebtorsHandler = async (input: z.infer<typeof inputSchema>, db: Db) => {
  //* Get chat members
  const members = await getMembersHandler({ chatId: input.chatId }, db)

  //* Get net share for each member (except the main user)
  const balanceQueries =
    members
      ?.filter(member => Number(member.id) !== input.userId)
      .map(async member => {
        const balance = await getNetShareHandler(
          {
            mainUserId: input.userId,
            targetUserId: Number(member.id),
            chatId: input.chatId,
          },
          db
        )
        return {
          ...member,
          balance,
        }
      }) ?? []
  const balances = await Promise.all(balanceQueries)

  //* Get debtors (users with positive balance)
  const debtors = balances.filter(({ balance }) => balance > 0)

  return debtors.map(debtor => ({
    ...debtor,
    id: Number(debtor.id),
  }))
}

export default publicProcedure.input(inputSchema).query(async ({ input, ctx }) => {
  return getDebtorsHandler(input, ctx.db)
})
