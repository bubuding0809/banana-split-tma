import { z } from 'zod'
import { Db, publicProcedure } from '../../trpc.js'

const inputSchema = z.object({
  mainUserId: z.number(),
  targetUserId: z.number(),
  chatId: z.number(),
})

export const getNetShareHandler = async (input: z.infer<typeof inputSchema>, db: Db) => {
  //* Find out how much the target user owes the main user
  const toReceive = await db.expenseShare.findMany({
    where: {
      expense: {
        chatId: input.chatId,
        creatorId: input.mainUserId,
      },
      userId: input.targetUserId,
    },
    select: {
      amount: true,
    },
  })

  //* Find out how much the target user lent to the main user
  const toPay = await db.expenseShare.findMany({
    where: {
      expense: {
        chatId: input.chatId,
        creatorId: input.targetUserId,
      },
      userId: input.mainUserId,
    },
    select: {
      amount: true,
    },
  })

  //* Calculate the net amount between the two users
  const netAmount =
    toReceive.reduce((acc, share) => acc + Number(share.amount ?? 0), 0) -
    toPay.reduce((acc, share) => acc + Number(share.amount ?? 0), 0)

  return netAmount
}

export default publicProcedure.input(inputSchema).query(async ({ input, ctx }) => {
  return getNetShareHandler(input, ctx.db)
})
