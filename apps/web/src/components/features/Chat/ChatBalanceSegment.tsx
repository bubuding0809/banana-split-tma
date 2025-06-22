import { initData, useSignal } from '@telegram-apps/sdk-react'
import { Section, Title } from '@telegram-apps/telegram-ui'



import ChatBalanceCell from './ChatBalanceCell'
import { trpc } from '@/utils/trpc'

interface ChatBalanceSegmentProps {
   chatId: number
}
const ChatBalanceSegment = ({ chatId }: ChatBalanceSegmentProps) => {
   // * Hooks ======================================================================================
   const tUserData = useSignal(initData.user)

   // * Variables ==================================================================================
   const userId = tUserData?.id ?? 0

   // * Queries ====================================================================================
   const { data: debtors } = trpc.chat.getDebtors.useQuery({ userId, chatId })
   const { data: creditors } = trpc.chat.getCreditors.useQuery({ userId, chatId })

   // * Effects ====================================================================================

   // * Handlers ===================================================================================

   return (
      <div className="flex flex-col gap-4">
         <Section
            header={
               <Title weight="2" className="py-2 px-1" level="3">
                  Owes you
               </Title>
            }
         >
            {debtors?.map(member => (
               <ChatBalanceCell key={member.id} member={member} chatId={chatId} />
            ))}
         </Section>
         <Section
            header={
               <Title weight="2" className="py-2 px-1" level="3">
                  You owe
               </Title>
            }
         >
            {creditors?.map(member => (
               <ChatBalanceCell key={member.id} member={member} chatId={chatId} />
            ))}
         </Section>
      </div>
   )
}

export default ChatBalanceSegment
