
import { z } from 'zod'
import { Db, publicProcedure } from '../../trpc.js'
import { ChatType } from '@dko/database'

export const inputSchema = z.object({
  chatId: z.number(),
  chatTitle: z.string(),
  chatType: z.string(),
  chatPhoto: z.string().nullish(),
})

export const createChatHandler = async (input: z.infer<typeof inputSchema>, db: Db) => {
  return db.chat.create({
    data: {
      id: input.chatId,
      title: input.chatTitle,
      type: input.chatType as ChatType,
      ...(input.chatPhoto && { photo: input.chatPhoto }),
    },
  })
}

export default publicProcedure.input(inputSchema).mutation(async ({ input, ctx }) => {
  return createChatHandler(input, ctx.db)
})
