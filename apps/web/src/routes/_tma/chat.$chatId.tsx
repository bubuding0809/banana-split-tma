import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GroupPage } from "@components/features";

const searchSchema = z.object({
  selectedTab: z.enum(["balance", "transaction"]).catch("balance"),
  selectedCurrency: z.string().catch("SGD"),
  selectedExpense: z.string().optional(),
  showPayments: z.boolean().catch(true),
  relatedOnly: z.boolean().catch(true),
});

export const Route = createFileRoute("/_tma/chat/$chatId")({
  component: ChatIdRoute,
  validateSearch: zodValidator(searchSchema),
});

function ChatIdRoute() {
  return <GroupPage />;
}
