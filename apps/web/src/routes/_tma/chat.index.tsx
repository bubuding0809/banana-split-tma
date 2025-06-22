import { createFileRoute } from '@tanstack/react-router'

import { UserPage } from '@/components/features'

export const Route = createFileRoute('/_tma/chat/')({
   component: RouteComponent,
})

function RouteComponent() {
   return <UserPage />
}
