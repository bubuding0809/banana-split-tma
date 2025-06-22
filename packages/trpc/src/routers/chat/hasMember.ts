import { z } from 'zod'
import { Db, publicProcedure } from '../../trpc.js'

const inputSchema = z.object({
   chatId: z.number(),
   userId: z.number(),
})

export const hasMemberHandler = async (input: z.infer<typeof inputSchema>, db: Db) => {
   const chat = await db.chat.findUnique({
      where: { id: input.chatId },
      select: { members: { where: { id: input.userId } } },
   })

   return Boolean(chat?.members.length)
}

export default publicProcedure.input(inputSchema).query(async ({ input, ctx }) => {
   return hasMemberHandler(input, ctx.db)
})
