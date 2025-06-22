import { initData, themeParams, useSignal } from '@telegram-apps/sdk-react'
import {
   Avatar,
   Caption,
   Cell,
   type ImageProps,
   Info,
   Modal,
   Skeleton,
   Text,
} from '@telegram-apps/telegram-ui'
import { ModalHeader } from '@telegram-apps/telegram-ui/dist/components/Overlays/Modal/components/ModalHeader/ModalHeader'
import { type inferRouterOutputs } from '@trpc/server'
import { useMemo, useState } from 'react'

import { trpc } from '@utils/trpc'
import { AppRouter } from '@dko/trpc'


const splitModeMap = {
   EQUAL: 'Split equally',
   PERCENTAGE: 'Split by percentage',
   EXACT: 'Split exactly',
   SHARES: 'Split by shares',
} as const

interface ChatExpenseAvatarProps {
   userId: number
   size?: ImageProps['size']
}
const ChatExpenseAvatar = ({ userId, size = 24 }: ChatExpenseAvatarProps) => {
   const { data: photoUrl } = trpc.telegram.getUserProfilePhotoUrl.useQuery({
      userId,
   })

   if (!photoUrl) {
      return <Avatar size={size}>🐵</Avatar>
   }
   return <Avatar src={photoUrl} size={size} />
}

interface ChatExpenseCellProps {
   expense: inferRouterOutputs<AppRouter>['expense']['getExpenseByChat'][number]
}
const ChatExpenseCell = ({ expense }: ChatExpenseCellProps) => {
   const { creatorId, chatId } = expense
   const tUserData = useSignal(initData.user)
   const tButtonColor = useSignal(themeParams.buttonColor)
   const [modalOpen, setModalOpen] = useState(false)

   // * Queries ====================================================================================
   const { data: expenseDetails, isLoading: isExpenseDetailsLoading } =
      trpc.expense.getExpenseDetails.useQuery({
         expenseId: expense.id,
      })

   const { data: member, isLoading: isMemberLoading } = trpc.telegram.getChatMember.useQuery({
      chatId,
      userId: creatorId,
   })

   // * State ======================================================================================
   const userId = tUserData?.id ?? 0

   const memberFullName = `${member?.user.first_name}${
      member?.user.last_name ? ` ${member.user.last_name}` : ''
   }`

   // Determine the relation of the user to the expense (owner, borrower, unrelated)
   const expenseRelation = useMemo(() => {
      const ownerIsYou = member?.user.id === userId
      const isUnrelated =
         !ownerIsYou && !expenseDetails?.shares.some(share => share.userId === userId)

      switch (true) {
         case ownerIsYou:
            return 'owner'
         case isUnrelated:
            return 'unrelated'
         default:
            return 'borrower'
      }
   }, [expenseDetails?.shares, member?.user.id, userId])

   // Amount borrowed for this expense
   const borrowedAmount = useMemo(() => {
      if (expenseRelation !== 'borrower') return 0
      return (
         expenseDetails?.shares.reduce((acc, share) => {
            const isCreditor = share.userId === userId
            if (isCreditor) return acc + share.amount
            return acc
         }, 0) ?? 0
      )
   }, [userId, expenseDetails, expenseRelation])

   // Amount lent for this expense
   const lentAmount = useMemo(() => {
      if (expenseRelation !== 'owner') return 0
      return (
         expenseDetails?.shares.reduce((acc, share) => {
            const isDebtor = share.userId !== userId
            if (isDebtor) return acc + share.amount
            return acc
         }, 0) ?? 0
      )
   }, [expenseRelation, expenseDetails?.shares, userId])

   return (
      <>
         <Cell
            onClick={() => setModalOpen(true)}
            before={<ChatExpenseAvatar userId={creatorId} size={48} />}
            subhead={
               <Skeleton visible={isMemberLoading}>
                  <Caption
                     weight="1"
                     level="1"
                     style={{
                        color: expenseRelation === 'owner' ? tButtonColor : undefined,
                     }}
                  >
                     {expenseRelation === 'owner' ? 'You' : memberFullName} paid
                  </Caption>
               </Skeleton>
            }
            description={expense.description}
            after={
               <Info
                  avatarStack={
                     <Info type="text">
                        <div className="flex flex-col gap-1.5 items-end">
                           <Caption className="w-max" weight="2">
                              {new Date(expense.createdAt).toLocaleDateString('default', {
                                 month: 'short',
                                 day: 'numeric',
                              })}
                           </Caption>
                           <Skeleton visible={isExpenseDetailsLoading}>
                              {(() => {
                                 switch (expenseRelation) {
                                    case 'owner':
                                       return lentAmount === 0 ? (
                                          <Text weight="2">✅</Text>
                                       ) : (
                                          <Text weight="2" className="text-green-600">
                                             ${lentAmount.toFixed(2)}
                                          </Text>
                                       )
                                    case 'borrower':
                                       return borrowedAmount === 0 ? (
                                          <Text weight="2">✅</Text>
                                       ) : (
                                          <Text weight="2" className="text-red-600">
                                             ${borrowedAmount.toFixed(2)}
                                          </Text>
                                       )
                                    case 'unrelated':
                                       return <Text weight="2">~</Text>
                                    default:
                                       return null
                                 }
                              })()}
                           </Skeleton>
                           <Caption className="w-max">
                              {(() => {
                                 switch (expenseRelation) {
                                    case 'unrelated':
                                       return 'Unrelated'
                                    case 'borrower':
                                       return borrowedAmount === 0 ? 'Settled' : 'Borrowed'
                                    case 'owner':
                                       return lentAmount === 0 ? 'Settled' : 'Lent'
                                    default:
                                       return ''
                                 }
                              })()}
                           </Caption>
                        </div>
                     </Info>
                  }
                  type="avatarStack"
               />
            }
         >
            <span className="text-xs mr-0.5">$</span>
            {expense.amount.toFixed(2)}
         </Cell>
         <Modal
            open={modalOpen}
            onOpenChange={setModalOpen}
            header={<ModalHeader>Transaction details</ModalHeader>}
         >
            <div className="p-4">
               <div className="flex items-start gap-2 ">
                  <ChatExpenseAvatar userId={creatorId} />
                  <Text weight="2">{memberFullName}</Text>
               </div>
               <div className="flex items-start gap-2  mt-4">
                  <Text weight="2">Amount:</Text>
                  <Text>${expense.amount.toFixed(2)}</Text>
               </div>
               <div className="flex flex-col items-start gap-2 mt-2">
                  <Text weight="2">Description:</Text>
                  <Text>{expense.description}</Text>
               </div>
               <div className="flex items-start gap-2 mt-2">
                  <Text weight="2">Split mode:</Text>
                  <Text>{splitModeMap[expense.splitMode]}</Text>
               </div>
               <div className="flex items-start gap-2 mt-2">
                  <Text weight="2">Date:</Text>
                  <Text className="text-gray-300">
                     {new Date(expense.createdAt).toLocaleDateString('default', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                     })}
                  </Text>
               </div>
            </div>
         </Modal>
      </>
   )
}

export default ChatExpenseCell
