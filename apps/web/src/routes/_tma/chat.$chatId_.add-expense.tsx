import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

import AddExpensePage from '@components/features/Expense/AddExpensePage'

const searchSchema = z.object({
   prevSegment: z.enum(['balance', 'expense']).catch('balance'),
   currentFormStep: z.number().catch(0),
})

export const Route = createFileRoute('/_tma/chat/$chatId_/add-expense')({
   component: RouteComponent,
   validateSearch: zodValidator(searchSchema),
})

function RouteComponent() {
   const { chatId } = Route.useParams()
   return <AddExpensePage chatId={Number(chatId)} />
}
