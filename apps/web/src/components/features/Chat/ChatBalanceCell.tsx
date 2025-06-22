import { useNavigate } from '@tanstack/react-router'
import { hapticFeedback, initData, mainButton, useSignal } from '@telegram-apps/sdk-react'
import { Avatar, Cell, Info, Modal, Placeholder } from '@telegram-apps/telegram-ui'
import { ModalHeader } from '@telegram-apps/telegram-ui/dist/components/Overlays/Modal/components/ModalHeader/ModalHeader'
import { type inferRouterOutputs } from '@trpc/server'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@utils/cn'


import { trpc } from '@/utils/trpc'
import { AppRouter } from '@dko/trpc'

const settleUpButtonLabel = 'Settle up 🤝'
const reminderButtonLabel = 'Remind 💬'

interface ChatBalanceCellProps {
   chatId: number
   member: NonNullable<inferRouterOutputs<AppRouter>['chat']['getChat']>['members'][0] & {
      balance: number
   }
}

const ChatBalanceCell = ({ chatId, member }: ChatBalanceCellProps) => {
   // * Hooks ======================================================================================
   const navigate = useNavigate()
   const mainButtonCleanup = useRef<ReturnType<typeof mainButton.onClick>>(null)
   const tUserData = useSignal(initData.user)

   //* State =======================================================================================
   const [modalOpen, setModalOpen] = useState(false)

   // * Variables ==================================================================================
   const userId = tUserData?.id ?? 0

   // * Queries ====================================================================================
   const { data: photoUrl } = trpc.telegram.getUserProfilePhotoUrl.useQuery({
      userId: member.id,
   })
   const { data: memberInfo } = trpc.telegram.getChatMember.useQuery({
      chatId,
      userId: member.id,
   })

   const { data: netBalance } = trpc.chat.getNetShare.useQuery({
      mainUserId: userId,
      targetUserId: member.id,
      chatId,
   })

   // * Effects ====================================================================================
   useEffect(() => {
      return () => {
         mainButtonCleanup.current?.()
         mainButton.setParams.ifAvailable({
            isVisible: false,
            isEnabled: false,
         })
      }
   }, [])

   // * Handlers ===================================================================================
   const handleCellClick = () => {
      if (netBalance === undefined) {
         return hapticFeedback.notificationOccurred.ifAvailable('error')
      }
      hapticFeedback.selectionChanged.ifAvailable()

      setModalOpen(true)

      const balanceType = netBalance < 0 ? 'toPay' : 'toReceive'

      mainButton.setParams.ifAvailable({
         text: balanceType === 'toPay' ? settleUpButtonLabel : reminderButtonLabel,
         isVisible: true,
         isEnabled: true,
      })

      mainButtonCleanup.current = mainButton.onClick(() => {
         if (balanceType === 'toPay') {
            return navigate({
               to: '/chat/$chatId/settle-debt/$userId',
               params: {
                  chatId: chatId.toString(),
                  userId: member.id.toString(),
               },
               search: prev => ({
                  ...prev,
                  title: '🤝 Settle debt',
               }),
            })
         } else {
            alert('Reminder sent!')
         }
      })
   }

   const handleOpenChange = (open: boolean) => {
      if (!open) {
         mainButton.setParams.ifAvailable({
            isVisible: false,
            isEnabled: false,
         })

         // Make sure to cleanup the button handlers when the modal is closed
         mainButtonCleanup.current?.()
      }

      setModalOpen(open)
   }

   const MemberAvatar = () => {
      if (!photoUrl) {
         return <Avatar size={48}>🐵</Avatar>
      }
      return <Avatar src={photoUrl} size={48} />
   }

   return (
      <>
         <Cell
            key={member.id}
            before={<MemberAvatar />}
            subtitle={memberInfo?.status ?? 'Not a chat member'}
            after={
               <Info
                  type="text"
                  subtitle={netBalance && netBalance < 0 ? 'To pay' : 'To receive'}
                  className={cn(netBalance && netBalance < 0 ? 'text-red-500' : 'text-green-500')}
               >
                  ${Math.abs(netBalance ?? 0)}
               </Info>
            }
            onClick={() => handleCellClick()}
         >
            {member.firstName} {member.lastName}
         </Cell>

         <Modal
            header={<ModalHeader>{member.username}</ModalHeader>}
            open={modalOpen}
            onOpenChange={handleOpenChange}
         >
            <Placeholder description="Description" header="Title">
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
         </Modal>
      </>
   )
}

export default ChatBalanceCell
