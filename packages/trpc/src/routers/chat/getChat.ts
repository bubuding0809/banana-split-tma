import { z } from 'zod'
import { Db, publicProcedure } from '../../trpc.js'

const inputSchema = z.object({ chatId: z.number() })

export const getChatHandler = async (input: z.infer<typeof inputSchema>, db: Db) => {
  const chat = await db.chat.findUnique({
    where: { id: input.chatId },
    include: { members: true },
  })

  return {
    ...chat,
    members:
      chat?.members.map(m => ({
        ...m,
        id: Number(m.id),
      })) ?? [],
  }
}

export default publicProcedure.input(inputSchema).query(async ({ input, ctx }) => {
  return getChatHandler(input, ctx.db)
})
