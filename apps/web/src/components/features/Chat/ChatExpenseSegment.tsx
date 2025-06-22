import { Placeholder, Section, Subheadline } from '@telegram-apps/telegram-ui'
import { useMemo } from 'react'

import { trpc } from '@utils/trpc'

import ChatExpenseCell from './ChatExpenseCell'

interface ChatExpenseSegmentProps {
   chatId: number
}
const ChatExpenseSegment = ({ chatId }: ChatExpenseSegmentProps) => {
   // * Queries ====================================================================================
   const { data: expenses } = trpc.expense.getExpenseByChat.useQuery({
      chatId,
   })

   // * Effects ====================================================================================

   // * Data to render =============================================================================

   // Allocate expenses into month buckets then sort them by date
   const { groupedExpenses, sortedKeys } = useMemo(() => {
      // Group expenses by year - month
      const groupedExpenses =
         expenses?.reduce(
            (acc, curr) => {
               const expenseDate = new Date(curr.date)
               const year = expenseDate.getFullYear()
               const month = expenseDate.getMonth() + 1

               // Format: YYYY-MM
               const key = `${year}-${month.toString().padStart(2, '0')}`

               if (!acc[key]) {
                  acc[key] = []
               }

               acc[key].push({
                  ...curr,
               })

               return acc
            },
            {} as Record<string, typeof expenses>
         ) ?? {}

      // Sort expenses by date (descending)
      Object.entries(groupedExpenses).forEach(([key, value]) => {
         groupedExpenses[key] = value.sort((a, b) => {
            return new Date(b.date).getTime() - new Date(a.date).getTime()
         })
      })

      // Sort the keys (year-month) in descending order
      const sortedKeys = Object.keys(groupedExpenses).sort((a, b) => {
         return new Date(b).getTime() - new Date(a).getTime()
      })

      return {
         groupedExpenses,
         sortedKeys,
      }
   }, [expenses])

   return (
      <>
         {expenses?.length === 0 && (
            <Placeholder
               header="No expenses yet"
               description="Add an expense to keep track of your spendings"
            >
               <img
                  alt="Telegram sticker"
                  src="https://xelene.me/telegram.gif"
                  style={{
                     display: 'block',
                     height: '144px',
                     width: '144px',
                  }}
               />
            </Placeholder>
         )}

         {sortedKeys.map(key => {
            const expenses = groupedExpenses[key]
            const dateDisplay = new Date(key).toLocaleDateString('default', {
               month: 'long',
               year: 'numeric',
            })

            return (
               <Section
                  key={key}
                  header={
                     <div className="p-2">
                        <Subheadline weight="2">{dateDisplay}</Subheadline>
                     </div>
                  }
               >
                  {expenses.map(expense => (
                     <ChatExpenseCell key={expense.id} expense={expense} />
                  ))}
               </Section>
            )
         })}
      </>
   )
}

export default ChatExpenseSegment
