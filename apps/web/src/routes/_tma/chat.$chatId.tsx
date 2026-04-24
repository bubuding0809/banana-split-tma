import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  sortBy: z.enum(["date", "createdAt"]).catch("date"),
  sortOrder: z.enum(["asc", "desc"]).catch("desc"),
  // Multi-select category filter. Each entry is a category id, or the
  // synthetic "none" for Uncategorized. URL-backed so a filtered view
  // survives tab switches, deep links, and refresh.
  categoryFilters: z.array(z.string()).catch([]),
});

export const Route = createFileRoute("/_tma/chat/$chatId")({
  component: ChatIdRoute,
  validateSearch: zodValidator(searchSchema),
});

function ChatIdRoute() {
  const startParams = useStartParams();
  const { chat_id } = startParams ?? {};
  const chatId = Number(chat_id ?? 0);
  const navigate = useNavigate();

  // Handle entity deep links safely (prevent infinite redirect loops on 'back' navigation)
  useEffect(() => {
    // We use sessionStorage to flag that we've already consumed the deep link for this session.
    // This is necessary because Telegram's startParam is immutable for the lifecycle of the Mini App.
    const deepLinkConsumedKey = `deep_link_consumed_${startParams?.entity_id}`;

    if (
      startParams?.entity_type === "s" &&
      startParams?.entity_id &&
      !sessionStorage.getItem(deepLinkConsumedKey)
    ) {
      sessionStorage.setItem(deepLinkConsumedKey, "true");

      // Navigate to snapshots page and pass the ID in search params to auto-open modal
      navigate({
        to: "/chat/$chatId/snapshots",
        params: { chatId: chatId.toString() },
        search: { snapshotId: startParams.entity_id },
        replace: true,
      });
    }

    // Expense deep link — lands on the chat's transaction tab with the
    // specific expense scrolled into view and its details modal
    // auto-opened. The transaction tab's ChatTransactionTab watches
    // `selectedExpense` and calls `scrollToTransaction`; ChatExpenseCell
    // then auto-opens its modal when mounted with the matching id. Used
    // by the "View Expense" CTA on create + edit notifications posted
    // by the bot.
    if (
      startParams?.entity_type === "e" &&
      startParams?.entity_id &&
      !sessionStorage.getItem(deepLinkConsumedKey)
    ) {
      sessionStorage.setItem(deepLinkConsumedKey, "true");

      navigate({
        to: "/chat/$chatId",
        params: { chatId: chatId.toString() },
        search: {
          selectedTab: "transaction",
          selectedExpense: startParams.entity_id,
        },
        replace: true,
      });
    }
  }, [startParams?.entity_type, startParams?.entity_id, chatId, navigate]);

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
