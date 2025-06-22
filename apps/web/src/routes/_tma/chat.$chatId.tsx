import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

import { GroupPage } from '@components/features'

const searchSchema = z.object({
   selectedSegment: z.enum(['balance', 'expense']).catch('balance'),
})

export const Route = createFileRoute('/_tma/chat/$chatId')({
   component: ChatIdRoute,
   validateSearch: zodValidator(searchSchema),
})

function ChatIdRoute() {
   return <GroupPage />
}
