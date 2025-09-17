import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GroupPage } from "@components/features";
import { useStartParams } from "@/hooks";
import { trpc } from "@/utils/trpc";
import InvalidGroupScreen from "@/components/features/Chat/InvalidChatScreen";
import { Caption, Spinner } from "@telegram-apps/telegram-ui";

const searchSchema = z.object({
  selectedTab: z.enum(["balance", "transaction"]).catch("balance"),
  selectedExpense: z.string().optional(),
  showPayments: z.boolean().catch(true),
  relatedOnly: z.boolean().catch(true),
});

export const Route = createFileRoute("/_tma/chat/$chatId")({
  component: ChatIdRoute,
  validateSearch: zodValidator(searchSchema),
});

function ChatIdRoute() {
  const { chat_id } = useStartParams() ?? {};
  const chatId = Number(chat_id ?? 0);

  // Validate chat existence and handle errors
  const { data: dChatData, status: dChatDataStatus } =
    trpc.chat.getChat.useQuery({ chatId });

  if (dChatDataStatus === "pending") {
    return (
      <main className="flex h-[80vh] flex-col items-center justify-center gap-2.5 pb-4">
        <Spinner size="l" />
        <Caption weight="1">Preparing bananas</Caption>
      </main>
    );
  }

  if (dChatDataStatus === "error" || dChatData === undefined) {
    return <InvalidGroupScreen />;
  }

  // Render the main GroupPage component
  return <GroupPage chatData={dChatData} />;
}
