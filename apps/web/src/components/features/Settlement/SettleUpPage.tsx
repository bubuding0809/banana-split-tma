import { getRouteApi } from '@tanstack/react-router'
import { backButton } from '@telegram-apps/sdk-react'
import { useEffect } from 'react'

const routeApi = getRouteApi('/_tma/chat/$chatId_/settle-debt/$userId')

interface SettleUpPageProps {
   chatId: number
   userId: number
}

const SettleUpPage = ({ chatId, userId }: SettleUpPageProps) => {
   const { prevSegment } = routeApi.useSearch()
   const navigate = routeApi.useNavigate()

   useEffect(() => {
      const offClick = backButton.onClick(() => {
         navigate({
            to: '../..',
            search: {
               selectedSegment: prevSegment,
               title: '👥 Group',
            },
         })
      })
      backButton.show.ifAvailable()
      return () => {
         offClick()
         backButton.hide.ifAvailable()
      }
   }, [chatId, navigate, prevSegment])

   return (
      <div>
         SettleUpPage {chatId} - {userId}
      </div>
   )
}

export default SettleUpPage
